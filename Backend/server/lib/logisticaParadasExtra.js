// lib/logisticaParadasExtra.js
//
// Paradas que un viaje puede tener además de portones - pedido explícito del
// usuario, ej. alojamiento de la cuadrilla en un viaje largo ("Hotel San
// Vicente"). Se cargan pegando un link de Google Maps (mismo mecanismo de
// resolución de coordenadas que ya usan los portones - geocoding.js) y
// quedan guardadas en un catálogo reutilizable: la próxima vez que arman un
// viaje, el mismo hotel aparece para elegir en vez de tener que volver a
// pegar la URL.
//
// `orden` de logistica_viaje_paradas_extra vive en el MISMO espacio numérico
// que logistica_viaje_portones.orden (ver nextOrdenViaje) para poder
// mezclar portones y paradas extra en una sola secuencia de ruta - se
// interlean por orden en cualquier lugar que arma "la ruta completa" de un
// viaje (mensaje, detección de zonas, mapa).
const { pool } = require('../db');
const { resolveQuoteCoords } = require('./geocoding');

// resolveQuoteCoords ya encadena: coords embebidas en el maps_url -> resuelve
// el redirect si es un link corto (maps.app.goo.gl) -> geocodifica dirección
// (acá no aplica, no hay address/city, así que ese último paso se salta solo).
async function resolveUrlCoords(mapsUrl) {
  const url = String(mapsUrl || '').trim();
  if (!url) return null;
  return await resolveQuoteCoords({ maps_url: url }).catch(() => null);
}

// ===========================================================================
// Catálogo (reutilizable entre viajes)
// ===========================================================================

async function listPuntosExtra() {
  const { rows } = await pool.query(
    `select id, nombre, maps_url, lat, lng, activo, created_at, updated_at
       from public.logistica_puntos_extra
      order by nombre asc;`
  );
  return rows;
}

async function crearPuntoExtra({ nombre, maps_url }) {
  const nm = String(nombre || '').trim();
  const url = String(maps_url || '').trim();
  if (!nm) throw new Error('Falta nombre');
  if (!url) throw new Error('Falta maps_url');
  const coords = await resolveUrlCoords(url);
  const { rows } = await pool.query(
    `insert into public.logistica_puntos_extra (nombre, maps_url, lat, lng)
     values ($1, $2, $3, $4)
     returning id, nombre, maps_url, lat, lng, activo, created_at, updated_at;`,
    [nm, url, coords?.lat ?? null, coords?.lng ?? null]
  );
  return rows[0];
}

async function updatePuntoExtra(id, { nombre, maps_url, activo }) {
  const sets = [];
  const params = [Number(id)];
  if (nombre !== undefined) { params.push(String(nombre || '').trim()); sets.push(`nombre = $${params.length}`); }
  if (activo !== undefined) { params.push(!!activo); sets.push(`activo = $${params.length}`); }
  if (maps_url !== undefined) {
    const url = String(maps_url || '').trim();
    if (!url) throw new Error('maps_url no puede quedar vacío');
    const coords = await resolveUrlCoords(url);
    params.push(url); sets.push(`maps_url = $${params.length}`);
    params.push(coords?.lat ?? null); sets.push(`lat = $${params.length}`);
    params.push(coords?.lng ?? null); sets.push(`lng = $${params.length}`);
  }
  if (!sets.length) throw new Error('Nada para actualizar');
  sets.push('updated_at = now()');
  const { rows, rowCount } = await pool.query(
    `update public.logistica_puntos_extra set ${sets.join(', ')} where id = $1
     returning id, nombre, maps_url, lat, lng, activo, created_at, updated_at;`,
    params
  );
  if (!rowCount) throw new Error('Punto no encontrado');
  return rows[0];
}

async function deletePuntoExtra(id) {
  // ON DELETE CASCADE en logistica_viaje_paradas_extra: sale de cualquier
  // viaje que lo tuviera asignado (igual que borrar una zona saca sus
  // referencias, mismo patrón ya usado en este módulo).
  await pool.query(`delete from public.logistica_puntos_extra where id = $1;`, [Number(id)]);
}

// ===========================================================================
// Asignación por viaje
// ===========================================================================

async function nextOrdenViaje(viajeId) {
  const { rows } = await pool.query(
    `select greatest(
        coalesce((select max(orden) from public.logistica_viaje_portones where viaje_id = $1), -1),
        coalesce((select max(orden) from public.logistica_viaje_paradas_extra where viaje_id = $1), -1)
      ) + 1 as next_orden;`,
    [Number(viajeId)]
  );
  return rows[0].next_orden;
}

async function listParadasExtraViaje(viajeId) {
  const { rows } = await pool.query(
    `select vp.id, vp.punto_extra_id, vp.orden, p.nombre, p.maps_url, p.lat, p.lng
       from public.logistica_viaje_paradas_extra vp
       join public.logistica_puntos_extra p on p.id = vp.punto_extra_id
      where vp.viaje_id = $1
      order by vp.orden asc;`,
    [Number(viajeId)]
  );
  return rows;
}

async function asignarParadaExtra(viajeId, puntoExtraId) {
  const vId = Number(viajeId);
  const pId = Number(puntoExtraId);
  if (!Number.isInteger(pId)) throw new Error('Falta punto_extra_id');
  const orden = await nextOrdenViaje(vId);
  await pool.query(
    `insert into public.logistica_viaje_paradas_extra (viaje_id, punto_extra_id, orden)
     values ($1, $2, $3)
     on conflict (viaje_id, punto_extra_id) do nothing;`,
    [vId, pId, orden]
  );
  return listParadasExtraViaje(vId);
}

async function desasignarParadaExtra(viajeId, puntoExtraId) {
  await pool.query(
    `delete from public.logistica_viaje_paradas_extra where viaje_id = $1 and punto_extra_id = $2;`,
    [Number(viajeId), Number(puntoExtraId)]
  );
  return listParadasExtraViaje(viajeId);
}

module.exports = {
  resolveUrlCoords,
  listPuntosExtra, crearPuntoExtra, updatePuntoExtra, deletePuntoExtra,
  listParadasExtraViaje, asignarParadaExtra, desasignarParadaExtra,
};

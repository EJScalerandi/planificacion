// lib/logisticaRutaZonas.js
//
// Zonas que una RUTA atraviesa - distinto de la clasificación por portón que
// ya hace logisticaZonificacion.js (esa sigue igual, se usa para agrupar
// pendientes por cercanía antes de armar el viaje). Acá es al revés: dado un
// viaje YA armado (depósito -> paradas en orden de ruta), se detecta por qué
// zonas pasa el CORREDOR completo, no solo las paradas - pedido explícito
// del usuario: un viaje a Bahía Blanca puede pasar por Santa Fe o General
// Pico de La Pampa sin tener ninguna parada ahí, y quiere que el sistema lo
// detecte para poder habilitar esa zona como "cupo de entrega disponible"
// en una integración futura con el Presupuestador (el campo `habilitada` ya
// se guarda acá, todavía no se usa en ningún lado más).
//
// Método: se muestrea cada tramo (depósito->parada1, parada1->parada2, ...)
// cada PASO_MUESTREO_KM en línea recta (mismo criterio ya usado en toda la
// app - "línea recta, no la ruta real por camino", ver logisticaIaRecomendacion.js)
// y se clasifica cada punto muestreado con la misma lógica de "referencia
// más cercana" que ya usa logisticaZonificacion.js. La unión de zonas
// encontradas es "las zonas que la ruta atraviesa".
const { pool } = require('../db');
const { clasificarZonas, haversineKm } = require('./logisticaZonificacion');
const { DEPOSITO } = require('./logisticaDeposito');
const { resolveCoordsForNvs } = require('./logisticaMapa');

const PASO_MUESTREO_KM = 15;

function interpolar(a, b, t) {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

function muestrearTramo(a, b) {
  const distKm = haversineKm(a.lat, a.lng, b.lat, b.lng);
  const pasos = Math.max(1, Math.ceil(distKm / PASO_MUESTREO_KM));
  const puntos = [];
  for (let i = 0; i <= pasos; i++) puntos.push(interpolar(a, b, i / pasos));
  return puntos;
}

/**
 * @param {Array<{lat:number, lng:number}>} puntosEnOrden - ej. [depósito, parada1, parada2, ...]
 * @returns {Promise<Array<{zona_id:number, zona_nombre:string}>>} zonas únicas que el corredor atraviesa
 */
async function detectarZonasDeRuta(puntosEnOrden) {
  const validos = (puntosEnOrden || []).filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng));
  if (!validos.length) return [];

  const muestras = [];
  for (let i = 0; i < validos.length - 1; i++) muestras.push(...muestrearTramo(validos[i], validos[i + 1]));
  if (validos.length === 1) muestras.push(validos[0]);

  const clasificaciones = await clasificarZonas(muestras);

  const vistos = new Map();
  for (const c of clasificaciones) {
    if (!c) continue;
    if (!vistos.has(c.zona_id)) vistos.set(c.zona_id, c.zona_nombre);
  }
  return Array.from(vistos.entries()).map(([zona_id, zona_nombre]) => ({ zona_id, zona_nombre }));
}

/**
 * Zonas guardadas de un viaje (con su habilitada actual).
 * @returns {Promise<Array<{zona_id:number, zona_nombre:string, habilitada:boolean}>>}
 */
async function listZonasViaje(viajeId) {
  const { rows } = await pool.query(
    `select vz.zona_id, z.nombre as zona_nombre, vz.habilitada
       from public.logistica_viaje_zonas vz
       join public.logistica_zonas z on z.id = vz.zona_id
      where vz.viaje_id = $1
      order by z.nombre asc;`,
    [Number(viajeId)]
  );
  return rows;
}

/**
 * Recalcula el corredor de un viaje (depósito + sus paradas en orden real) y
 * sincroniza logistica_viaje_zonas: agrega las zonas nuevas (habilitada=true
 * por defecto), saca las que ya no aplican, y NO toca el habilitada de las
 * que siguen aplicando - así una zona que el usuario deshabilitó a mano no
 * se resetea sola con cada cambio de ruta (asignar/reordenar/sacar portón).
 * @returns {Promise<Array<{zona_id:number, zona_nombre:string, habilitada:boolean}>>}
 */
async function sincronizarZonasViaje(viajeId) {
  const vId = Number(viajeId);
  const { rows: items } = await pool.query(
    `select p.nv, vp.orden
       from public.logistica_viaje_portones vp
       join public.portones p on p.id = vp.porton_id
      where vp.viaje_id = $1
      order by vp.orden asc, p.nv asc;`,
    [vId]
  );

  const nvsEnOrden = [];
  const vistos = new Set();
  for (const r of items) {
    if (vistos.has(r.nv)) continue;
    vistos.add(r.nv);
    nvsEnOrden.push(r.nv);
  }

  const puntos = nvsEnOrden.length ? await resolveCoordsForNvs(nvsEnOrden) : [];
  const puntosByNv = new Map(puntos.map((p) => [p.nv, p]));
  const ruta = [{ lat: DEPOSITO.lat, lng: DEPOSITO.lng }];
  for (const nv of nvsEnOrden) {
    const p = puntosByNv.get(nv);
    if (p && p.lat != null && p.lng != null) ruta.push({ lat: p.lat, lng: p.lng });
  }

  // Sin ninguna parada con ubicación resuelta, no hay corredor que detectar
  // (el depósito solo no atraviesa nada) - se limpia lo que hubiera.
  const zonas = ruta.length > 1 ? await detectarZonasDeRuta(ruta) : [];
  const zonaIds = zonas.map((z) => z.zona_id);

  if (zonaIds.length) {
    await pool.query(
      `insert into public.logistica_viaje_zonas (viaje_id, zona_id, habilitada)
       select $1, unnest($2::int[]), true
       on conflict (viaje_id, zona_id) do nothing;`,
      [vId, zonaIds]
    );
    await pool.query(
      `delete from public.logistica_viaje_zonas where viaje_id = $1 and zona_id <> all($2::int[]);`,
      [vId, zonaIds]
    );
  } else {
    await pool.query(`delete from public.logistica_viaje_zonas where viaje_id = $1;`, [vId]);
  }

  return listZonasViaje(vId);
}

async function setZonaHabilitada(viajeId, zonaId, habilitada) {
  await pool.query(
    `update public.logistica_viaje_zonas set habilitada = $3 where viaje_id = $1 and zona_id = $2;`,
    [Number(viajeId), Number(zonaId), !!habilitada]
  );
  return listZonasViaje(viajeId);
}

module.exports = { detectarZonasDeRuta, sincronizarZonasViaje, listZonasViaje, setZonaHabilitada };

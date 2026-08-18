// lib/logisticaIaContexto.js
//
// Arma el contexto de un conjunto de NV para el motor de recomendación de
// rutas (Fase 1): ubicación + zona (server/lib/logisticaMapa.js), datos de
// negocio del portón (sistema, fechas) y qué regla de envío le aplica (si
// alguna), con la fecha desde la que queda habilitado a despacharse. Todo
// esto se calcula acá en código - la IA lo recibe como dato ya resuelto, no
// se le pide que calcule fechas ni distancias.
const { pool } = require('../db');
const { resolveCoordsForNvs } = require('./logisticaMapa');
const { haversineKm } = require('./logisticaZonificacion');
const { computePeso } = require('./logisticaCapacidad');
const db = require('./logisticaViajesDb');

// Portones sin viaje asignado (cualquier semana) + ubicación/zona resuelta.
// Compartido por el endpoint de mapa de selección y por la planificación
// automática por zona.
async function listarPortonesSinViajeConUbicacion() {
  const pendientes = await db.listPortonesSinViaje();
  const puntos = await resolveCoordsForNvs(pendientes.map((p) => p.nv));
  const coordsByNv = new Map(puntos.map((p) => [p.nv, p]));
  return pendientes.map((p) => ({ ...p, ...coordsByNv.get(p.nv) }));
}

async function fetchPortonesDataForNvs(nvs) {
  const { rows } = await pool.query(
    `select distinct on (p.nv)
       p.nv, p.sistema,
       to_char(p.fecha_nv,   'YYYY-MM-DD') as fecha_nv,
       to_char(p.fecha_med,  'YYYY-MM-DD') as fecha_med,
       to_char(p.fecha_prod, 'YYYY-MM-DD') as fecha_prod,
       pv.data->>'Alto' as alto,
       pv.data->>'Ancho' as ancho
     from public.portones p
     left join public.preproduccion_valores pv on pv.nv = p.nv and pv.nv_tipo = 'NV'
     where p.nv = any($1::int[])
     order by p.nv, p.nlista asc;`,
    [nvs]
  );
  return new Map(rows.map((r) => [r.nv, r]));
}

async function fetchReglasEnvioActivas() {
  const { rows } = await pool.query(
    `select id, nombre, dias_minimos, fecha_referencia_campo, campo, operador, valor, prioridad
     from public.logistica_reglas_envio where activo is true order by prioridad asc, id asc;`
  );
  return rows;
}

function evaluaCondicion(valorPorton, operador, valorRegla) {
  const a = String(valorPorton ?? '').trim().toLowerCase();
  const b = String(valorRegla ?? '').trim().toLowerCase();
  const na = Number(valorPorton);
  const nb = Number(valorRegla);
  const sonNumeros = Number.isFinite(na) && Number.isFinite(nb);
  switch (operador) {
    case '!=': return a !== b;
    case '>': return sonNumeros ? na > nb : a > b;
    case '>=': return sonNumeros ? na >= nb : a >= b;
    case '<': return sonNumeros ? na < nb : a < b;
    case '<=': return sonNumeros ? na <= nb : a <= b;
    case '=':
    default: return a === b;
  }
}

// Primera regla activa (por prioridad) que matchee - null campo = regla base,
// aplica siempre.
function reglaAplicable(portonData, reglas) {
  for (const r of reglas) {
    if (!r.campo) return r;
    if (evaluaCondicion(portonData?.[r.campo], r.operador, r.valor)) return r;
  }
  return null;
}

function sumarDias(fechaISO, dias) {
  if (!fechaISO) return null;
  const d = new Date(`${fechaISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(dias || 0));
  return d.toISOString().slice(0, 10);
}

/**
 * @param {number[]} nvs
 * @returns {Promise<{ portones: Array, distancias_km: Array<{de:number,a:number,km:number}> }>}
 */
async function construirContexto(nvs) {
  const [puntos, portonesData, reglas, reglasCapacidad] = await Promise.all([
    resolveCoordsForNvs(nvs),
    fetchPortonesDataForNvs(nvs),
    fetchReglasEnvioActivas(),
    db.listReglasCapacidad(),
  ]);

  const hoy = new Date().toISOString().slice(0, 10);

  const portones = puntos.map((p) => {
    const datos = portonesData.get(p.nv) || {};
    const regla = reglaAplicable(datos, reglas);
    const fechaRef = regla ? datos[regla.fecha_referencia_campo] : null;
    const fechaHabilitada = regla ? sumarDias(fechaRef, regla.dias_minimos) : null;
    const { peso } = computePeso({ alto: datos.alto, ancho: datos.ancho }, reglasCapacidad);
    return {
      nv: p.nv,
      nombre_cliente: p.nombre,
      direccion: p.direccion,
      lat: p.lat,
      lng: p.lng,
      zona: p.zona?.zona_nombre || null,
      sistema: datos.sistema || null,
      peso_capacidad: peso,
      regla_envio_aplicada: regla?.nombre || null,
      fecha_habilitada_despacho: fechaHabilitada,
      cumple_regla_envio: fechaHabilitada ? fechaHabilitada <= hoy : true,
    };
  });

  const conUbicacion = portones.filter((p) => p.lat != null && p.lng != null);
  const distancias_km = [];
  for (let i = 0; i < conUbicacion.length; i++) {
    for (let j = i + 1; j < conUbicacion.length; j++) {
      const a = conUbicacion[i];
      const b = conUbicacion[j];
      distancias_km.push({ de: a.nv, a: b.nv, km: Math.round(haversineKm(a.lat, a.lng, b.lat, b.lng) * 10) / 10 });
    }
  }

  return { portones, distancias_km };
}

module.exports = { construirContexto, listarPortonesSinViajeConUbicacion };

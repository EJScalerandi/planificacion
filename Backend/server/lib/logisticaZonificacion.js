// lib/logisticaZonificacion.js
//
// Clasificación determinística de zona por ubicación (Fase 0 del motor de
// logística IA). Cada zona (public.logistica_zonas) tiene una o más
// "referencias" (localidades geocodificadas, ej. Zona Sur 1 = Rosario + Bs
// As, cargadas desde la UI vía geocoding.js). Un portón se clasifica por la
// referencia más cercana en línea recta (haversine) — simple, gratis,
// instantáneo y siempre da el mismo resultado para la misma coordenada, a
// diferencia de pedirle a un LLM que decida la zona en cada llamado.
const { pool } = require('../db');

const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

async function listReferenciasActivas() {
  const { rows } = await pool.query(
    `select r.id, r.zona_id, r.nombre, r.lat, r.lng, z.nombre as zona_nombre
       from public.logistica_zona_referencias r
       join public.logistica_zonas z on z.id = r.zona_id
      where z.activo is true;`
  );
  return rows;
}

/**
 * @param {number} lat
 * @param {number} lng
 * @param {Array} [referencias] - opcional, para clasificar muchos puntos sin repetir la query.
 * @returns {Promise<{ zona_id:number, zona_nombre:string, referencia_nombre:string, distancia_km:number } | null>}
 */
async function clasificarZona(lat, lng, referencias) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const refs = referencias || (await listReferenciasActivas());
  if (!refs.length) return null;

  let best = null;
  for (const r of refs) {
    const d = haversineKm(lat, lng, Number(r.lat), Number(r.lng));
    if (!best || d < best.distancia_km) {
      best = { zona_id: r.zona_id, zona_nombre: r.zona_nombre, referencia_nombre: r.nombre, distancia_km: d };
    }
  }
  return best;
}

/**
 * Clasifica varios puntos de una sola vez (una sola query de referencias).
 * @param {Array<{ lat:number, lng:number }>} puntos
 */
async function clasificarZonas(puntos) {
  const refs = await listReferenciasActivas();
  return Promise.all(puntos.map((p) => clasificarZona(p.lat, p.lng, refs)));
}

module.exports = { haversineKm, clasificarZona, clasificarZonas, listReferenciasActivas };

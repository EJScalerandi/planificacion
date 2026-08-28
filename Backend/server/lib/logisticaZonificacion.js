// lib/logisticaZonificacion.js
//
// Clasificación determinística de zona por ubicación (Fase 0 del motor de
// logística IA). Dos formas de definir una zona (public.logistica_zonas),
// compatibles entre sí:
//   1) Polígono dibujado a mano en el mapa ("pintar zonas a gusto", pedido
//      del usuario) - un punto que cae ADENTRO del polígono se clasifica ahí,
//      sin importar la distancia. Se prueba primero.
//   2) Una o más "referencias" (localidades geocodificadas, ej. Zona Sur 1 =
//      Rosario + Bs As) - un punto se clasifica por la referencia más
//      cercana en línea recta (haversine). Fallback para los puntos que no
//      caen en ningún polígono, y para las zonas viejas que todavía no
//      tienen polígono cargado.
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

// Ray casting estándar - poligono: [[lat,lng], ...], sin cerrar el anillo.
function puntoEnPoligono(lat, lng, poligono) {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [latI, lngI] = poligono[i];
    const [latJ, lngJ] = poligono[j];
    const cruza = (lngI > lng) !== (lngJ > lng)
      && lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI;
    if (cruza) dentro = !dentro;
  }
  return dentro;
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

async function listPoligonosActivos() {
  const { rows } = await pool.query(
    `select id as zona_id, nombre as zona_nombre, poligono
       from public.logistica_zonas
      where activo is true and poligono is not null;`
  );
  return rows;
}

/**
 * @param {number} lat
 * @param {number} lng
 * @param {{ poligonos?:Array, referencias?:Array }} [opts] - opcional, para clasificar muchos puntos sin repetir las queries.
 * @returns {Promise<{ zona_id:number, zona_nombre:string, referencia_nombre:string|null, distancia_km:number, metodo:'poligono'|'referencia' } | null>}
 */
async function clasificarZona(lat, lng, opts) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const poligonos = opts?.poligonos || (await listPoligonosActivos());

  for (const z of poligonos) {
    if (puntoEnPoligono(lat, lng, z.poligono)) {
      return { zona_id: z.zona_id, zona_nombre: z.zona_nombre, referencia_nombre: null, distancia_km: 0, metodo: 'poligono' };
    }
  }

  const referencias = opts?.referencias || (await listReferenciasActivas());
  if (!referencias.length) return null;

  let best = null;
  for (const r of referencias) {
    const d = haversineKm(lat, lng, Number(r.lat), Number(r.lng));
    if (!best || d < best.distancia_km) {
      best = { zona_id: r.zona_id, zona_nombre: r.zona_nombre, referencia_nombre: r.nombre, distancia_km: d, metodo: 'referencia' };
    }
  }
  return best;
}

/**
 * Clasifica varios puntos de una sola vez (una sola query de polígonos + una de referencias).
 * @param {Array<{ lat:number, lng:number }>} puntos
 */
async function clasificarZonas(puntos) {
  const [poligonos, referencias] = await Promise.all([listPoligonosActivos(), listReferenciasActivas()]);
  return Promise.all(puntos.map((p) => clasificarZona(p.lat, p.lng, { poligonos, referencias })));
}

module.exports = { haversineKm, puntoEnPoligono, clasificarZona, clasificarZonas, listReferenciasActivas, listPoligonosActivos };

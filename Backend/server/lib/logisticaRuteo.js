// lib/logisticaRuteo.js
//
// Ruta REAL por calle (no línea recta) - pedido explícito del usuario: "que
// la ruta respete las rutas reales, donde se mueve el camión". Hasta ahora
// TODO el mapa (líneas de ruta, distancias, detección de zonas) usaba línea
// recta - documentado así en varios lugares del código (logisticaRutaZonas.js,
// logisticaIaRecomendacion.js). Esto reemplaza SOLO la línea dibujada en el
// mapa y la distancia/duración real de cada viaje - la detección de zonas
// del corredor y las distancias que recibe la IA de recomendación siguen en
// línea recta por ahora (alcance acordado con el usuario, no tocado acá).
//
// Proveedor: OpenRouteService (openrouteservice.org) - gratis (2000
// rutas/día), basado en OpenStreetMap, mismo espíritu que el resto de la app
// (tiles OSM, geocoding con Nominatim, sin depender de Google). Perfil
// driving-hgv (heavy goods vehicle / camión de carga) en vez de driving-car:
// más realista para el transporte de portones (evita restricciones de peso/
// altura que sí aplicarían a un camión y no a un auto).
const axios = require('axios');
const { pool } = require('../db');
const { construirRutaViaje } = require('./logisticaRutaZonas');

const ORS_API_KEY = process.env.ORS_API_KEY;
const ORS_URL = 'https://api.openrouteservice.org/v2/directions/driving-hgv/geojson';

/**
 * @param {Array<{lat:number, lng:number}>} puntosEnOrden - depósito primero, después cada parada en orden de ruta
 * @returns {Promise<{ geometria: Array<[number,number]>, distancia_km:number, duracion_horas:number } | null>}
 *   geometria en [lat,lng] (formato Leaflet) - ORS devuelve [lng,lat], se invierte acá.
 */
async function calcularRutaReal(puntosEnOrden) {
  if (!ORS_API_KEY) return null;
  const validos = (puntosEnOrden || []).filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng));
  if (validos.length < 2) return null;

  try {
    const { data } = await axios.post(
      ORS_URL,
      { coordinates: validos.map((p) => [p.lng, p.lat]) }, // ORS quiere [lng, lat]
      { headers: { Authorization: ORS_API_KEY, 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    const feature = data?.features?.[0];
    if (!feature) return null;
    const geometria = (feature.geometry?.coordinates || []).map(([lng, lat]) => [lat, lng]);
    const summary = feature.properties?.summary;
    return {
      geometria,
      distancia_km: summary?.distance != null ? Math.round((summary.distance / 1000) * 10) / 10 : null,
      duracion_horas: summary?.duration != null ? Math.round((summary.duration / 3600) * 100) / 100 : null,
    };
  } catch (e) {
    // No romper el flujo del viaje por un problema de la API externa (rate
    // limit, timeout, puntos no ruteables) - se cachea "sin ruta real" y el
    // mapa cae al dibujo en línea recta de siempre.
    console.error('OpenRouteService error:', e.response?.status, e.response?.data || e.message);
    return null;
  }
}

/**
 * Recalcula y cachea la ruta real de un viaje ya guardado - mismo trigger
 * que sincronizarZonasViaje (cualquier cambio de paradas/orden).
 * @returns {Promise<{ geometria:Array, distancia_km:number, duracion_horas:number, calculada_at:string } | null>}
 */
async function sincronizarRutaReal(viajeId) {
  const vId = Number(viajeId);
  const ruta = await construirRutaViaje(vId);

  if (ruta.length < 2) {
    await pool.query(`update public.logistica_viajes set ruta_real = null where id = $1;`, [vId]);
    return null;
  }

  const resultado = await calcularRutaReal(ruta);
  const guardado = resultado ? { ...resultado, calculada_at: new Date().toISOString() } : null;
  await pool.query(
    `update public.logistica_viajes set ruta_real = $2 where id = $1;`,
    [vId, guardado ? JSON.stringify(guardado) : null]
  );
  return guardado;
}

module.exports = { calcularRutaReal, sincronizarRutaReal };

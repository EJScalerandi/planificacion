// lib/servicioTecnicoMapaGeo.js
//
// Resuelve (y cachea) coordenadas para los items de Servicio Técnico. Dos
// fuentes según el tipo:
//   - 'medicion': fila de presupuestador_quotes, ya se le pide por id (no
//     por NV como logisticaMapa.js - acá ya sabemos el quote_id exacto). El
//     cache es el mismo geo_lat/geo_lng que ya usa Logística, se reutiliza.
//   - 'solicitud': fila de servicio_tecnico_solicitudes (maps_url cargado a
//     mano por Diego, o autocompletado al vincular un NV) - cache propio en
//     sus columnas geo_* (ver migration_servicio_tecnico_ia.sql).
const { pool } = require('../db');
const { resolveQuoteCoords } = require('./geocoding');

async function resolveCoordsForQuoteIds(quoteIds) {
  const ids = Array.from(new Set((quoteIds || []).filter(Boolean)));
  if (!ids.length) return new Map();

  const { rows } = await pool.query(
    `select id, end_customer, geo_lat, geo_lng, geo_source
     from public.presupuestador_quotes where id = any($1::uuid[]);`,
    [ids]
  );

  const entries = await Promise.all(rows.map(async (q) => {
    const ec = q.end_customer || {};
    let lat = q.geo_lat != null ? Number(q.geo_lat) : null;
    let lng = q.geo_lng != null ? Number(q.geo_lng) : null;
    let source = q.geo_source || null;
    if (lat == null || lng == null) {
      const resolved = await resolveQuoteCoords(ec).catch(() => null);
      lat = resolved?.lat ?? null;
      lng = resolved?.lng ?? null;
      source = resolved?.source ?? 'failed';
      pool.query(
        `update public.presupuestador_quotes set geo_lat=$2, geo_lng=$3, geo_source=$4, geo_updated_at=now() where id=$1;`,
        [q.id, lat, lng, source]
      ).catch(() => {});
    }
    return [q.id, { lat, lng, source }];
  }));
  return new Map(entries);
}

async function resolveCoordsForSolicitudIds(solicitudIds) {
  const ids = Array.from(new Set((solicitudIds || []).map((n) => Number(n)).filter(Number.isInteger)));
  if (!ids.length) return new Map();

  const { rows } = await pool.query(
    `select id, maps_url, direccion, geo_lat, geo_lng, geo_source
     from public.servicio_tecnico_solicitudes where id = any($1::int[]);`,
    [ids]
  );

  const entries = await Promise.all(rows.map(async (s) => {
    let lat = s.geo_lat != null ? Number(s.geo_lat) : null;
    let lng = s.geo_lng != null ? Number(s.geo_lng) : null;
    let source = s.geo_source || null;
    if (lat == null || lng == null) {
      const resolved = await resolveQuoteCoords({ maps_url: s.maps_url, address: s.direccion, city: '' }).catch(() => null);
      lat = resolved?.lat ?? null;
      lng = resolved?.lng ?? null;
      source = resolved?.source ?? 'failed';
      pool.query(
        `update public.servicio_tecnico_solicitudes set geo_lat=$2, geo_lng=$3, geo_source=$4, geo_updated_at=now() where id=$1;`,
        [s.id, lat, lng, source]
      ).catch(() => {});
    }
    return [s.id, { lat, lng, source }];
  }));
  return new Map(entries);
}

module.exports = { resolveCoordsForQuoteIds, resolveCoordsForSolicitudIds };

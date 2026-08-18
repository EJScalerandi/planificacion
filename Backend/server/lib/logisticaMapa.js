// lib/logisticaMapa.js
//
// Resuelve (y cachea) los puntos de mapa de una lista de NV, para el "Ver
// mapa" de Logística de Viajes / Planificación de Fechas: un pin por NV
// (deduplicado - despacho e instalación del mismo NV son el mismo domicilio).
const { pool } = require('../db');
const { resolveQuoteCoords } = require('./geocoding');

// Igual patrón prefijo-agnóstico que ya usan routes/public/portones.js y
// routes/external/ia.js: el prefijo de letras no siempre es "NV" (también
// NP/INP/INV/ONV/PLNP/PLNV/PNP según el tipo de orden en Odoo), pero el
// número siempre es el NV.
async function fetchQuotesForNvs(nvList) {
  const { rows } = await pool.query(
    `
    with wanted as (
      select unnest($1::int[]) as nv
    ),
    matched as (
      select distinct on (w.nv)
        w.nv as nv,
        q.id as quote_id,
        q.end_customer,
        q.geo_lat, q.geo_lng, q.geo_source, q.geo_updated_at
      from wanted w
      join public.presupuestador_quotes q
        on q.quote_kind = 'original'
       and (
         q.final_sale_order_name  ~ ('^[A-Za-z]*' || w.nv::text || '$')
         or q.odoo_sale_order_name ~ ('^[A-Za-z]*' || w.nv::text || '$')
       )
      order by w.nv, q.measurement_scheduled_for desc nulls last
    )
    select * from matched;
    `,
    [nvList]
  );
  return rows;
}

async function cacheCoords(quoteId, coords) {
  await pool.query(
    `update public.presupuestador_quotes
        set geo_lat = $2, geo_lng = $3, geo_source = $4, geo_updated_at = now()
      where id = $1;`,
    [quoteId, coords?.lat ?? null, coords?.lng ?? null, coords?.source ?? 'failed']
  );
}

/**
 * @param {number[]} nvList
 * @returns {Promise<Array<{ nv:number, lat:number|null, lng:number|null, source:string|null, nombre:string|null, direccion:string|null, maps_url:string|null }>>}
 */
async function resolveCoordsForNvs(nvList) {
  const nvs = Array.from(new Set((nvList || []).map((n) => Number(n)).filter(Number.isInteger)));
  if (!nvs.length) return [];

  const quotes = await fetchQuotesForNvs(nvs);

  const results = await Promise.all(
    quotes.map(async (q) => {
      const ec = q.end_customer || {};
      const nombre = ec.name || null;
      const direccion = [ec.address, ec.city].filter(Boolean).join(' - ') || null;
      const maps_url = ec.maps_url || null;

      let lat = q.geo_lat != null ? Number(q.geo_lat) : null;
      let lng = q.geo_lng != null ? Number(q.geo_lng) : null;
      let source = q.geo_source || null;

      if (lat == null || lng == null) {
        const resolved = await resolveQuoteCoords(ec).catch(() => null);
        lat = resolved?.lat ?? null;
        lng = resolved?.lng ?? null;
        source = resolved?.source ?? 'failed';
        // No bloquea la respuesta: cachea en paralelo, no importa si termina después.
        cacheCoords(q.quote_id, resolved).catch(() => {});
      }

      return { nv: q.nv, lat, lng, source, nombre, direccion, maps_url };
    })
  );

  const byNv = new Map(results.map((r) => [r.nv, r]));
  // Los NV pedidos que no matchearon ninguna quote (o no tenían maps_url ni
  // dirección para geocodificar) igual se devuelven, sin ubicación, para que
  // el frontend pueda contar "X de Y con ubicación".
  return nvs.map((nv) => byNv.get(nv) || { nv, lat: null, lng: null, source: null, nombre: null, direccion: null, maps_url: null });
}

module.exports = { resolveCoordsForNvs };

// lib/logisticaMapaExtras.js
//
// Enriquecimientos por NV que se agregan a los items de cualquiera de los
// mapas de Planificación de Fechas (pendientes sin viaje / semana real /
// semana prometida), sin acoplar esos archivos entre sí - lo arma la ruta,
// no las libs de cada mapa (evita un require circular entre logisticaMapa.js
// / logisticaIaContexto.js / logisticaPromesaMapa.js, que ya se importan
// unas a otras).
//
// 1) Estado de las 3 etapas de producción que pidió el usuario ver como
//    barrita al lado de cada pin (diseño -> pintura sistema -> armado
//    final), leído de la tabla real que usa el workflow de Planta
//    (public.porton_etapas_estado - Pendiente/En Proceso/Finalizado), NO de
//    las columnas diseno/pintura/armado_final de portones (esas son legacy,
//    no se actualizan más - confirmado contra la base real).
// 2) Semana cruzada: semana prometida para el mapa de fecha real, y semana
//    real (despacho/instalación) para el mapa de semana prometida - para
//    poder comparar ambas sin cambiar de vista.
const { pool } = require('../db');
const { getPromesaConfig } = require('./logisticaPromesaConfig');

const ETAPAS_MAPA = ['diseno', 'pintura', 'armado_final'];

function nvsUnicos(nvs) {
  return Array.from(new Set((nvs || []).map((n) => Number(n)).filter(Number.isInteger)));
}

/**
 * @param {number[]} nvs
 * @returns {Promise<Map<number, {diseno:string, pintura:string, armado_final:string}>>}
 */
async function resolveEtapasPorNv(nvs) {
  const wanted = nvsUnicos(nvs);
  const map = new Map();
  for (const nv of wanted) map.set(nv, { diseno: 'Pendiente', pintura: 'Pendiente', armado_final: 'Pendiente' });
  if (!wanted.length) return map;

  const { rows } = await pool.query(
    `
    with base as (
      select distinct on (p.nv) p.id as porton_id, p.nv
      from public.portones p
      where p.nv = any($1::int[]) and p.parent_id is null
      order by p.nv, p.nlista asc
    )
    select b.nv, pe.etapa::text as etapa, pe.estado
    from base b
    join public.porton_etapas_estado pe on pe.porton_id = b.porton_id
    where pe.etapa::text = any($2::text[]);
    `,
    [wanted, ETAPAS_MAPA]
  );
  for (const r of rows) {
    const e = map.get(r.nv);
    if (e) e[r.etapa] = r.estado;
  }
  return map;
}

/**
 * Semana ISO prometida (producción reservada por el Presupuestador + margen
 * configurable) por NV - mismo cálculo que logisticaPromesaMapa.js.
 * @param {number[]} nvs
 * @returns {Promise<Map<number, string|null>>}
 */
async function resolveSemanaPrometidaPorNv(nvs) {
  const wanted = nvsUnicos(nvs);
  if (!wanted.length) return new Map();
  const config = await getPromesaConfig();
  const semanasDespues = Number(config?.semanas_despues_produccion ?? 1);

  const { rows } = await pool.query(
    `
    select
      substring(coalesce(nullif(final_sale_order_name,''), nullif(odoo_sale_order_name,'')) from '\\d+')::int as nv,
      to_char(production_delivery_week_start + ($2 * 7) * interval '1 day', 'IYYY-"W"IW') as semana_prometida
    from public.presupuestador_quotes
    where quote_kind = 'original'
      and production_delivery_week_start is not null
      and substring(coalesce(nullif(final_sale_order_name,''), nullif(odoo_sale_order_name,'')) from '\\d+')::int = any($1::int[]);
    `,
    [wanted, semanasDespues]
  );
  return new Map(rows.filter((r) => Number.isInteger(r.nv)).map((r) => [r.nv, r.semana_prometida]));
}

/**
 * Semana ISO real (despacho/instalación) por NV, SIN filtrar por si tiene
 * viaje asignado o no - a diferencia de listarPortonesSinViajeConUbicacion
 * (que solo trae lo pendiente), acá se quiere la semana real exista o no
 * viaje, para poder mostrarla como referencia en el mapa de semana
 * prometida.
 * @param {number[]} nvs
 * @returns {Promise<Map<number, {semana_despacho:string|null, semana_instalacion:string|null}>>}
 */
async function resolveSemanaRealPorNv(nvs) {
  const wanted = nvsUnicos(nvs);
  if (!wanted.length) return new Map();
  const { rows } = await pool.query(
    `
    with base as (
      select distinct on (p.nv) p.nv, pv.data as pv_data
      from public.portones p
      left join public.preproduccion_valores pv on pv.nv = p.nv and pv.nv_tipo = 'NV'
      where p.nv = any($1::int[])
      order by p.nv, p.nlista asc
    )
    select nv,
      to_char(nullif(pv_data->>'fecha_salida_imput','')::date, 'IYYY-"W"IW') as semana_despacho,
      to_char(nullif(pv_data->>'fecha_llegada_imput','')::date, 'IYYY-"W"IW') as semana_instalacion
    from base;
    `,
    [wanted]
  );
  return new Map(rows.map((r) => [r.nv, { semana_despacho: r.semana_despacho, semana_instalacion: r.semana_instalacion }]));
}

module.exports = { resolveEtapasPorNv, resolveSemanaPrometidaPorNv, resolveSemanaRealPorNv };

// lib/logisticaPromesaMapa.js
//
// "Semana prometida" del viaje: la semana de producción que el Presupuestador
// ya calculó y reservó por capacidad para el NV (presupuestador_quotes.
// production_delivery_week_start/_end - ver cotizador-back/src/
// productionPlanning.js, es lo mismo que se le muestra al cliente como "Fin
// de producción estimada" en PortonesEstadoPage) + N semanas de margen
// (configurable, ver logisticaPromesaConfig.js).
//
// A diferencia del mapa por semana real (fecha_salida_imput/fecha_llegada_imput
// ya cargada en /a), este es un mapa de PLANIFICACIÓN ANTICIPADA: un NV puede
// aparecer acá bastante antes de que la semana real le llegue, incluso antes
// de que produccion termine y cargue esa fecha - por eso los NV que todavía
// no tienen despacho/instalación pendiente real quedan como informativos
// (no seleccionables) en vez de accionables.
const { pool } = require('../db');
const { resolveCoordsForNvs } = require('./logisticaMapa');
const { listarPortonesSinViajeConUbicacion } = require('./logisticaIaContexto');
const { getPromesaConfig } = require('./logisticaPromesaConfig');

async function fetchNvsPrometidosParaSemana(semana, semanasDespues) {
  const { rows } = await pool.query(
    `
    select
      substring(coalesce(nullif(final_sale_order_name,''), nullif(odoo_sale_order_name,'')) from '\\d+')::int as nv,
      (production_delivery_week_start + ($2 * 7) * interval '1 day')::date as fecha_prometida
    from public.presupuestador_quotes
    where quote_kind = 'original'
      and production_delivery_week_start is not null
      and to_char(production_delivery_week_start + ($2 * 7) * interval '1 day', 'IYYY-"W"IW') = $1;
    `,
    [semana, semanasDespues]
  );
  return rows.filter((r) => Number.isInteger(r.nv));
}

/**
 * @param {string} semana - AAAA-Www
 * @returns {Promise<{ items:Array, config:{semanas_despues_produccion:number} }>}
 */
async function getSemanaPromesaMapa(semana) {
  const config = await getPromesaConfig();
  const semanasDespues = Number(config?.semanas_despues_produccion ?? 1);

  const prometidos = await fetchNvsPrometidosParaSemana(semana, semanasDespues);
  if (!prometidos.length) return { items: [], config };

  const fechaPromByNv = new Map(prometidos.map((r) => [r.nv, r.fecha_prometida]));
  const nvs = Array.from(fechaPromByNv.keys());

  // Reusa el mismo listado (con ubicación/zona) que ya arma el mapa de
  // "pendientes sin viaje" - para los NV que ya tienen despacho/instalación
  // pendiente real, esto trae directo despacho_pendiente/semana_despacho/etc.
  const pendientes = await listarPortonesSinViajeConUbicacion();
  const pendientesByNv = new Map(pendientes.map((p) => [p.nv, p]));

  // Los NV prometidos que NO están en "pendientes sin viaje" (todavía sin
  // fecha real imputada en /a, o ya asignados a un viaje) necesitan su
  // ubicación resuelta aparte, para poder mostrar igual el pin informativo.
  const faltantes = nvs.filter((nv) => !pendientesByNv.has(nv));
  const coordsFaltantes = faltantes.length ? await resolveCoordsForNvs(faltantes) : [];
  const coordsByNv = new Map(coordsFaltantes.map((c) => [c.nv, c]));

  const items = nvs.map((nv) => {
    const p = pendientesByNv.get(nv);
    if (p) {
      return { ...p, fecha_prometida: fechaPromByNv.get(nv), tiene_pendiente_real: true };
    }
    const c = coordsByNv.get(nv) || {};
    return {
      nv, lat: c.lat ?? null, lng: c.lng ?? null, zona: c.zona ?? null, nombre: c.nombre ?? null, direccion: c.direccion ?? null,
      despacho_pendiente: false, instalacion_pendiente: false, semana_despacho: null, semana_instalacion: null,
      fecha_prometida: fechaPromByNv.get(nv), tiene_pendiente_real: false,
    };
  });

  return { items, config };
}

module.exports = { getSemanaPromesaMapa };

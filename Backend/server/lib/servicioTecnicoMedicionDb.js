// lib/servicioTecnicoMedicionDb.js
//
// Mediciones pendientes: NO es una entidad de Planta. El Presupuestador ya
// tiene su propio flujo de medición sobre public.presupuestador_quotes
// (cotizador-back/src/routes/measurements.routes.js) - measurement_status,
// measurement_at, measurement_scheduled_for. Acá leemos y (para planificar
// fechas/viajes) ESCRIBIMOS directo sobre esas mismas columnas, misma base
// compartida - mismo patrón que ya usa Planta para las Consultas de
// Logística (escribe directo en tablas del Presupuestador a nombre de la
// cuenta "logistica"). No se llama a la API del Presupuestador por HTTP.
//
// Definición de "pendiente" replicada de measurements.routes.js (viewer
// medidor, status=pending): measurement_status = 'pending' y measurement_at
// is null, sobre presupuestos con status habilitado para el flujo. No se
// duplica la sub-condición de línea de producto / fulfillment_mode del
// Presupuestador (Odoo product IDs) porque measurement_status ya refleja esa
// elegibilidad - es un estado que el propio Presupuestador mantiene.
const { pool } = require('../db');

const STATUS_HABILITADO = `
  (q.status = 'synced_odoo'
   or (q.status = 'pending_approvals' and q.commercial_decision = 'approved' and q.technical_decision = 'approved')
   or (q.status = 'draft' and q.measurement_status = 'returned_to_seller'))
`;

async function listMedicionesPendientes() {
  const { rows } = await pool.query(
    `
    select
      q.id as quote_id,
      substring(coalesce(nullif(q.final_sale_order_name,''), nullif(q.odoo_sale_order_name,'')) from '\\d+')::int as nv,
      q.end_customer->>'name' as nombre_cliente,
      nullif(trim(both ' - ' from concat_ws(' - ', q.end_customer->>'address', q.end_customer->>'city')), '') as direccion,
      q.end_customer->>'maps_url' as maps_url,
      to_char(q.measurement_scheduled_for, 'YYYY-MM-DD') as fecha_programada
    from public.presupuestador_quotes q
    where q.quote_kind = 'original'
      and ${STATUS_HABILITADO}
      and q.measurement_status = 'pending'
      and q.measurement_at is null
    order by case when q.measurement_scheduled_for is null then 1 else 0 end asc, q.measurement_scheduled_for asc;
    `
  );
  return rows;
}

// fecha: 'YYYY-MM-DD' | null (null = sacarla del tablero, vuelve al pool "sin fecha").
async function programarMedicion(quoteId, fecha) {
  const fechaStr = fecha ? String(fecha).trim() : null;
  if (fechaStr && !/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) throw new Error('fecha inválida');
  const { rows, rowCount } = await pool.query(
    `update public.presupuestador_quotes
        set measurement_scheduled_for = $2::date, measurement_scheduled_at = now()
      where id = $1 and quote_kind = 'original'
      returning id;`,
    [quoteId, fechaStr]
  );
  if (!rowCount) throw new Error('Presupuesto no encontrado');
  return rows[0];
}

module.exports = { listMedicionesPendientes, programarMedicion };

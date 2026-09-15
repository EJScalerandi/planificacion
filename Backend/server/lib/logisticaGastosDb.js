// lib/logisticaGastosDb.js
//
// Gastos de viaje ("rendición de gastos") cargados por la cuadrilla desde
// /despacho_v2 - pedido explícito del usuario: fecha + motivo (catálogo
// simple, hoy Refrigerio/Hospedaje/Otros - "después vamos a agregar más
// motivos", ver MOTIVOS_GASTO en DespachoV2Page.jsx) + monto + el ticket
// adjunto (foto o PDF, mismo bucket/patrón que el resto de Adjuntos de
// Logística). Una "rendición" no tiene tabla propia: es, ni más ni menos,
// el conjunto de gastos de UN viaje (se arma agregando por viaje_id). El
// campo de auditoría ("ya fue controlada") queda para una vuelta futura,
// pedido explícito del usuario - no se modela todavía.
const { pool } = require('../db');

async function listGastosDeViaje(viajeId) {
  const { rows } = await pool.query(
    `select id, viaje_id, fecha::text as fecha, motivo, monto, storage_path, nombre_archivo, tipo_mime, cargado_por, created_at
       from public.logistica_gastos
      where viaje_id = $1
      order by fecha asc, created_at asc;`,
    [Number(viajeId)]
  );
  return rows;
}

async function crearGasto({ viaje_id, fecha, motivo, monto, storage_path, nombre_archivo, tipo_mime, cargado_por }) {
  const { rows } = await pool.query(
    `insert into public.logistica_gastos
       (viaje_id, fecha, motivo, monto, storage_path, nombre_archivo, tipo_mime, cargado_por)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     returning id, viaje_id, fecha::text as fecha, motivo, monto, storage_path, nombre_archivo, tipo_mime, cargado_por, created_at;`,
    [Number(viaje_id), fecha, motivo, monto, storage_path, nombre_archivo ?? null, tipo_mime ?? null, cargado_por ?? null]
  );
  return rows[0];
}

// Devuelve el storage_path para poder borrar el archivo real después.
async function borrarGasto(id) {
  const { rows } = await pool.query(`delete from public.logistica_gastos where id = $1 returning storage_path;`, [Number(id)]);
  return rows[0]?.storage_path || null;
}

// Para chequear ownership (¿este gasto es de ESTE viaje?) antes de dejar
// borrarlo desde /despacho_v2.
async function getGasto(id) {
  const { rows } = await pool.query(`select * from public.logistica_gastos where id = $1;`, [Number(id)]);
  return rows[0] || null;
}

// ===========================================================================
// "Rendiciones" para Logística > Fechas (admin) - una fila por viaje que
// tiene al menos un gasto cargado, con el total ya sumado. El detalle
// (gastos + link a cada ticket) se pide aparte, por viaje, solo al entrar.
// ===========================================================================
async function listRendiciones() {
  const { rows } = await pool.query(
    `select vi.id as viaje_id, vi.nombre as viaje_nombre, vi.fecha::text as viaje_fecha,
            c.nombre as cuadrilla_nombre,
            count(g.id)::int as cantidad_gastos,
            coalesce(sum(g.monto), 0) as total
       from public.logistica_gastos g
       join public.logistica_viajes vi on vi.id = g.viaje_id
       left join public.logistica_cuadrillas c on c.id = vi.cuadrilla_id
      group by vi.id, vi.nombre, vi.fecha, c.nombre
      order by vi.fecha desc, vi.id desc;`
  );
  return rows;
}

async function getRendicionDetalle(viajeId) {
  const { rows: viajeRows } = await pool.query(
    `select vi.id as viaje_id, vi.nombre as viaje_nombre, vi.fecha::text as viaje_fecha, c.nombre as cuadrilla_nombre
       from public.logistica_viajes vi
       left join public.logistica_cuadrillas c on c.id = vi.cuadrilla_id
      where vi.id = $1;`,
    [Number(viajeId)]
  );
  const viaje = viajeRows[0];
  if (!viaje) return null;
  const gastos = await listGastosDeViaje(viajeId);
  const total = gastos.reduce((acc, g) => acc + Number(g.monto), 0);
  return { ...viaje, gastos, total };
}

module.exports = { listGastosDeViaje, crearGasto, borrarGasto, getGasto, listRendiciones, getRendicionDetalle };

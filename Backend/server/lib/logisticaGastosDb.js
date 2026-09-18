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

const GASTO_COLS = `id, viaje_id, fecha::text as fecha, motivo, monto, storage_path, nombre_archivo, tipo_mime, cargado_por,
  tipo_comprobante, medio_pago, estado_revision, detalle_revision, campos_inciertos, created_at`;

async function listGastosDeViaje(viajeId) {
  const { rows } = await pool.query(
    `select ${GASTO_COLS}
       from public.logistica_gastos
      where viaje_id = $1
      order by fecha asc, created_at asc;`,
    [Number(viajeId)]
  );
  return rows;
}

// tipo_comprobante/medio_pago/estado_revision/detalle_revision/campos_inciertos
// son opcionales - el gasto se puede seguir cargando "a mano" (sin IA) igual
// que antes, quedando en estado_revision='pendiente' por default.
async function crearGasto({
  viaje_id, fecha, motivo, monto, storage_path, nombre_archivo, tipo_mime, cargado_por,
  tipo_comprobante, medio_pago, estado_revision, detalle_revision, campos_inciertos,
}) {
  const { rows } = await pool.query(
    `insert into public.logistica_gastos
       (viaje_id, fecha, motivo, monto, storage_path, nombre_archivo, tipo_mime, cargado_por,
        tipo_comprobante, medio_pago, estado_revision, detalle_revision, campos_inciertos)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,coalesce($11,'pendiente'),$12,$13)
     returning ${GASTO_COLS};`,
    [
      Number(viaje_id), fecha, motivo, monto, storage_path, nombre_archivo ?? null, tipo_mime ?? null, cargado_por ?? null,
      tipo_comprobante ?? null, medio_pago ?? null, estado_revision ?? null, detalle_revision ?? null, campos_inciertos ?? null,
    ]
  );
  return rows[0];
}

// Corrección a mano de un campo que la IA marcó incierto (o cualquier otro) -
// pedido explícito del usuario: el campo queda editable para quien cargó el
// gasto. Corregir NO saca el estado_revision='revisar' ni lo borra de
// campos_inciertos - logística lo sigue viendo resaltado igual, para
// verificarlo con sus propios ojos (la cuadrilla podría corregir mal, o
// mentir).
async function actualizarGasto(id, { fecha, motivo, monto, tipo_comprobante, medio_pago }) {
  const sets = [];
  const params = [Number(id)];
  const set = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
  if (fecha !== undefined) set('fecha', fecha);
  if (motivo !== undefined) set('motivo', motivo);
  if (monto !== undefined) set('monto', monto);
  if (tipo_comprobante !== undefined) set('tipo_comprobante', tipo_comprobante);
  if (medio_pago !== undefined) set('medio_pago', medio_pago);
  if (!sets.length) throw new Error('Nada para actualizar');
  const { rows } = await pool.query(
    `update public.logistica_gastos set ${sets.join(', ')} where id = $1 returning ${GASTO_COLS};`,
    params
  );
  if (!rows[0]) throw new Error('Gasto no encontrado');
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
            vi.hora_llegada_real, vi.rendicion_aprobada_por, vi.rendicion_aprobada_at, vi.fondo_efectivo,
            c.nombre as cuadrilla_nombre,
            count(g.id)::int as cantidad_gastos,
            count(g.id) filter (where g.estado_revision = 'revisar')::int as cantidad_a_revisar,
            coalesce(sum(g.monto), 0) as total,
            coalesce(sum(g.monto) filter (where g.medio_pago = 'efectivo'), 0) as total_efectivo
       from public.logistica_gastos g
       join public.logistica_viajes vi on vi.id = g.viaje_id
       left join public.logistica_cuadrillas c on c.id = vi.cuadrilla_id
      group by vi.id, vi.nombre, vi.fecha, vi.hora_llegada_real, vi.rendicion_aprobada_por, vi.rendicion_aprobada_at, vi.fondo_efectivo, c.nombre
      order by vi.fecha desc, vi.id desc;`
  );
  return rows.map((r) => ({
    ...r,
    saldo_a_devolver: r.fondo_efectivo != null ? Number(r.fondo_efectivo) - Number(r.total_efectivo) : null,
  }));
}

async function getRendicionDetalle(viajeId) {
  const { rows: viajeRows } = await pool.query(
    `select vi.id as viaje_id, vi.nombre as viaje_nombre, vi.fecha::text as viaje_fecha,
            vi.hora_salida_real, vi.hora_llegada_real, vi.rendicion_aprobada_por, vi.rendicion_aprobada_at,
            vi.fondo_efectivo,
            c.nombre as cuadrilla_nombre
       from public.logistica_viajes vi
       left join public.logistica_cuadrillas c on c.id = vi.cuadrilla_id
      where vi.id = $1;`,
    [Number(viajeId)]
  );
  const viaje = viajeRows[0];
  if (!viaje) return null;
  const gastos = await listGastosDeViaje(viajeId);
  const total = gastos.reduce((acc, g) => acc + Number(g.monto), 0);
  // Efectivo: hoy según medio_pago que leyó la IA del ticket (provisorio -
  // la Parte 2, todavía sin terminar, lo va a confirmar/corregir cruzando
  // contra el email de la tarjeta; lo que ahí NO matchee también suma como
  // efectivo). saldo_a_devolver: lo que le sobró del fondo a la cuadrilla,
  // null si todavía no se cargó ningún fondo para este viaje.
  const totalEfectivo = gastos.filter((g) => g.medio_pago === 'efectivo').reduce((acc, g) => acc + Number(g.monto), 0);
  const fondoEfectivo = viaje.fondo_efectivo != null ? Number(viaje.fondo_efectivo) : null;
  const saldoADevolver = fondoEfectivo != null ? fondoEfectivo - totalEfectivo : null;
  return { ...viaje, gastos, total, total_efectivo: totalEfectivo, saldo_a_devolver: saldoADevolver };
}

// Logística no puede aprobar la rendición hasta que el viaje esté
// "finalizado" (hora_llegada_real cargada) - pedido explícito del usuario:
// sin eso, el rango de fechas válido para los gastos ni siquiera está
// cerrado todavía.
async function aprobarRendicion(viajeId, aprobadoPor) {
  const { rows } = await pool.query(`select hora_llegada_real from public.logistica_viajes where id = $1;`, [Number(viajeId)]);
  if (!rows[0]) throw new Error('Viaje no encontrado');
  if (!rows[0].hora_llegada_real) {
    const err = new Error('El viaje todavía no fue finalizado por la cuadrilla - no se puede aprobar la rendición.');
    err.status = 409;
    throw err;
  }
  const { rows: updated } = await pool.query(
    `update public.logistica_viajes
        set rendicion_aprobada_por = $2, rendicion_aprobada_at = now()
      where id = $1
      returning rendicion_aprobada_por, rendicion_aprobada_at;`,
    [Number(viajeId), aprobadoPor || null]
  );
  return updated[0];
}

module.exports = {
  listGastosDeViaje, crearGasto, actualizarGasto, borrarGasto, getGasto,
  listRendiciones, getRendicionDetalle, aprobarRendicion,
};

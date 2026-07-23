// routes/public/prefabricados.js
const express = require('express');
const { pool } = require('../../db');
const { STATUS } = require('../../lib/workflow');

const router = express.Router();

// Aplana las filas EAV (estado/tiempos) sobre cada orden, igual que getPortonShapeById
// hace con porton_etapas_estado/tiempos, pero en JS en vez de un pivot SQL: acá el
// universo de etapas por orden lo define workflow_stages de cada tipo, no una lista fija.
function shapeOrders(orders, estadoRows, tiemposRows) {
  const estadoByOrden = new Map();
  for (const r of estadoRows) {
    if (!estadoByOrden.has(r.orden_id)) estadoByOrden.set(r.orden_id, new Map());
    estadoByOrden.get(r.orden_id).set(r.etapa, r.estado);
  }
  const tiemposByOrden = new Map();
  for (const r of tiemposRows) {
    if (!tiemposByOrden.has(r.orden_id)) tiemposByOrden.set(r.orden_id, new Map());
    tiemposByOrden.get(r.orden_id).set(r.etapa, r);
  }

  return orders.map((o) => {
    const shaped = { ...o };
    const estados = estadoByOrden.get(o.id);
    const tiempos = tiemposByOrden.get(o.id);
    if (estados) {
      for (const [etapa, estado] of estados.entries()) shaped[etapa] = estado;
    }
    if (tiempos) {
      for (const [etapa, t] of tiempos.entries()) {
        shaped[`${etapa}_inicio`] = t.inicio;
        shaped[`${etapa}_fin`] = t.fin;
      }
    }
    return shaped;
  });
}

async function loadOrders(db, whereSql = '', params = []) {
  const { rows: orders } = await db.query(
    `
    select o.id, o.numero, o.tipo_id, o.solicitado_por_seccion, o.created_at, o.cantidad,
           t.nombre as tipo_nombre, t.workflow_stages
    from public.prefabricado_ordenes o
    join public.prefabricado_tipos t on t.id = o.tipo_id
    ${whereSql}
    order by o.numero asc;
    `,
    params
  );
  if (!orders.length) return [];

  const ids = orders.map((o) => o.id);
  const [{ rows: estadoRows }, { rows: tiemposRows }] = await Promise.all([
    db.query(`select orden_id, etapa, estado from public.prefabricado_orden_etapas_estado where orden_id = any($1);`, [ids]),
    db.query(`select orden_id, etapa, inicio, fin from public.prefabricado_orden_etapas_tiempos where orden_id = any($1);`, [ids]),
  ]);

  return shapeOrders(orders, estadoRows, tiemposRows);
}

// GET /prefabricados/tipos — para el selector de "nuevo pedido" en el piso
router.get('/prefabricados/tipos', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `
      select id, nombre, seccion_solicitante, workflow_stages, enabled
      from public.prefabricado_tipos
      where enabled = true
      order by nombre asc;
      `
    );
    return res.json(rows);
  } catch (err) {
    console.error('get prefabricado tipos error:', err);
    return res.status(500).json({ error: 'Error leyendo tipos de prefabricado', detail: err.message });
  }
});

// GET /prefabricados
router.get('/prefabricados', async (_req, res) => {
  try {
    const shaped = await loadOrders(pool);
    return res.json(shaped);
  } catch (err) {
    console.error('get prefabricados error:', err);
    return res.status(500).json({ error: 'Error leyendo prefabricados', detail: err.message });
  }
});

// POST /prefabricados — crea un pedido de fabricación para un tipo, disparado por una sección
router.post('/prefabricados', async (req, res) => {
  const { tipo_id, seccion, cantidad } = req.body || {};
  const tipoId = Number(tipo_id);
  const seccionStr = String(seccion || '').trim();
  const nCantidad = Number(cantidad);

  if (!Number.isInteger(tipoId) || !seccionStr) {
    return res.status(400).json({ error: 'tipo_id y seccion son requeridos' });
  }
  if (!Number.isInteger(nCantidad) || nCantidad <= 0) {
    return res.status(400).json({ error: 'cantidad debe ser un entero positivo' });
  }

  const client = await pool.connect();
  try {
    await client.query('begin');

    const { rows: tipoRows } = await client.query(
      `select id, nombre, seccion_solicitante, workflow_stages, enabled from public.prefabricado_tipos where id = $1;`,
      [tipoId]
    );
    const tipo = tipoRows[0];
    if (!tipo || !tipo.enabled) {
      await client.query('rollback');
      return res.status(404).json({ error: 'Tipo de prefabricado no encontrado o deshabilitado' });
    }
    if (!Array.isArray(tipo.seccion_solicitante) || !tipo.seccion_solicitante.includes(seccionStr)) {
      await client.query('rollback');
      return res.status(403).json({ error: `La sección "${seccionStr}" no puede pedir este prefabricado` });
    }
    const firstStage = Array.isArray(tipo.workflow_stages) ? tipo.workflow_stages[0] : null;
    if (!firstStage) {
      await client.query('rollback');
      return res.status(409).json({ error: 'Este tipo de prefabricado no tiene workflow configurado' });
    }

    const ins = await client.query(
      `
      insert into public.prefabricado_ordenes(tipo_id, solicitado_por_seccion, cantidad)
      values ($1, $2, $3)
      returning id;
      `,
      [tipoId, seccionStr, nCantidad]
    );
    const id = ins.rows[0].id;

    await client.query(
      `insert into public.prefabricado_orden_etapas_estado(orden_id, etapa, estado) values ($1, $2, $3);`,
      [id, firstStage, STATUS.PENDIENTE]
    );

    await client.query('commit');
    const [shaped] = await loadOrders(pool, 'where o.id = $1', [id]);
    return res.status(201).json(shaped || { id });
  } catch (err) {
    await client.query('rollback');
    console.error('create prefabricado orden error:', err);
    return res.status(500).json({ error: 'Error creando pedido de prefabricado', detail: err.message });
  } finally {
    client.release();
  }
});

// POST /prefabricados/:id/stage
router.post('/prefabricados/:id/stage', async (req, res) => {
  const { id } = req.params;
  const { stage, action } = req.body || {};
  const stageKey = String(stage || '').trim();
  const act = String(action || '').trim();

  if (!stageKey || !['start', 'stop'].includes(act)) {
    return res.status(400).json({ error: 'Parámetros inválidos' });
  }

  const client = await pool.connect();
  try {
    await client.query('begin');

    const { rows: ordRows } = await client.query(
      `
      select o.id, t.workflow_stages
      from public.prefabricado_ordenes o
      join public.prefabricado_tipos t on t.id = o.tipo_id
      where o.id = $1;
      `,
      [id]
    );
    const orden = ordRows[0];
    if (!orden) {
      await client.query('rollback');
      return res.status(404).json({ error: 'Pedido de prefabricado no encontrado' });
    }
    const stages = Array.isArray(orden.workflow_stages) ? orden.workflow_stages : [];
    const idx = stages.indexOf(stageKey);
    if (idx === -1) {
      await client.query('rollback');
      return res.status(400).json({ error: `Etapa "${stageKey}" no pertenece al workflow de este pedido` });
    }

    if (act === 'start') {
      await client.query(
        `
        insert into public.prefabricado_orden_etapas_estado(orden_id, etapa, estado)
        values ($1, $2, $3)
        on conflict (orden_id, etapa) do update set estado = excluded.estado;
        `,
        [id, stageKey, STATUS.EN_PROCESO]
      );
      await client.query(
        `
        insert into public.prefabricado_orden_etapas_tiempos(orden_id, etapa, inicio, fin)
        values ($1, $2, now(), null)
        on conflict (orden_id, etapa) do update set inicio = coalesce(public.prefabricado_orden_etapas_tiempos.inicio, excluded.inicio);
        `,
        [id, stageKey]
      );
    } else {
      await client.query(
        `
        insert into public.prefabricado_orden_etapas_estado(orden_id, etapa, estado)
        values ($1, $2, $3)
        on conflict (orden_id, etapa) do update set estado = excluded.estado;
        `,
        [id, stageKey, STATUS.FINALIZADO]
      );
      await client.query(
        `
        insert into public.prefabricado_orden_etapas_tiempos(orden_id, etapa, inicio, fin)
        values ($1, $2, null, now())
        on conflict (orden_id, etapa) do update set fin = coalesce(public.prefabricado_orden_etapas_tiempos.fin, excluded.fin);
        `,
        [id, stageKey]
      );
      // El avance a la siguiente etapa ya NO se hace acá: requiere QC aprobado
      // (ver /qc/authorize), igual que portones.
    }

    await client.query('commit');
    const [shaped] = await loadOrders(pool, 'where o.id = $1', [id]);
    return res.json(shaped);
  } catch (err) {
    await client.query('rollback');
    console.error('prefabricado stage error:', err);
    return res.status(500).json({ error: 'Error al actualizar etapa del prefabricado', detail: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;

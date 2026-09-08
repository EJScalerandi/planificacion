// routes/public/servicioTecnico.js
const express = require('express');
const { pool } = require('../../db');
const { STATUS } = require('../../lib/workflow');

const router = express.Router();

// Mismo aplanado EAV->campos planos que prefabricados.js: acá el universo de etapas
// lo define el workflow_stages propio de cada orden (armado a mano al crearla).
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
    select id, nv, cantidad, descripcion, workflow_stages, created_by, created_at, tipo, numero
    from public.st_ordenes
    ${whereSql}
    order by id asc;
    `,
    params
  );
  if (!orders.length) return [];

  const ids = orders.map((o) => o.id);
  const [{ rows: estadoRows }, { rows: tiemposRows }] = await Promise.all([
    db.query(`select orden_id, etapa, estado from public.st_orden_etapas_estado where orden_id = any($1);`, [ids]),
    db.query(`select orden_id, etapa, inicio, fin from public.st_orden_etapas_tiempos where orden_id = any($1);`, [ids]),
  ]);

  return shapeOrders(orders, estadoRows, tiemposRows);
}

// GET /servicio-tecnico
router.get('/servicio-tecnico', async (_req, res) => {
  try {
    const shaped = await loadOrders(pool);
    return res.json(shaped);
  } catch (err) {
    console.error('get servicio-tecnico error:', err);
    return res.status(500).json({ error: 'Error leyendo órdenes de servicio técnico', detail: err.message });
  }
});

// POST /servicio-tecnico/prueba-laser
// Botón "Generar Prueba Laser Plano" en /diseno: crea una orden de un solo
// paso (workflow_stages = ['guillotina']), sin NV, con numeración propia
// (prueba_seq, prefijo "PRUEBA" agregado solo en el frontend). Público
// porque /diseno es una tablet de planta sin login, igual que prefabricados.
router.post('/servicio-tecnico/prueba-laser', async (req, res) => {
  const descripcionStr = String(req.body?.descripcion || '').trim() || 'Prueba Laser Plano';

  const client = await pool.connect();
  try {
    await client.query('begin');

    const ins = await client.query(
      `
      insert into public.st_ordenes(nv, cantidad, descripcion, workflow_stages, created_by, tipo, numero)
      values (null, 1, $1, array['guillotina']::text[], null, 'PRUEBA', nextval('public.prueba_seq'))
      returning id;
      `,
      [descripcionStr]
    );
    const id = ins.rows[0].id;

    await client.query(
      `insert into public.st_orden_etapas_estado(orden_id, etapa, estado) values ($1, 'guillotina', $2);`,
      [id, STATUS.PENDIENTE]
    );

    await client.query('commit');
    const [shaped] = await loadOrders(pool, 'where id = $1', [id]);
    return res.status(201).json(shaped || { id });
  } catch (err) {
    await client.query('rollback');
    console.error('create prueba laser error:', err);
    return res.status(500).json({ error: 'Error creando la prueba de laser', detail: err.message });
  } finally {
    client.release();
  }
});

// POST /servicio-tecnico/:id/stage
router.post('/servicio-tecnico/:id/stage', async (req, res) => {
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
      `select id, workflow_stages from public.st_ordenes where id = $1;`,
      [id]
    );
    const orden = ordRows[0];
    if (!orden) {
      await client.query('rollback');
      return res.status(404).json({ error: 'Orden de servicio técnico no encontrada' });
    }
    const stages = Array.isArray(orden.workflow_stages) ? orden.workflow_stages : [];
    const idx = stages.indexOf(stageKey);
    if (idx === -1) {
      await client.query('rollback');
      return res.status(400).json({ error: `Etapa "${stageKey}" no pertenece al workflow de esta orden` });
    }

    if (act === 'start') {
      await client.query(
        `
        insert into public.st_orden_etapas_estado(orden_id, etapa, estado)
        values ($1, $2, $3)
        on conflict (orden_id, etapa) do update set estado = excluded.estado;
        `,
        [id, stageKey, STATUS.EN_PROCESO]
      );
      await client.query(
        `
        insert into public.st_orden_etapas_tiempos(orden_id, etapa, inicio, fin)
        values ($1, $2, now(), null)
        on conflict (orden_id, etapa) do update set inicio = coalesce(public.st_orden_etapas_tiempos.inicio, excluded.inicio);
        `,
        [id, stageKey]
      );
    } else {
      await client.query(
        `
        insert into public.st_orden_etapas_estado(orden_id, etapa, estado)
        values ($1, $2, $3)
        on conflict (orden_id, etapa) do update set estado = excluded.estado;
        `,
        [id, stageKey, STATUS.FINALIZADO]
      );
      await client.query(
        `
        insert into public.st_orden_etapas_tiempos(orden_id, etapa, inicio, fin)
        values ($1, $2, null, now())
        on conflict (orden_id, etapa) do update set fin = coalesce(public.st_orden_etapas_tiempos.fin, excluded.fin);
        `,
        [id, stageKey]
      );
      // El avance a la siguiente etapa ya NO se hace acá: requiere QC aprobado
      // (ver /qc/authorize), igual que portones.
    }

    await client.query('commit');
    const [shaped] = await loadOrders(pool, 'where id = $1', [id]);
    return res.json(shaped);
  } catch (err) {
    await client.query('rollback');
    console.error('servicio-tecnico stage error:', err);
    return res.status(500).json({ error: 'Error al actualizar etapa de servicio técnico', detail: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;

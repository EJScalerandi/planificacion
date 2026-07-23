// routes/admin/servicioTecnico.js
const express = require('express');
const { adminAuth } = require('../../middleware/adminAuth');
const { pool } = require('../../db');
const { STATUS } = require('../../lib/workflow');

const router = express.Router();

function normalizeScopes(scopesRaw) {
  if (Array.isArray(scopesRaw)) return scopesRaw.map((s) => String(s || '').trim()).filter(Boolean);
  if (typeof scopesRaw === 'string') return scopesRaw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  return [];
}
function hasScope(req, scope) {
  const scopes = normalizeScopes(req?.admin?.scopes ?? req?.admin?.scope ?? req?.admin?.permissions ?? []);
  return scopes.includes(scope);
}
function requireScope(scope) {
  return (req, res, next) => {
    if (!hasScope(req, scope)) return res.status(403).json({ error: `Requiere scope ${scope}` });
    return next();
  };
}

function toStringArray(v) {
  if (!Array.isArray(v)) return [];
  return v.map((s) => String(s || '').trim()).filter(Boolean);
}

router.use(adminAuth, requireScope('servicio_tecnico:admin'));

// GET /admin/servicio-tecnico/ordenes
router.get('/servicio-tecnico/ordenes', async (_req, res) => {
  try {
    const { rows: orders } = await pool.query(
      `
      select id, nv, cantidad, descripcion, workflow_stages, created_by, created_at, tipo, numero
      from public.st_ordenes
      order by created_at desc;
      `
    );
    if (!orders.length) return res.json([]);

    const ids = orders.map((o) => o.id);
    const { rows: estadoRows } = await pool.query(
      `select orden_id, etapa, estado from public.st_orden_etapas_estado where orden_id = any($1);`,
      [ids]
    );
    const byOrden = new Map();
    for (const r of estadoRows) {
      if (!byOrden.has(r.orden_id)) byOrden.set(r.orden_id, {});
      byOrden.get(r.orden_id)[r.etapa] = r.estado;
    }
    const shaped = orders.map((o) => ({ ...o, etapas_estado: byOrden.get(o.id) || {} }));
    return res.json(shaped);
  } catch (err) {
    console.error('admin get st ordenes error:', err);
    return res.status(500).json({ error: 'Error leyendo órdenes de servicio técnico', detail: err.message });
  }
});

// POST /admin/servicio-tecnico/ordenes
router.post('/servicio-tecnico/ordenes', async (req, res) => {
  const { nv, cantidad, descripcion, workflow_stages, tipo } = req.body || {};
  const tipoStr = String(tipo || '').trim().toUpperCase();
  const nCantidad = Number(cantidad);
  const descripcionStr = String(descripcion || '').trim();
  const stages = toStringArray(workflow_stages);

  if (!['ST', 'OE'].includes(tipoStr)) return res.status(400).json({ error: 'tipo debe ser ST u OE' });

  let nNv = null;
  if (tipoStr === 'ST') {
    nNv = Number(nv);
    if (!Number.isInteger(nNv)) return res.status(400).json({ error: 'nv debe ser un entero para Servicio Técnico' });
  }

  if (!Number.isInteger(nCantidad) || nCantidad <= 0) return res.status(400).json({ error: 'cantidad debe ser un entero positivo' });
  if (!descripcionStr) return res.status(400).json({ error: 'descripcion es requerida' });
  if (!stages.length) return res.status(400).json({ error: 'workflow_stages debe tener al menos una etapa' });

  const client = await pool.connect();
  try {
    await client.query('begin');

    const ins = await client.query(
      `
      insert into public.st_ordenes(nv, cantidad, descripcion, workflow_stages, created_by, tipo, numero)
      values ($1, $2, $3, $4::text[], $5, $6, case when $6 = 'OE' then nextval('public.oe_seq') else null end)
      returning id;
      `,
      [nNv, nCantidad, descripcionStr, stages, req.admin?.username || null, tipoStr]
    );
    const id = ins.rows[0].id;

    await client.query(
      `insert into public.st_orden_etapas_estado(orden_id, etapa, estado) values ($1, $2, $3);`,
      [id, stages[0], STATUS.PENDIENTE]
    );

    await client.query('commit');

    const { rows } = await pool.query(
      `select id, nv, cantidad, descripcion, workflow_stages, created_by, created_at, tipo, numero from public.st_ordenes where id = $1;`,
      [id]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('rollback');
    console.error('admin create st orden error:', err);
    return res.status(500).json({ error: 'Error creando orden de servicio técnico', detail: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;

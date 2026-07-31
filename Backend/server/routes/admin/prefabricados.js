// routes/admin/prefabricados.js
const express = require('express');
const { adminAuth } = require('../../middleware/adminAuth');
const { pool } = require('../../db');

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

// Con path ('/prefabricados', ...): ver nota equivalente en admin/insumos.js —
// sin path, este gate bloqueaba con 403 pedidos de otros módulos admin según
// el orden de montaje en app.js.
router.use('/prefabricados', adminAuth, requireScope('prefabricados:admin'));

// GET /admin/prefabricados/tipos — todos (incluye deshabilitados), para la pantalla de config
router.get('/prefabricados/tipos', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `
      select id, nombre, seccion_solicitante, workflow_stages, enabled, created_at
      from public.prefabricado_tipos
      order by nombre asc;
      `
    );
    return res.json(rows);
  } catch (err) {
    console.error('admin get prefabricado tipos error:', err);
    return res.status(500).json({ error: 'Error leyendo tipos de prefabricado', detail: err.message });
  }
});

// POST /admin/prefabricados/tipos
router.post('/prefabricados/tipos', async (req, res) => {
  try {
    const { nombre, seccion_solicitante, workflow_stages, enabled } = req.body || {};
    const nombreStr = String(nombre || '').trim();
    const secciones = toStringArray(seccion_solicitante);
    const stages = toStringArray(workflow_stages);

    if (!nombreStr) return res.status(400).json({ error: 'nombre es requerido' });
    if (!stages.length) return res.status(400).json({ error: 'workflow_stages debe tener al menos una etapa' });

    const { rows } = await pool.query(
      `
      insert into public.prefabricado_tipos(nombre, seccion_solicitante, workflow_stages, enabled)
      values ($1, $2::text[], $3::text[], $4)
      returning id, nombre, seccion_solicitante, workflow_stages, enabled, created_at;
      `,
      [nombreStr, secciones, stages, enabled !== false]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('admin create prefabricado tipo error:', err);
    return res.status(500).json({ error: 'Error creando tipo de prefabricado', detail: err.message });
  }
});

// PUT /admin/prefabricados/tipos/:id
router.put('/prefabricados/tipos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, seccion_solicitante, workflow_stages, enabled } = req.body || {};
    const nombreStr = String(nombre || '').trim();
    const secciones = toStringArray(seccion_solicitante);
    const stages = toStringArray(workflow_stages);

    if (!nombreStr) return res.status(400).json({ error: 'nombre es requerido' });
    if (!stages.length) return res.status(400).json({ error: 'workflow_stages debe tener al menos una etapa' });

    const { rows, rowCount } = await pool.query(
      `
      update public.prefabricado_tipos
      set nombre = $2, seccion_solicitante = $3::text[], workflow_stages = $4::text[], enabled = $5, updated_at = now()
      where id = $1
      returning id, nombre, seccion_solicitante, workflow_stages, enabled, created_at;
      `,
      [id, nombreStr, secciones, stages, enabled !== false]
    );
    if (!rowCount) return res.status(404).json({ error: 'Tipo de prefabricado no encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('admin update prefabricado tipo error:', err);
    return res.status(500).json({ error: 'Error actualizando tipo de prefabricado', detail: err.message });
  }
});

module.exports = router;

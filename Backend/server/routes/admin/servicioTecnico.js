// routes/admin/servicioTecnico.js
const express = require('express');
const { adminAuth } = require('../../middleware/adminAuth');
const { pool } = require('../../db');
const { STATUS } = require('../../lib/workflow');
const solicitudesDb = require('../../lib/servicioTecnicoSolicitudesDb');
const medicionDb = require('../../lib/servicioTecnicoMedicionDb');

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

// Con path ('/servicio-tecnico', ...): ver nota equivalente en admin/insumos.js —
// sin path, este gate bloqueaba con 403 pedidos de otros módulos admin según
// el orden de montaje en app.js.
router.use('/servicio-tecnico', adminAuth, requireScope('servicio_tecnico:admin'));

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

  if (!['ST', 'OE', 'REFAB'].includes(tipoStr)) return res.status(400).json({ error: 'tipo debe ser ST, OE o REFAB' });

  let nNv = null;
  if (tipoStr === 'ST' || tipoStr === 'REFAB') {
    nNv = Number(nv);
    if (!Number.isInteger(nNv)) return res.status(400).json({ error: 'nv debe ser un entero para Servicio Técnico/Refabricado' });
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

function asyncRoute(fn) {
  return (req, res) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      console.error('servicio-tecnico-solicitudes error:', err);
      res.status(err.status || 400).json({ error: err.message || 'Error inesperado' });
    });
  };
}

// ===========================================================================
// Solicitudes de Servicio Técnico (Fase 0 - paso antes de generar una
// st_orden de producción). Mismo scope 'servicio_tecnico:admin' que ya
// gatea /servicio-tecnico arriba.
// ===========================================================================

// Info de un NV/NP para autocompletar - va ANTES de /solicitudes/:id para
// que Express no confunda "nv-info" con un :id.
router.get('/servicio-tecnico/solicitudes/nv-info/:numero', asyncRoute(async (req, res) => {
  const info = await solicitudesDb.resolverInfoNv(req.params.numero);
  if (!info) return res.status(404).json({ error: `No se encontró el NV ${req.params.numero}` });
  res.json({ ok: true, info });
}));

// Mediciones pendientes: vienen del propio flujo del Presupuestador
// (presupuestador_quotes.measurement_status), no de datos de Planta.
router.get('/servicio-tecnico/mediciones-pendientes', asyncRoute(async (_req, res) => {
  res.json({ ok: true, items: await medicionDb.listMedicionesPendientes() });
}));

router.get('/servicio-tecnico/solicitudes', asyncRoute(async (req, res) => {
  res.json({ ok: true, solicitudes: await solicitudesDb.listSolicitudes({ estado: req.query.estado }) });
}));

router.get('/servicio-tecnico/solicitudes/:id', asyncRoute(async (req, res) => {
  const solicitud = await solicitudesDb.getSolicitud(req.params.id);
  if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
  res.json({ ok: true, solicitud });
}));

router.post('/servicio-tecnico/solicitudes', asyncRoute(async (req, res) => {
  const solicitud = await solicitudesDb.createSolicitud({ ...req.body, creado_por: req.admin?.username || null });
  res.status(201).json({ ok: true, solicitud });
}));

router.patch('/servicio-tecnico/solicitudes/:id', asyncRoute(async (req, res) => {
  const solicitud = await solicitudesDb.updateSolicitud(req.params.id, req.body || {});
  res.json({ ok: true, solicitud });
}));

router.delete('/servicio-tecnico/solicitudes/:id', asyncRoute(async (req, res) => {
  await solicitudesDb.deleteSolicitud(req.params.id);
  res.json({ ok: true });
}));

router.post('/servicio-tecnico/solicitudes/:id/historial', asyncRoute(async (req, res) => {
  const entrada = await solicitudesDb.agregarHistorial(req.params.id, { ...req.body, autor: req.body?.autor || req.admin?.username || null });
  res.status(201).json({ ok: true, entrada });
}));

module.exports = router;

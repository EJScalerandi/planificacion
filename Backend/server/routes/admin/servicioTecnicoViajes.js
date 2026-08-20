// routes/admin/servicioTecnicoViajes.js
//
// Planificación de Fechas + Viajes de Servicio Técnico: espejo de
// routes/admin/logisticaViajes.js, aplicado a solicitudes de ST +
// mediciones pendientes (ver lib/servicioTecnicoViajesDb.js). Mismo scope
// 'servicio_tecnico:admin' que ya gatea /admin/servicio-tecnico.
const express = require('express');
const { adminAuth } = require('../../middleware/adminAuth');
const db = require('../../lib/servicioTecnicoViajesDb');
const solicitudesDb = require('../../lib/servicioTecnicoSolicitudesDb');
const medicionDb = require('../../lib/servicioTecnicoMedicionDb');
const logisticaDb = require('../../lib/logisticaViajesDb');

const router = express.Router();

function normalizeScopes(scopesRaw) {
  if (Array.isArray(scopesRaw)) return scopesRaw.map((s) => String(s || '').trim()).filter(Boolean);
  if (typeof scopesRaw === 'string') return scopesRaw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  return [];
}
function hasScope(req, scope) {
  return normalizeScopes(req?.admin?.scopes ?? req?.admin?.scope ?? req?.admin?.permissions ?? []).includes(scope);
}
function requireScope(scope) {
  return (req, res, next) => {
    if (!hasScope(req, scope)) return res.status(403).json({ error: `Requiere scope ${scope}` });
    return next();
  };
}

router.use('/servicio-tecnico/viajes-fechas', adminAuth, requireScope('servicio_tecnico:admin'));

function asyncRoute(fn) {
  return (req, res) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      console.error('servicio-tecnico-viajes error:', err);
      res.status(err.status || 400).json({ error: err.message || 'Error inesperado' });
    });
  };
}

// ===== Planificación de fechas: pool + tablero =====
// Une solicitudes (no resueltas/canceladas) + mediciones pendientes, con o
// sin fecha - el frontend arma el pool ("sin fecha") y el tablero por
// semana, mismo patrón que Planificación de Fechas de Logística.
router.get('/servicio-tecnico/viajes-fechas/items', asyncRoute(async (_req, res) => {
  const [solicitudesRes, mediciones] = await Promise.all([
    solicitudesDb.listSolicitudes({}),
    medicionDb.listMedicionesPendientes(),
  ]);
  const solicitudes = solicitudesRes
    .filter((s) => !['resuelto', 'cancelado'].includes(s.estado))
    .map((s) => ({
      tipo: 'solicitud', id: String(s.id), solicitud_id: s.id, quote_id: null,
      nv: s.nv, nombre_cliente: s.nombre_cliente, distribuidor: s.distribuidor, direccion: s.direccion,
      descripcion: s.descripcion, estado: s.estado, fecha: s.fecha_programada,
    }));
  const items = [
    ...solicitudes,
    ...mediciones.map((m) => ({
      tipo: 'medicion', id: m.quote_id, solicitud_id: null, quote_id: m.quote_id,
      nv: m.nv, nombre_cliente: m.nombre_cliente, distribuidor: null, direccion: m.direccion,
      descripcion: 'Medición pendiente', estado: null, fecha: m.fecha_programada,
    })),
  ];
  res.json({ ok: true, items });
}));

// Arrastrar un item a una semana (o sacarlo, fecha=null vuelve al pool).
router.patch('/servicio-tecnico/viajes-fechas/items/:tipo/:id', asyncRoute(async (req, res) => {
  const { tipo, id } = req.params;
  const fecha = req.body?.fecha || null;
  if (tipo === 'solicitud') {
    const solicitud = await solicitudesDb.updateSolicitud(id, { fecha_programada: fecha });
    return res.json({ ok: true, solicitud });
  }
  if (tipo === 'medicion') {
    await medicionDb.programarMedicion(id, fecha);
    return res.json({ ok: true });
  }
  return res.status(400).json({ error: 'tipo debe ser solicitud o medicion' });
}));

// ===== Config: zonas (lectura, compartidas con Logística) / vehículos / cuadrillas =====
router.get('/servicio-tecnico/viajes-fechas/config', asyncRoute(async (_req, res) => {
  res.json({ ok: true, config: await db.getConfig() });
}));

router.post('/servicio-tecnico/viajes-fechas/vehiculos', asyncRoute(async (req, res) => {
  res.json({ ok: true, vehiculo: await db.createVehiculo(req.body || {}) });
}));
router.patch('/servicio-tecnico/viajes-fechas/vehiculos/:id', asyncRoute(async (req, res) => {
  res.json({ ok: true, vehiculo: await db.updateVehiculo(req.params.id, req.body || {}) });
}));
router.delete('/servicio-tecnico/viajes-fechas/vehiculos/:id', asyncRoute(async (req, res) => {
  await db.deleteVehiculo(req.params.id);
  res.json({ ok: true });
}));

router.post('/servicio-tecnico/viajes-fechas/cuadrillas', asyncRoute(async (req, res) => {
  res.json({ ok: true, cuadrilla: await db.createCuadrilla(req.body || {}) });
}));
router.patch('/servicio-tecnico/viajes-fechas/cuadrillas/:id', asyncRoute(async (req, res) => {
  res.json({ ok: true, cuadrilla: await db.updateCuadrilla(req.params.id, req.body || {}) });
}));
router.delete('/servicio-tecnico/viajes-fechas/cuadrillas/:id', asyncRoute(async (req, res) => {
  await db.deleteCuadrilla(req.params.id);
  res.json({ ok: true });
}));
router.put('/servicio-tecnico/viajes-fechas/cuadrillas/:id/miembros', asyncRoute(async (req, res) => {
  res.json({ ok: true, cuadrilla: await db.setCuadrillaMiembros(req.params.id, req.body?.qc_user_ids) });
}));

// ===== Semanas / viajes / asignaciones =====
router.get('/servicio-tecnico/viajes-fechas/semanas', asyncRoute(async (_req, res) => {
  res.json({ ok: true, semanas: await db.getSemanas() });
}));
router.get('/servicio-tecnico/viajes-fechas/semanas/:semana', asyncRoute(async (req, res) => {
  res.json({ ok: true, detalle: await db.getSemanaDetalle(req.params.semana) });
}));

// "Sombra" de Logística: modo lectura de lo que Logística ya planificó para
// la misma semana (mismo formato de semana ISO en ambos módulos). Reusa la
// lectura de logisticaViajesDb pero queda gateado por el scope de Técnica -
// Diego no tiene (ni necesita) el scope de Logística para ver esto.
router.get('/servicio-tecnico/viajes-fechas/semanas/:semana/logistica-sombra', asyncRoute(async (req, res) => {
  res.json({ ok: true, detalle: await logisticaDb.getSemanaDetalle(req.params.semana) });
}));

router.post('/servicio-tecnico/viajes-fechas/semanas/:semana/viajes', asyncRoute(async (req, res) => {
  res.json({ ok: true, detalle: await db.crearViaje(req.params.semana, req.body || {}) });
}));
router.patch('/servicio-tecnico/viajes-fechas/viajes/:id', asyncRoute(async (req, res) => {
  res.json({ ok: true, detalle: await db.patchViaje(req.params.id, req.body || {}) });
}));
router.delete('/servicio-tecnico/viajes-fechas/viajes/:id', asyncRoute(async (req, res) => {
  res.json({ ok: true, detalle: await db.borrarViaje(req.params.id) });
}));
router.post('/servicio-tecnico/viajes-fechas/viajes/:id/items', asyncRoute(async (req, res) => {
  res.json({ ok: true, detalle: await db.asignarItem(req.params.id, req.body || {}) });
}));
router.delete('/servicio-tecnico/viajes-fechas/viajes/:id/items/:tipo/:itemId', asyncRoute(async (req, res) => {
  res.json({ ok: true, detalle: await db.desasignarItem(req.params.id, req.params.tipo, req.params.itemId) });
}));

router.post('/servicio-tecnico/viajes-fechas/semanas/:semana/cerrar', asyncRoute(async (req, res) => {
  res.json({ ok: true, detalle: await db.cerrarSemana(req.params.semana, req.admin?.username) });
}));
router.post('/servicio-tecnico/viajes-fechas/semanas/:semana/reabrir', asyncRoute(async (req, res) => {
  res.json({ ok: true, detalle: await db.reabrirSemana(req.params.semana) });
}));

module.exports = router;

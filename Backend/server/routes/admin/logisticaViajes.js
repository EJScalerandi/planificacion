// routes/admin/logisticaViajes.js
//
// Logística de Viajes: pantalla nueva (linkeada desde /a) para armar viajes
// (fecha + zona + cuadrilla + vehículo) por semana y repartir en ellos los
// portones con despacho/instalación de esa semana. Ver server/lib/logisticaViajesDb.js
// para el detalle de las queries.
const express = require('express');
const { adminAuth } = require('../../middleware/adminAuth');
const db = require('../../lib/logisticaViajesDb');

const router = express.Router();

const PREPROD_SCOPES = ['preproduccion:full', 'preproduccion:admin', 'preproduccion:comercial_view'];

function normalizeScopes(scopesRaw) {
  if (Array.isArray(scopesRaw)) return scopesRaw.map((s) => String(s || '').trim()).filter(Boolean);
  if (typeof scopesRaw === 'string') return scopesRaw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  return [];
}

function scopesOf(req) {
  return normalizeScopes(req?.admin?.scopes ?? req?.admin?.scope ?? req?.admin?.permissions ?? []);
}

// Lectura: cualquiera de los 3 scopes de Preproducción (igual que /a y que
// logistica-consultas). Escritura (crear/editar viajes, asignar portones,
// cerrar/reabrir semana, tocar config): solo preproduccion:full, el mismo
// scope que hoy es el único habilitado para tocar fecha_salida/fecha_llegada
// en /a.
function requirePreproduccionAccess(req, res, next) {
  if (!PREPROD_SCOPES.some((s) => scopesOf(req).includes(s))) {
    return res.status(403).json({ error: 'Requiere permisos de Preproducción' });
  }
  return next();
}

function requireFullAccess(req, res, next) {
  if (!scopesOf(req).includes('preproduccion:full')) {
    return res.status(403).json({ error: 'Requiere permisos completos de Preproducción (Logística)' });
  }
  return next();
}

router.use('/logistica', adminAuth, requirePreproduccionAccess);

function asyncRoute(fn) {
  return (req, res) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      console.error('logistica-viajes error:', err);
      const status = err.status || 400;
      res.status(status).json({ error: err.message || 'Error inesperado' });
    });
  };
}

// ===== Config =====
router.get('/logistica/config', asyncRoute(async (_req, res) => {
  res.json({ ok: true, config: await db.getConfig() });
}));

router.post('/logistica/zonas', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, zona: await db.createZona(req.body || {}) });
}));
router.patch('/logistica/zonas/:id', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, zona: await db.updateZona(req.params.id, req.body || {}) });
}));
router.delete('/logistica/zonas/:id', requireFullAccess, asyncRoute(async (req, res) => {
  await db.deleteZona(req.params.id);
  res.json({ ok: true });
}));

router.post('/logistica/vehiculos', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, vehiculo: await db.createVehiculo(req.body || {}) });
}));
router.patch('/logistica/vehiculos/:id', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, vehiculo: await db.updateVehiculo(req.params.id, req.body || {}) });
}));
router.delete('/logistica/vehiculos/:id', requireFullAccess, asyncRoute(async (req, res) => {
  await db.deleteVehiculo(req.params.id);
  res.json({ ok: true });
}));

router.post('/logistica/cuadrillas', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, cuadrilla: await db.createCuadrilla(req.body || {}) });
}));
router.patch('/logistica/cuadrillas/:id', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, cuadrilla: await db.updateCuadrilla(req.params.id, req.body || {}) });
}));
router.delete('/logistica/cuadrillas/:id', requireFullAccess, asyncRoute(async (req, res) => {
  await db.deleteCuadrilla(req.params.id);
  res.json({ ok: true });
}));
router.put('/logistica/cuadrillas/:id/miembros', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, cuadrilla: await db.setCuadrillaMiembros(req.params.id, req.body?.qc_user_ids) });
}));

router.post('/logistica/reglas-capacidad', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, regla: await db.createReglaCapacidad(req.body || {}) });
}));
router.patch('/logistica/reglas-capacidad/:id', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, regla: await db.updateReglaCapacidad(req.params.id, req.body || {}) });
}));
router.delete('/logistica/reglas-capacidad/:id', requireFullAccess, asyncRoute(async (req, res) => {
  await db.deleteReglaCapacidad(req.params.id);
  res.json({ ok: true });
}));

// ===== Semanas / viajes / asignaciones =====
router.get('/logistica/semanas', asyncRoute(async (_req, res) => {
  res.json({ ok: true, semanas: await db.getSemanas() });
}));

router.get('/logistica/semanas/:semana', asyncRoute(async (req, res) => {
  res.json({ ok: true, detalle: await db.getSemanaDetalle(req.params.semana) });
}));

router.post('/logistica/semanas/:semana/viajes', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, detalle: await db.crearViaje(req.params.semana, req.body || {}) });
}));

router.patch('/logistica/viajes/:id', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, detalle: await db.patchViaje(req.params.id, req.body || {}) });
}));

router.delete('/logistica/viajes/:id', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, detalle: await db.borrarViaje(req.params.id) });
}));

router.post('/logistica/viajes/:id/portones', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, detalle: await db.asignarPorton(req.params.id, req.body || {}) });
}));

router.delete('/logistica/viajes/:id/portones/:porton_id', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, detalle: await db.desasignarPorton(req.params.id, req.params.porton_id, req.query?.tipo) });
}));

router.post('/logistica/semanas/:semana/cerrar', requireFullAccess, asyncRoute(async (req, res) => {
  const cerradaBy = req?.admin?.username || req?.admin?.name || null;
  res.json({ ok: true, detalle: await db.cerrarSemana(req.params.semana, cerradaBy) });
}));

router.post('/logistica/semanas/:semana/reabrir', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, detalle: await db.reabrirSemana(req.params.semana) });
}));

module.exports = router;

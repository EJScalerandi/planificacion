// routes/public/despachoV2.js
//
// /despacho_v2 - versión mobile-first para la cuadrilla, pensada para
// reemplazar en el futuro a /despacho (el tablero de workflow clásico) - por
// ahora conviven, se desarrolla en paralelo (pedido explícito del usuario).
// Login propio (nombre de usuario QC + PIN, no es admin) - cada integrante
// de cuadrilla ve SOLO los viajes de su(s) propia(s) cuadrilla(s).
const express = require('express');
const crypto = require('crypto');
const { despachoV2Auth, signDespachoV2Token } = require('../../middleware/despachoV2Auth');
const db = require('../../lib/despachoV2Db');
const adjuntosDb = require('../../lib/logisticaAdjuntosDb');
const adjuntosStorage = require('../../lib/logisticaAdjuntosStorage');

const router = express.Router();

// Mismo salt/hash que ya usa el resto del sistema QC (routes/public/qc.js,
// routes/admin/qc.js) - así los PIN que ya tienen cargados los QC users
// sirven acá tal cual, sin duplicar usuarios.
const QC_PIN_SALT = process.env.QC_PIN_SALT || 'dev_change_me_pin_salt';
function hashPin(pin) {
  return crypto.createHmac('sha256', QC_PIN_SALT).update(String(pin)).digest('hex');
}

function asyncRoute(fn) {
  return (req, res) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      console.error('despacho-v2 error:', err);
      res.status(err.status || 400).json({ error: err.message || 'Error inesperado' });
    });
  };
}

// GET /despacho-v2/qc-users - lista para el picker de login (nombre, sin PIN).
router.get('/despacho-v2/qc-users', asyncRoute(async (_req, res) => {
  res.json({ ok: true, usuarios: await db.listQcUsersDeCuadrillas() });
}));

// POST /despacho-v2/login { qc_user_id, pin }
router.post('/despacho-v2/login', asyncRoute(async (req, res) => {
  const qcUserId = Number(req.body?.qc_user_id);
  const pinStr = String(req.body?.pin || '').trim();
  if (!Number.isInteger(qcUserId)) return res.status(400).json({ error: 'Falta elegir el usuario' });
  if (!/^\d{3,10}$/.test(pinStr)) return res.status(400).json({ error: 'PIN inválido (solo numérico)' });

  const user = await db.getQcUser(qcUserId);
  if (!user || !user.is_active || user.pin_hash !== hashPin(pinStr)) {
    return res.status(401).json({ error: 'PIN incorrecto o usuario inactivo' });
  }

  const cuadrillas = await db.cuadrillasDeUsuario(qcUserId);
  if (!cuadrillas.length) return res.status(403).json({ error: 'Este usuario no pertenece a ninguna cuadrilla activa' });

  const token = signDespachoV2Token({ qc_user_id: user.id, name: user.name });
  res.json({ ok: true, token, qc_user: { id: user.id, name: user.name }, cuadrillas });
}));

router.use('/despacho-v2', despachoV2Auth);

// GET /despacho-v2/viajes?rango=10d|todos
router.get('/despacho-v2/viajes', asyncRoute(async (req, res) => {
  const cuadrillas = await db.cuadrillasDeUsuario(req.despachoUser.qc_user_id);
  const cuadrillaIds = cuadrillas.map((c) => c.id);
  const soloProximos10 = String(req.query?.rango || '10d') !== 'todos';
  const viajes = await db.listViajesDeCuadrillas(cuadrillaIds, { soloProximos10 });
  res.json({ ok: true, cuadrillas, viajes });
}));

// POST /despacho-v2/viajes/:id/marcar-salida - botón Play.
router.post('/despacho-v2/viajes/:id/marcar-salida', asyncRoute(async (req, res) => {
  const viaje = await db.getViajeCuadrilla(req.params.id);
  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' });
  const cuadrillas = await db.cuadrillasDeUsuario(req.despachoUser.qc_user_id);
  if (!cuadrillas.some((c) => c.id === viaje.cuadrilla_id)) {
    return res.status(403).json({ error: 'Este viaje no es de tu cuadrilla' });
  }
  const hora_salida_real = await db.marcarSalidaReal(req.params.id);
  res.json({ ok: true, hora_salida_real });
}));

// GET /despacho-v2/viajes/:id/paradas - botón de tres líneas.
router.get('/despacho-v2/viajes/:id/paradas', asyncRoute(async (req, res) => {
  const viaje = await db.getViajeCuadrilla(req.params.id);
  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' });
  const cuadrillas = await db.cuadrillasDeUsuario(req.despachoUser.qc_user_id);
  if (!cuadrillas.some((c) => c.id === viaje.cuadrilla_id)) {
    return res.status(403).json({ error: 'Este viaje no es de tu cuadrilla' });
  }
  res.json({ ok: true, paradas: await db.listParadasDeViaje(req.params.id) });
}));

// GET /despacho-v2/nv/:nv - detalle completo al tocar un NV.
router.get('/despacho-v2/nv/:nv', asyncRoute(async (req, res) => {
  const detalle = await db.getNvDetalle(req.params.nv);
  if (!detalle) return res.status(400).json({ error: 'NV inválido' });
  res.json({ ok: true, nv: detalle });
}));

// GET /despacho-v2/nv/:nv/adjuntos - "los archivos adjuntados a la NV (lo
// que vimos antes)": mismo storage/tabla del feature de Adjuntos, expuesto
// acá para el login de cuadrilla (que no tiene token de admin). Solo
// lectura por ahora.
router.get('/despacho-v2/nv/:nv/adjuntos', asyncRoute(async (req, res) => {
  const rows = await adjuntosDb.listAdjuntos({ nv: Number(req.params.nv) });
  const conUrl = await Promise.all(rows.map(async (r) => ({ ...r, url: await adjuntosStorage.urlFirmada(r.storage_path) })));
  res.json({ ok: true, adjuntos: conUrl });
}));

// POST /despacho-v2/nv/:nv/st { descripcion, attachment? } - botón ST/PV.
router.post('/despacho-v2/nv/:nv/st', asyncRoute(async (req, res) => {
  const solicitud = await db.crearSolicitudSt({
    nv: req.params.nv,
    descripcion: req.body?.descripcion,
    attachment: req.body?.attachment || null,
    creadoPor: req.despachoUser.name,
  });
  res.json({ ok: true, solicitud });
}));

module.exports = router;

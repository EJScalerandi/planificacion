// routes/admin/logisticaAdjuntos.js
//
// Adjuntos de Logística (DNI, certificado de reincidencia que piden algunos
// countrys, etc.) - pedido explícito del usuario: "a las rutas y/o los
// portones". Router separado del resto de Logística de Viajes (trae una
// dependencia nueva, multer, y una responsabilidad bien distinta: archivos
// en Storage, no filas de la base de portones/viajes) pero mismo mecanismo
// de auth/scopes que logisticaViajes.js.
const express = require('express');
const multer = require('multer');
const { adminAuth } = require('../../middleware/adminAuth');
const db = require('../../lib/logisticaAdjuntosDb');
const storage = require('../../lib/logisticaAdjuntosStorage');

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

router.use('/logistica/adjuntos', adminAuth, requirePreproduccionAccess);

function asyncRoute(fn) {
  return (req, res) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      console.error('logistica-adjuntos error:', err);
      const status = err.status || (err?.__isStorageError ? 400 : 400);
      res.status(status).json({ error: err.message || 'Error inesperado' });
    });
  };
}

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']);
const MAX_BYTES = 15 * 1024 * 1024; // mismo límite configurado en el bucket

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) return cb(new Error('Tipo de archivo no permitido - solo imagen (jpg/png/webp/heic) o PDF'));
    cb(null, true);
  },
});

function extensionDe(nombreOriginal, mime) {
  const porNombre = String(nombreOriginal || '').split('.').pop();
  if (porNombre && porNombre.length <= 5 && /^[a-zA-Z0-9]+$/.test(porNombre)) return porNombre.toLowerCase();
  const porMime = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'application/pdf': 'pdf' };
  return porMime[mime] || 'bin';
}

// Lista los adjuntos de un viaje y/o un NV (al menos uno de los dos) con su
// URL firmada (corta duración - se regenera en cada consulta, no queda un
// link fijo con datos personales dando vueltas).
router.get('/logistica/adjuntos', asyncRoute(async (req, res) => {
  const { viaje_id, nv } = req.query;
  const rows = await db.listAdjuntos({
    viaje_id: viaje_id != null && viaje_id !== '' ? Number(viaje_id) : null,
    nv: nv != null && nv !== '' ? Number(nv) : null,
  });
  const conUrl = await Promise.all(rows.map(async (r) => ({ ...r, url: await storage.urlFirmada(r.storage_path) })));
  res.json({ ok: true, adjuntos: conUrl });
}));

router.post('/logistica/adjuntos', requireFullAccess, upload.single('archivo'), asyncRoute(async (req, res) => {
  if (!req.file) throw new Error('Falta el archivo');
  const viajeId = req.body?.viaje_id ? Number(req.body.viaje_id) : null;
  const nv = req.body?.nv ? Number(req.body.nv) : null;
  if (viajeId == null && nv == null) throw new Error('Falta viaje_id o nv');

  const carpeta = viajeId != null ? `viaje-${viajeId}` : `nv-${nv}`;
  const path = `${carpeta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionDe(req.file.originalname, req.file.mimetype)}`;
  await storage.subirArchivo(path, req.file.buffer, req.file.mimetype);

  const adjunto = await db.crearAdjunto({
    viaje_id: viajeId,
    nv,
    nombre_archivo: req.file.originalname,
    descripcion: req.body?.descripcion || null,
    tipo_mime: req.file.mimetype,
    tamano_bytes: req.file.size,
    storage_path: path,
    subido_por: req?.admin?.username || req?.admin?.name || null,
  });
  res.json({ ok: true, adjunto: { ...adjunto, url: await storage.urlFirmada(path) } });
}));

router.delete('/logistica/adjuntos/:id', requireFullAccess, asyncRoute(async (req, res) => {
  const path = await db.borrarAdjunto(req.params.id);
  if (path) await storage.borrarArchivo(path);
  res.json({ ok: true });
}));

// Multer manda sus propios errores (tamaño/tipo) antes de llegar a
// asyncRoute (los tira en el middleware de upload, no en un handler async) -
// sin esto quedaban como error 500 genérico en vez del mensaje claro.
router.use('/logistica/adjuntos', (err, req, res, next) => {
  if (err instanceof multer.MulterError || err) {
    return res.status(400).json({ error: err.message || 'No se pudo subir el archivo' });
  }
  return next(err);
});

module.exports = router;

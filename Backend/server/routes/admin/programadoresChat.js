// routes/admin/programadoresChat.js — Chat de Programadores: un único grupo
// tipo WhatsApp (texto, emojis, imágenes y archivos), solo para el scope
// programadores:admin, igual que el resto de la sección "Programadores" del
// menú. Polling simple desde el front (no websockets), mismo criterio que la
// bandeja de WhatsApp de Logística.
const express = require('express');
const multer = require('multer');
const { adminAuth } = require('../../middleware/adminAuth');
const chatDb = require('../../lib/programadoresChatDb');
const storage = require('../../lib/programadoresChatStorage');

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

// Con path: ver nota equivalente en admin/prefabricados.js.
router.use('/programadores/chat', adminAuth, requireScope(chatDb.SCOPE));

const MAX_TEXTO = 4000;
const MAX_ARCHIVOS = 5;
// Por extensión y no por MIME: el navegador manda '' o
// application/octet-stream para varios de estos (.sql, .log, .md...).
const EXTENSIONES = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'heic',
  'pdf', 'txt', 'log', 'md', 'csv', 'json', 'xml', 'sql',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'zip', 'rar', '7z',
  'mp4', 'webm', 'mov', 'mp3', 'ogg', 'wav', 'm4a',
]);

function extensionDe(nombre) {
  const m = String(nombre || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

const upload = multer({
  storage: multer.memoryStorage(),
  // Default de multer es latin1: rompe los acentos del nombre original.
  defParamCharset: 'utf8',
  limits: { fileSize: storage.MAX_BYTES, files: MAX_ARCHIVOS },
  fileFilter: (req, file, cb) => {
    if (!EXTENSIONES.has(extensionDe(file.originalname))) {
      return cb(new Error(`Tipo de archivo no permitido: ${file.originalname}`));
    }
    return cb(null, true);
  },
});

// Los errores de multer (archivo muy grande, demasiados archivos, tipo no
// permitido) como 400 con mensaje, no el 500 HTML por defecto de express.
function subirArchivos(req, res, next) {
  upload.array('archivos', MAX_ARCHIVOS)(req, res, (err) => {
    if (!err) return next();
    let error = err.message || 'Error subiendo los archivos';
    if (err.code === 'LIMIT_FILE_SIZE') error = `Cada archivo puede pesar hasta ${storage.MAX_BYTES / (1024 * 1024)} MB`;
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') error = `Máximo ${MAX_ARCHIVOS} archivos por mensaje`;
    return res.status(400).json({ error });
  });
}

function parseId(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

// El path en Storage termina en el nombre original (saneado), así al abrir
// un .xlsx/.zip el navegador lo baja con un nombre reconocible.
function pathPara(nombre) {
  const ahora = new Date();
  const mes = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
  const limpio = String(nombre || 'archivo')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(-80) || 'archivo';
  return `${mes}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}/${limpio}`;
}

async function conUrls(mensajes) {
  const paths = mensajes.flatMap((m) => (Array.isArray(m.adjuntos) ? m.adjuntos.map((a) => a.path) : []));
  const urls = await storage.urlsFirmadas(paths);
  return mensajes.map((m) => ({
    id: Number(m.id),
    autor_username: m.autor_username,
    texto: m.texto,
    created_at: m.created_at,
    adjuntos: (Array.isArray(m.adjuntos) ? m.adjuntos : []).map((a) => ({
      nombre: a.nombre,
      tipo: a.tipo,
      tamano: a.tamano,
      url: urls[a.path] || null,
    })),
  }));
}

// GET /admin/programadores/chat/mensajes?despues_de=ID | ?antes_de=ID
router.get('/programadores/chat/mensajes', async (req, res) => {
  try {
    const despuesDe = parseId(req.query.despues_de);
    const antesDe = parseId(req.query.antes_de);
    const [{ mensajes, hayMas }, lecturas, miembros] = await Promise.all([
      chatDb.listMensajes({ despuesDe, antesDe }),
      chatDb.listLecturas(),
      chatDb.listMiembros(),
    ]);
    return res.json({ ok: true, mensajes: await conUrls(mensajes), hayMas, lecturas, miembros });
  } catch (err) {
    console.error('programadores chat list error:', err);
    return res.status(500).json({ error: 'Error cargando el chat', detail: err.message });
  }
});

// POST /admin/programadores/chat/mensajes — multipart: texto + archivos[]
router.post('/programadores/chat/mensajes', subirArchivos, async (req, res) => {
  try {
    const username = String(req.admin?.username || '').trim();
    if (!username) return res.status(401).json({ error: 'Sesión sin usuario' });

    const texto = String(req.body?.texto || '').trim();
    const archivos = Array.isArray(req.files) ? req.files : [];
    if (!texto && !archivos.length) return res.status(400).json({ error: 'El mensaje está vacío' });
    if (texto.length > MAX_TEXTO) return res.status(400).json({ error: `El mensaje puede tener hasta ${MAX_TEXTO} caracteres` });

    const adjuntos = [];
    for (const f of archivos) {
      const nombre = f.originalname;
      const path = pathPara(nombre);
      const tipo = f.mimetype && f.mimetype !== 'application/octet-stream' ? f.mimetype : 'application/octet-stream';
      await storage.subirArchivo(path, f.buffer, tipo);
      adjuntos.push({ path, nombre, tipo, tamano: f.size });
    }

    const creado = await chatDb.createMensaje({
      autorId: req.admin?.sub || null,
      autorUsername: username,
      texto,
      adjuntos,
    });
    // El que escribe ya "leyó" hasta su propio mensaje.
    await chatDb.marcarLeido(username, Number(creado.id));
    const [mensaje] = await conUrls([creado]);
    return res.json({ ok: true, mensaje });
  } catch (err) {
    console.error('programadores chat send error:', err);
    return res.status(500).json({ error: err.message || 'Error enviando el mensaje' });
  }
});

// POST /admin/programadores/chat/leido — { hasta_id }
router.post('/programadores/chat/leido', async (req, res) => {
  try {
    const username = String(req.admin?.username || '').trim();
    const hastaId = parseId(req.body?.hasta_id);
    if (!username) return res.status(401).json({ error: 'Sesión sin usuario' });
    if (hastaId == null) return res.status(400).json({ error: 'hasta_id inválido' });
    await chatDb.marcarLeido(username, hastaId);
    return res.json({ ok: true });
  } catch (err) {
    console.error('programadores chat leido error:', err);
    return res.status(500).json({ error: 'Error marcando como leído', detail: err.message });
  }
});

// GET /admin/programadores/chat/no-leidos — para el badge del menú.
router.get('/programadores/chat/no-leidos', async (req, res) => {
  try {
    const username = String(req.admin?.username || '').trim();
    if (!username) return res.status(401).json({ error: 'Sesión sin usuario' });
    const count = await chatDb.contarNoLeidos(username);
    return res.json({ ok: true, count });
  } catch (err) {
    console.error('programadores chat no-leidos error:', err);
    return res.status(500).json({ error: 'Error contando no leídos', detail: err.message });
  }
});

module.exports = router;

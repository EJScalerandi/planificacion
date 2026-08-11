// routes/admin/logisticaConsultas.js
//
// Consultas de Logística hacia Técnica/Comercial desde /a (Autorizaciones ·
// Preproducción Portones). Ver server/lib/logisticaConsultasDb.js para el
// detalle de por qué esto escribe directo en las tablas del Presupuestador.
const express = require('express');
const { adminAuth } = require('../../middleware/adminAuth');
const {
  listConsults,
  createConsult,
  getConsultDetail,
  addConsultMessage,
  markConsultRead,
  getUnreadSummary,
} = require('../../lib/logisticaConsultasDb');

const router = express.Router();

const PREPROD_SCOPES = ['preproduccion:full', 'preproduccion:admin', 'preproduccion:comercial_view'];

function normalizeScopes(scopesRaw) {
  if (Array.isArray(scopesRaw)) return scopesRaw.map((s) => String(s || '').trim()).filter(Boolean);
  if (typeof scopesRaw === 'string') return scopesRaw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  return [];
}

function requirePreproduccionAccess(req, res, next) {
  const scopes = normalizeScopes(req?.admin?.scopes ?? req?.admin?.scope ?? req?.admin?.permissions ?? []);
  if (!PREPROD_SCOPES.some((s) => scopes.includes(s))) {
    return res.status(403).json({ error: 'Requiere permisos de Preproducción' });
  }
  return next();
}

router.use('/logistica-consultas', adminAuth, requirePreproduccionAccess);

function validKind(req, res, next) {
  const kind = String(req.params.kind || '').trim();
  if (!['technical', 'commercial'].includes(kind)) {
    return res.status(400).json({ error: 'kind debe ser technical o commercial' });
  }
  next();
}

router.get('/logistica-consultas/:kind/unread-summary', validKind, async (req, res) => {
  try {
    const summary = await getUnreadSummary(req.params.kind);
    res.json({ ok: true, summary });
  } catch (err) {
    res.status(500).json({ error: 'Error leyendo resumen', detail: err.message });
  }
});

router.get('/logistica-consultas/:kind', validKind, async (req, res) => {
  try {
    const tickets = await listConsults(req.params.kind, { status: req.query?.status });
    res.json({ ok: true, tickets });
  } catch (err) {
    res.status(500).json({ error: 'Error leyendo consultas', detail: err.message });
  }
});

router.post('/logistica-consultas/:kind', validKind, async (req, res) => {
  try {
    const ticket = await createConsult(req.params.kind, req.body || {});
    res.json({ ok: true, ticket });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Error creando la consulta' });
  }
});

router.get('/logistica-consultas/:kind/:id', validKind, async (req, res) => {
  try {
    const ticket = await getConsultDetail(req.params.kind, req.params.id);
    res.json({ ok: true, ticket });
  } catch (err) {
    res.status(404).json({ error: err.message || 'Consulta no encontrada' });
  }
});

router.post('/logistica-consultas/:kind/:id/messages', validKind, async (req, res) => {
  try {
    const ticket = await addConsultMessage(req.params.kind, req.params.id, req.body || {});
    res.json({ ok: true, ticket });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Error enviando el mensaje' });
  }
});

router.post('/logistica-consultas/:kind/:id/read', validKind, async (req, res) => {
  try {
    await markConsultRead(req.params.kind, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Error marcando como leída' });
  }
});

module.exports = router;

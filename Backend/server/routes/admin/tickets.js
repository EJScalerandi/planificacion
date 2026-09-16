// routes/admin/tickets.js — sistema de tickets: cualquier admin logueado
// puede crear tickets, ver/responder los propios, y también ver/responder/
// cerrar cualquier ticket desde /admin/tickets (sin scope propio, igual que
// /admin/indice-programacion: una pantalla admin más, no restringida).
const express = require('express');
const { adminAuth } = require('../../middleware/adminAuth');
const ticketsDb = require('../../lib/ticketsDb');

const router = express.Router();

const ESTADOS_VALIDOS = ['pending', 'in_progress', 'closed'];
const MAX_ADJUNTOS = 5;
// ~15MB de bytes crudos de adjuntos (igual al límite combinado del cliente,
// ver ticketAttachment.js) codificado en base64 (~x1.34). El cliente ya
// valida esto antes de enviar, pero acá no hay que confiar ciegamente en
// eso: es la segunda línea de defensa server-side.
const MAX_ADJUNTOS_DATA_URL_CHARS = 21 * 1024 * 1024;
// El cliente SIEMPRE genera data_url con FileReader.readAsDataURL(), así que
// nunca debería ser otra cosa. Sin este chequeo, alguien podía mandar
// data_url = "https://atacante.com/pixel.gif" (o un data: URI con un mime no
// permitido, ej. text/html) y que se renderizara solo (<img src>) o se
// abriera (openTicketAttachment) al primer admin que mirara el ticket —
// tracking pixel o, peor, un blob text/html ejecutando JS en el origen del
// panel admin (robo de token vía localStorage). Se valida el mime REAL
// embebido en el data: URI, no el campo `type` (que también lo controla
// quien manda el ticket y no tiene por qué coincidir).
const ALLOWED_ADJUNTO_DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp|gif)|application\/pdf|video\/(?:mp4|quicktime|webm));base64,/i;

function normalizeAdjuntos(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_ADJUNTOS).map((a) => ({
    name: String(a?.name || 'adjunto').slice(0, 200),
    type: String(a?.type || 'application/octet-stream').slice(0, 100),
    size: Number(a?.size || 0) || 0,
    data_url: String(a?.data_url || ''),
    uploaded_at: a?.uploaded_at || new Date().toISOString(),
  })).filter((a) => ALLOWED_ADJUNTO_DATA_URL_RE.test(a.data_url));
}

function adjuntosExceedTotal(adjuntos) {
  return adjuntos.reduce((sum, a) => sum + a.data_url.length, 0) > MAX_ADJUNTOS_DATA_URL_CHARS;
}

// POST /admin/tickets — crear un ticket
router.post('/tickets', adminAuth, async (req, res) => {
  try {
    const categoria = String(req.body?.categoria || '').trim();
    const mensaje = String(req.body?.mensaje || '').trim();
    const rutaOrigen = req.body?.rutaOrigen ? String(req.body.rutaOrigen) : null;
    if (!categoria) return res.status(400).json({ error: 'Falta la categoría' });
    if (!mensaje) return res.status(400).json({ error: 'Falta el mensaje' });
    const adjuntos = normalizeAdjuntos(req.body?.adjuntos);
    if (adjuntosExceedTotal(adjuntos)) {
      return res.status(400).json({ error: 'Los adjuntos superan el tamaño total permitido.' });
    }

    const ticket = await ticketsDb.createTicket({
      categoria,
      mensaje,
      rutaOrigen,
      creadoPorId: req.admin?.sub || null,
      creadoPorUsername: req.admin?.username || null,
      appOrigen: 'planificacion',
      adjuntos,
    });
    return res.json({ ok: true, ticket });
  } catch (err) {
    console.error('tickets create error:', err);
    return res.status(500).json({ error: 'Error creando el ticket', detail: err.message });
  }
});

// GET /admin/tickets/mine — mis tickets (van antes de /:id para que Express
// no confunda "mine" con un id).
router.get('/tickets/mine', adminAuth, async (req, res) => {
  try {
    const userId = req.admin?.sub || null;
    const tickets = await ticketsDb.listMyTickets(userId);
    return res.json({ ok: true, tickets });
  } catch (err) {
    console.error('tickets mine list error:', err);
    return res.status(500).json({ error: 'Error listando tus tickets', detail: err.message });
  }
});

// GET /admin/tickets/mine/:id — detalle de un ticket propio
router.get('/tickets/mine/:id', adminAuth, async (req, res) => {
  try {
    const userId = req.admin?.sub || null;
    const ticket = await ticketsDb.getTicketForOwner(Number(req.params.id), userId);
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
    return res.json({ ok: true, ticket });
  } catch (err) {
    console.error('tickets mine detail error:', err);
    return res.status(500).json({ error: 'Error obteniendo el ticket', detail: err.message });
  }
});

// POST /admin/tickets/mine/:id/messages — agregar un mensaje a un ticket propio
router.post('/tickets/mine/:id/messages', adminAuth, async (req, res) => {
  try {
    const userId = req.admin?.sub || null;
    const ticket = await ticketsDb.getTicketForOwner(Number(req.params.id), userId);
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
    const mensaje = String(req.body?.mensaje || '').trim();
    if (!mensaje) return res.status(400).json({ error: 'Falta el mensaje' });
    const nuevo = await ticketsDb.addMessage(ticket.id, {
      autorId: userId,
      autorUsername: req.admin?.username || null,
      esAdmin: false,
      mensaje,
    });
    return res.json({ ok: true, mensaje: nuevo });
  } catch (err) {
    console.error('tickets mine message error:', err);
    return res.status(500).json({ error: 'Error agregando el mensaje', detail: err.message });
  }
});

// DELETE /admin/tickets/mine/:id — anular (= borrar) un ticket propio,
// autoservicio, no hace falta que intervenga soporte. Solo si todavía no
// está "closed" (ya resuelto por soporte, eso queda como historial).
router.delete('/tickets/mine/:id', adminAuth, async (req, res) => {
  try {
    const userId = req.admin?.sub || null;
    const borrado = await ticketsDb.deleteOwnTicket(Number(req.params.id), userId);
    if (!borrado) {
      return res.status(404).json({ error: 'Ticket no encontrado o ya no se puede anular' });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('tickets mine delete error:', err);
    return res.status(500).json({ error: 'Error anulando el ticket', detail: err.message });
  }
});

// ---- Pantalla admin /admin/tickets: cualquier admin logueado gestiona todos ----

// GET /admin/tickets — listar todos, filtro opcional ?estado=&categoria=
router.get('/tickets', adminAuth, async (req, res) => {
  try {
    const estado = req.query.estado ? String(req.query.estado) : undefined;
    const categoria = req.query.categoria ? String(req.query.categoria) : undefined;
    const appOrigen = req.query.app ? String(req.query.app) : undefined;
    const tickets = await ticketsDb.listAllTickets({ estado, categoria, appOrigen });
    return res.json({ ok: true, tickets });
  } catch (err) {
    console.error('tickets admin list error:', err);
    return res.status(500).json({ error: 'Error listando tickets', detail: err.message });
  }
});

// GET /admin/tickets/:id — detalle de cualquier ticket
router.get('/tickets/:id', adminAuth, async (req, res) => {
  try {
    const ticket = await ticketsDb.getTicketAdmin(Number(req.params.id));
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
    return res.json({ ok: true, ticket });
  } catch (err) {
    console.error('tickets admin detail error:', err);
    return res.status(500).json({ error: 'Error obteniendo el ticket', detail: err.message });
  }
});

// POST /admin/tickets/:id/messages — responder
router.post('/tickets/:id/messages', adminAuth, async (req, res) => {
  try {
    const ticket = await ticketsDb.getTicketAdmin(Number(req.params.id));
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
    const mensaje = String(req.body?.mensaje || '').trim();
    if (!mensaje) return res.status(400).json({ error: 'Falta el mensaje' });
    const nuevo = await ticketsDb.addMessage(ticket.id, {
      autorId: req.admin?.sub || null,
      autorUsername: req.admin?.username || null,
      esAdmin: true,
      mensaje,
    });
    return res.json({ ok: true, mensaje: nuevo });
  } catch (err) {
    console.error('tickets admin message error:', err);
    return res.status(500).json({ error: 'Error agregando el mensaje', detail: err.message });
  }
});

// PATCH /admin/tickets/:id/status — cambiar estado
router.patch('/tickets/:id/status', adminAuth, async (req, res) => {
  try {
    const estado = String(req.body?.estado || '').trim();
    if (!ESTADOS_VALIDOS.includes(estado)) {
      return res.status(400).json({ error: `Estado inválido. Debe ser uno de: ${ESTADOS_VALIDOS.join(', ')}` });
    }
    const ticket = await ticketsDb.setEstado(Number(req.params.id), estado);
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
    return res.json({ ok: true, ticket });
  } catch (err) {
    console.error('tickets admin status error:', err);
    return res.status(500).json({ error: 'Error actualizando el estado', detail: err.message });
  }
});

// DELETE /admin/tickets/:id — borrar un ticket ya cerrado, a mano. Cualquier
// admin logueado (no hace falta ser quien lo creó), pero solo si está
// "closed" - es una decisión explícita sobre historial ya resuelto, no algo
// automático.
router.delete('/tickets/:id', adminAuth, async (req, res) => {
  try {
    const borrado = await ticketsDb.deleteClosedTicket(Number(req.params.id));
    if (!borrado) {
      return res.status(404).json({ error: 'Ticket no encontrado o todavía no está cerrado' });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('tickets admin delete error:', err);
    return res.status(500).json({ error: 'Error borrando el ticket', detail: err.message });
  }
});

module.exports = router;

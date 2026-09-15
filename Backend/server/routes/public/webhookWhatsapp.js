// routes/public/webhookWhatsapp.js
//
// Webhook permanente de WhatsApp Business (Meta Cloud API) - pedido explícito
// del usuario para tener una bandeja de mensajes real (antes solo se podía
// mandar, nunca se recibía nada porque no había ningún callback registrado en
// Meta). Sin autenticación admin a propósito: lo llama Meta, no un usuario
// logueado - la única protección es el WHATSAPP_WEBHOOK_VERIFY_TOKEN en el
// handshake de suscripción.
const express = require('express');
const whatsapp = require('../../lib/logisticaWhatsapp');

const router = express.Router();

const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

router.get('/webhooks/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token && VERIFY_TOKEN && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Meta reintenta si no responde 200 rápido - procesamos y confirmamos
// enseguida, sin esperar a que terminen los inserts/updates (best-effort,
// cada uno ya atrapa sus propios errores).
router.post('/webhooks/whatsapp', (req, res) => {
  res.sendStatus(200);

  try {
    const entries = req.body?.entry || [];
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const value = change.value || {};

        for (const msg of value.messages || []) {
          const tipo = msg.type;
          let contenido = null;
          let mediaId = null;
          if (tipo === 'text') contenido = msg.text?.body || null;
          else if (tipo === 'button') contenido = msg.button?.text || null;
          else if (tipo === 'interactive') contenido = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || null;
          else if (['image', 'video', 'audio', 'document', 'sticker'].includes(tipo)) {
            mediaId = msg[tipo]?.id || null;
            contenido = msg[tipo]?.caption || null;
          } else if (tipo === 'location') {
            contenido = `📍 ${msg.location?.name || ''} ${msg.location?.address || ''}`.trim() || '📍 Ubicación compartida';
          }
          whatsapp.registrarMensajeEntrante({
            telefono: msg.from,
            tipo,
            contenido,
            mediaId,
            waMessageId: msg.id,
            raw: msg,
          }).catch((e) => console.error('Error registrando mensaje entrante de WhatsApp:', e.message));
        }

        for (const st of value.statuses || []) {
          whatsapp.actualizarEstadoMensaje({
            waMessageId: st.id,
            estado: st.status === 'delivered' ? 'entregado' : st.status === 'read' ? 'leido' : st.status === 'failed' ? 'fallido' : st.status,
            detalleError: st.errors?.[0]?.title || null,
          }).catch((e) => console.error('Error actualizando estado de WhatsApp:', e.message));
        }
      }
    }
  } catch (e) {
    console.error('Error procesando webhook de WhatsApp:', e.message);
  }
});

module.exports = router;

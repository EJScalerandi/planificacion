// lib/logisticaWhatsapp.js
//
// Aviso automático de WhatsApp Business (Meta Cloud API) a la próxima
// parada de la ruta cuando la cuadrilla marca un portón entregado/instalado
// - pedido explícito del usuario. Requiere una plantilla APROBADA por Meta
// (mensajes que la empresa inicia primero, sin que el cliente haya escrito
// antes, siempre necesitan plantilla - no es opcional). Ver
// WHATSAPP_TEMPLATE_* en .env para el nombre/idioma de la plantilla.
//
// Limitación real de la plataforma (no del código): una plantilla admite UN
// solo header de imagen, no varias fotos sueltas - por eso todas las fotos
// (cuadrilla + vehículo) se combinan acá mismo en UN collage antes de
// mandar, en vez de mandar un mensaje por foto (que además multiplicaría
// el costo y necesitaría una plantilla aprobada por cada una).
const axios = require('axios');
const sharp = require('sharp');
const storage = require('./logisticaAdjuntosStorage');

const GRAPH_VERSION = 'v21.0';
const WA_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WA_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WA_TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_NAME || 'porton_en_camino';
const WA_TEMPLATE_LANG = process.env.WHATSAPP_TEMPLATE_LANG || 'es_AR';

function configurado() {
  return !!(WA_TOKEN && WA_PHONE_NUMBER_ID);
}

const TILE = 480;

// Placeholder de marca (SVG->PNG con sharp, sin depender de ningún archivo
// externo) - se usa SOLO si todavía no hay ninguna foto de cuadrilla/vehículo
// cargada, para que el envío nunca falle por falta de imagen (la plantilla,
// una vez aprobada con header de imagen, SIEMPRE necesita una).
async function placeholderMarca() {
  const svg = `
    <svg width="${TILE}" height="${TILE}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#0a6a33"/>
      <text x="50%" y="46%" font-family="sans-serif" font-size="40" font-weight="900" fill="#fff" text-anchor="middle">De Grandis</text>
      <text x="50%" y="58%" font-family="sans-serif" font-size="40" font-weight="900" fill="#fff" text-anchor="middle">Portones</text>
    </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// Baja las fotos (cuadrilla + vehículo, lo que haya) y las arma en una
// grilla - máximo 6 (3 columnas x 2 filas), si sobran se recortan (mejor
// mandar un collage con las primeras que fallar el envío entero).
async function armarCollage({ fotosStoragePaths }) {
  const paths = (fotosStoragePaths || []).filter(Boolean).slice(0, 6);

  let buffers = [];
  if (paths.length) {
    const descargadas = await Promise.all(paths.map((p) => storage.descargarArchivo(p).catch(() => null)));
    buffers = descargadas.filter(Boolean);
  }
  if (!buffers.length) buffers = [await placeholderMarca()];

  const resized = await Promise.all(
    buffers.map((buf) => sharp(buf).resize(TILE, TILE, { fit: 'cover' }).toBuffer())
  );

  const cols = Math.min(3, resized.length);
  const rows = Math.ceil(resized.length / cols);
  const composites = resized.map((buf, i) => ({ input: buf, left: (i % cols) * TILE, top: Math.floor(i / cols) * TILE }));

  return sharp({ create: { width: cols * TILE, height: rows * TILE, channels: 3, background: '#ffffff' } })
    .composite(composites)
    .jpeg({ quality: 85 })
    .toBuffer();
}

// Sube el collage a Storage (mismo bucket privado de adjuntos, prefijo
// aparte) y devuelve una URL firmada - Meta la descarga al toque de mandar
// el mensaje, 10 minutos alcanza de sobra.
async function subirCollageYFirmar(buffer) {
  const path = `whatsapp-collage/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  await storage.subirArchivo(path, buffer, 'image/jpeg');
  return storage.urlFirmada(path, 600);
}

function formatearTelefono(telefono) {
  const digitos = String(telefono || '').replace(/\D/g, '');
  if (!digitos) return null;
  return digitos.startsWith('54') ? digitos : `54${digitos.replace(/^0/, '')}`;
}

/**
 * @param {object} p
 * @param {string} p.telefono - del cliente destino
 * @param {string} p.nombreCliente
 * @param {string} p.horasTexto - ej. "2 horas y 50 minutos"
 * @param {string} p.cuadrillaTexto - ej. "Martín Ferreyra (Chofer), Francisco Correa"
 * @param {string} p.vehiculoNombre
 * @param {string[]} p.fotosStoragePaths - paths de Storage (cuadrilla + vehículo)
 */
async function enviarAvisoEnCamino({ telefono, nombreCliente, horasTexto, cuadrillaTexto, vehiculoNombre, fotosStoragePaths }) {
  if (!configurado()) {
    console.warn('WhatsApp Business no configurado en este entorno (falta WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID) - no se manda el aviso.');
    return { ok: false, error: 'WhatsApp Business no configurado en este entorno' };
  }
  const conCodigo = formatearTelefono(telefono);
  if (!conCodigo) return { ok: false, error: 'El cliente no tiene teléfono cargado' };

  let imagenUrl = null;
  try {
    const collage = await armarCollage({ fotosStoragePaths });
    imagenUrl = await subirCollageYFirmar(collage);
  } catch (e) {
    console.error('Error armando/subiendo el collage de WhatsApp:', e.message);
    return { ok: false, error: 'No se pudo armar la imagen del mensaje', detalle: e.message };
  }

  try {
    const { data } = await axios.post(
      `https://graph.facebook.com/${GRAPH_VERSION}/${WA_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: conCodigo,
        type: 'template',
        template: {
          name: WA_TEMPLATE_NAME,
          language: { code: WA_TEMPLATE_LANG },
          components: [
            { type: 'header', parameters: [{ type: 'image', image: { link: imagenUrl } }] },
            {
              type: 'body',
              parameters: [
                { type: 'text', text: nombreCliente || 'cliente' },
                { type: 'text', text: horasTexto || 'poco tiempo' },
                { type: 'text', text: cuadrillaTexto || '(sin cargar)' },
                { type: 'text', text: vehiculoNombre || 'un camión' },
              ],
            },
          ],
        },
      },
      { headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    return { ok: true, wa_message_id: data?.messages?.[0]?.id || null };
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message;
    console.error('Error mandando WhatsApp:', msg, JSON.stringify(e.response?.data || {}));
    return { ok: false, error: msg, detalle: e.response?.data };
  }
}

module.exports = { configurado, enviarAvisoEnCamino, armarCollage };

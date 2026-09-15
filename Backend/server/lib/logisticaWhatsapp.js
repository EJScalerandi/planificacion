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

// Collage de 2 filas (pedido explícito del usuario): arriba las fotos de la
// cuadrilla (1 a 3, lado a lado), abajo SIEMPRE la del vehículo, estirada
// (cover, sin deformar) al ancho total de la fila de arriba - así el
// resultado queda prolijo tenga 1, 2 o 3 integrantes.
async function armarCollage({ fotosMiembros, fotoVehiculo }) {
  const pathsMiembros = (fotosMiembros || []).filter(Boolean).slice(0, 3);

  let buffersMiembros = [];
  if (pathsMiembros.length) {
    const descargadas = await Promise.all(pathsMiembros.map((p) => storage.descargarArchivo(p).catch(() => null)));
    buffersMiembros = descargadas.filter(Boolean);
  }
  if (!buffersMiembros.length) buffersMiembros = [await placeholderMarca()];

  const bufferVehiculo = (fotoVehiculo && await storage.descargarArchivo(fotoVehiculo).catch(() => null)) || await placeholderMarca();

  const cols = buffersMiembros.length;
  const anchoTotal = cols * TILE;

  const [arriba, abajo] = await Promise.all([
    Promise.all(buffersMiembros.map((buf) => sharp(buf).resize(TILE, TILE, { fit: 'cover' }).toBuffer())),
    sharp(bufferVehiculo).resize(anchoTotal, TILE, { fit: 'cover' }).toBuffer(),
  ]);

  const composites = [
    ...arriba.map((buf, i) => ({ input: buf, left: i * TILE, top: 0 })),
    { input: abajo, left: 0, top: TILE },
  ];

  return sharp({ create: { width: anchoTotal, height: TILE * 2, channels: 3, background: '#ffffff' } })
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

// Argentina exige el "9" después del 54 para celulares en el formato que
// pide la API (a diferencia de wa.me, que es más permisivo y no lo exige) -
// ej. 5493572405259, no 543572405259 - confirmado por el usuario al probar
// la API real. Ningún código de área argentino arranca con 9, así que
// chequear si YA está no confunde un área real con la marca de celular.
function formatearTelefono(telefono) {
  const digitos = String(telefono || '').replace(/\D/g, '');
  if (!digitos) return null;
  if (digitos.startsWith('54')) {
    const resto = digitos.slice(2);
    return resto.startsWith('9') ? digitos : `549${resto}`;
  }
  return `549${digitos.replace(/^0/, '')}`;
}

/**
 * @param {object} p
 * @param {string} p.telefono - del cliente destino
 * @param {string} p.nombreCliente
 * @param {string} p.horasTexto - ej. "2 horas y 50 minutos"
 * @param {string} p.cuadrillaTexto - ej. "Martín Ferreyra (Chofer), Francisco Correa"
 * @param {string} p.vehiculoNombre
 * @param {string[]} p.fotosMiembros - paths de Storage de la cuadrilla (1 a 3)
 * @param {string} p.fotoVehiculo - path de Storage de la foto del vehículo
 */
async function enviarAvisoEnCamino({ telefono, nombreCliente, horasTexto, cuadrillaTexto, vehiculoNombre, fotosMiembros, fotoVehiculo }) {
  if (!configurado()) {
    console.warn('WhatsApp Business no configurado en este entorno (falta WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID) - no se manda el aviso.');
    return { ok: false, error: 'WhatsApp Business no configurado en este entorno' };
  }
  const conCodigo = formatearTelefono(telefono);
  if (!conCodigo) return { ok: false, error: 'El cliente no tiene teléfono cargado' };

  let imagenUrl = null;
  try {
    const collage = await armarCollage({ fotosMiembros, fotoVehiculo });
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

// lib/logisticaGastosIa.js
//
// Lectura de comprobantes de gastos por IA (Claude, mismo motor que el resto
// de "Logística IA" en esta app) - pedido explícito del usuario: la
// cuadrilla sube la foto/PDF primero, la IA le completa fecha/motivo/monto/
// tipo de comprobante, y chequea la fecha contra el rango real del viaje
// (hora_salida_real -> hora_llegada_real). El chequeo de fecha es
// DETERMINÍSTICO en código, nunca se le confía la aritmética de fechas al
// modelo - la IA solo lee el papel.
const Anthropic = require('@anthropic-ai/sdk');

const MOTIVOS = ['Refrigerio', 'Hospedaje', 'Otros'];
const TIPOS_COMPROBANTE = ['Factura A', 'Factura B', 'Factura C', 'Ticket', 'Otro'];

const GASTO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    fecha: { type: ['string', 'null'], description: 'Fecha del comprobante en formato YYYY-MM-DD, o null si no se lee' },
    monto: { type: ['number', 'null'], description: 'Monto total en pesos argentinos, o null si no se lee' },
    motivo: { type: 'string', enum: MOTIVOS, description: 'A cuál de estas 3 categorías corresponde el gasto' },
    tipo_comprobante: { type: 'string', enum: TIPOS_COMPROBANTE },
    medio_pago: { type: 'string', enum: ['efectivo', 'tarjeta', 'desconocido'] },
    campos_inciertos: {
      type: 'array', items: { type: 'string', enum: ['fecha', 'monto', 'motivo', 'tipo_comprobante'] },
      description: 'Campos que no se pudieron leer con confianza (borroso, cortado, ambiguo, etc.)',
    },
    motivo_incertidumbre: { type: ['string', 'null'], description: 'Explicación breve de por qué algún campo quedó incierto, o null si todo se leyó bien' },
  },
  required: ['fecha', 'monto', 'motivo', 'tipo_comprobante', 'medio_pago', 'campos_inciertos', 'motivo_incertidumbre'],
};

const SYSTEM_PROMPT = `Sos un asistente que lee comprobantes de gastos (tickets, facturas) de una
cuadrilla de instalación de portones en viaje, para armar la rendición de
gastos del viaje.

Reglas:
- Leé el comprobante y completá fecha, monto, a qué categoría corresponde
  (motivo) y qué tipo de comprobante es.
- Si algo no se puede leer con confianza (foto borrosa, cortada, número
  ambiguo, etc.), agregalo a campos_inciertos y explicá por qué en
  motivo_incertidumbre - NO inventes un valor, poné tu mejor estimación pero
  marcalo como incierto.
- No evalúes si la fecha corresponde al viaje - eso lo chequea el sistema
  aparte, vos solo leé lo que dice el papel.
- Respondé solo con el JSON pedido.`;

function userPromptTexto() {
  return `Leé este comprobante y extraé los datos pedidos. Categorías de motivo válidas: ${MOTIVOS.join(', ')}. Tipos de comprobante válidos: ${TIPOS_COMPROBANTE.join(', ')}.`;
}

// PDF vs imagen: Claude soporta ambos, pero como bloques de contenido
// distintos ('document' con media_type application/pdf, o 'image').
function bloqueDeArchivo(buffer, mimeType) {
  const base64 = buffer.toString('base64');
  if (mimeType === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: mimeType, data: base64 } };
  }
  return { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } };
}

async function leerComprobante({ buffer, mimeType }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    const err = new Error('Falta configurar ANTHROPIC_API_KEY en el servidor');
    err.status = 503;
    throw err;
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: [bloqueDeArchivo(buffer, mimeType), { type: 'text', text: userPromptTexto() }] }],
    output_config: { format: { type: 'json_schema', schema: GASTO_SCHEMA } },
  });

  if (response.stop_reason === 'refusal') {
    const err = new Error('La IA no pudo leer este comprobante');
    err.status = 422;
    throw err;
  }
  const textBlock = response.content.find((b) => b.type === 'text');
  try {
    return JSON.parse(textBlock?.text || '');
  } catch {
    console.error('Gastos IA: respuesta no parseable.', JSON.stringify(response.content));
    const err = new Error('La IA devolvió una respuesta que no se pudo interpretar');
    err.status = 502;
    throw err;
  }
}

// Chequeo determinístico del rango del viaje - nunca se le pide esto a la
// IA. Sin hora_llegada_real (viaje todavía no finalizado) solo se puede
// chequear el piso (>= salida); el techo queda pendiente hasta que se
// finalice, así que no se marca inconsistente solo por eso.
function fechaDentroDeRango(fechaISO, horaSalidaReal, horaLlegadaReal) {
  if (!fechaISO) return null; // no se pudo determinar - no es "fuera de rango", es "no se sabe"
  const fecha = new Date(`${fechaISO}T12:00:00Z`); // mediodía UTC: evita corrimiento de día por huso horario
  if (Number.isNaN(fecha.getTime())) return null;
  if (horaSalidaReal && fecha < new Date(new Date(horaSalidaReal).toDateString())) return false;
  if (horaLlegadaReal && fecha > new Date(new Date(horaLlegadaReal).toDateString() + ' 23:59:59')) return false;
  return true;
}

/**
 * @returns {Promise<{fecha, monto, motivo, tipo_comprobante, medio_pago, estado_revision, detalle_revision, campos_inciertos}>}
 */
async function analizarGasto({ buffer, mimeType, horaSalidaReal, horaLlegadaReal }) {
  const leido = await leerComprobante({ buffer, mimeType });
  const campos = new Set(leido.campos_inciertos || []);
  const detalles = [];
  if (leido.motivo_incertidumbre) detalles.push(leido.motivo_incertidumbre);

  if (leido.monto == null || !(Number(leido.monto) > 0)) campos.add('monto');

  const enRango = fechaDentroDeRango(leido.fecha, horaSalidaReal, horaLlegadaReal);
  if (enRango === false) {
    campos.add('fecha');
    detalles.push(`La fecha leída (${leido.fecha}) está fuera del rango del viaje.`);
  } else if (enRango === null && leido.fecha == null) {
    campos.add('fecha');
  }

  const campos_inciertos = Array.from(campos);
  return {
    fecha: leido.fecha,
    monto: leido.monto,
    motivo: leido.motivo,
    tipo_comprobante: leido.tipo_comprobante,
    medio_pago: leido.medio_pago,
    campos_inciertos,
    estado_revision: campos_inciertos.length > 0 ? 'revisar' : 'ok',
    detalle_revision: detalles.join(' ') || null,
  };
}

module.exports = { analizarGasto, MOTIVOS, TIPOS_COMPROBANTE };

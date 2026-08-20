// lib/servicioTecnicoIaRecomendacion.js
//
// Motor de IA de Servicio Técnico: espejo de logisticaIaRecomendacion.js,
// adaptado al dominio (items = solicitudes de ST + mediciones pendientes).
// Sin reglas de envío ni capacidad de vehículo: no aplican acá.
//
// Ojo con un gotcha encontrado probando esto contra la API real: a
// diferencia de Logística (que identifica cada portón por su NV, un entero
// corto), acá una medición se identifica por quote_id (uuid de 36
// caracteres) - pedirle a la IA que REPRODUZCA un uuid textual en la
// respuesta no es confiable (en una prueba real devolvió un carácter
// distinto al del id real, silenciosamente). Por eso NO se le pide que
// repita el id: se le da un número corto (#1, #2, ...) por item en el
// prompt, y la respuesta usa ese número - la traducción número -> {tipo,id}
// real la hace este código, nunca el modelo.
const Anthropic = require('@anthropic-ai/sdk');
const { getIaConfig } = require('./servicioTecnicoIaConfig');
const { construirContexto, listarItemsPendientesConUbicacion } = require('./servicioTecnicoIaContexto');
const db = require('./servicioTecnicoViajesDb');
const { pool } = require('../db');

// Mismo límite que Logística - un lote más grande infla el prompt sin
// agregar valor real.
const MAX_ITEMS_POR_ZONA = 20;

const PARADA_SCHEMA = {
  type: 'object',
  properties: {
    item: { type: 'integer', description: 'El número #N del item tal como aparece en la lista (nunca inventes uno)' },
    orden: { type: 'integer' },
    motivo: { type: 'string' },
  },
  required: ['item', 'orden', 'motivo'],
  additionalProperties: false,
};

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    semana_sugerida: { type: 'string', description: 'Semana ISO formato AAAA-Www, ej "2026-W35"' },
    resumen: { type: 'string' },
    orden_paradas: { type: 'array', items: PARADA_SCHEMA },
    tiempo_total_estimado_horas: { type: 'number' },
    vehiculo_sugerido: { type: ['string', 'null'] },
    alertas: { type: 'array', items: { type: 'string' } },
    razonamiento: { type: 'string' },
  },
  required: ['semana_sugerida', 'resumen', 'orden_paradas', 'tiempo_total_estimado_horas', 'vehiculo_sugerido', 'alertas', 'razonamiento'],
  additionalProperties: false,
};

// Numera los items (#1, #2, ...) para el prompt, y arma el traductor
// #N -> {tipo, id, nv} real que se usa DESPUÉS de la respuesta de la IA.
function indexarItems(items) {
  const indexados = items.map((it, i) => ({ ...it, idx: i + 1 }));
  const byIdx = new Map(indexados.map((it) => [it.idx, it]));
  return { indexados, byIdx };
}

// Traduce las paradas devueltas por la IA (#N) a {tipo, id, nv, orden,
// motivo} reales. Si la IA devolvió un #N que no existe (no debería pasar,
// pero por las dudas), esa parada se descarta en silencio.
function resolverParadas(paradas, byIdx) {
  return (paradas || [])
    .map((p) => {
      const it = byIdx.get(p.item);
      if (!it) return null;
      return { tipo: it.tipo, id: it.id, nv: it.nv, orden: p.orden, motivo: p.motivo };
    })
    .filter(Boolean);
}

async function fechaYSemanaActual() {
  const { rows } = await pool.query(`select to_char(now(),'YYYY-MM-DD') as hoy, to_char(now(),'IYYY-"W"IW') as semana_actual;`);
  return rows[0];
}

function lineaItem(it) {
  const ubicacion = it.lat != null ? `(${it.lat}, ${it.lng})` : 'SIN UBICACIÓN';
  const zona = it.zona?.zona_nombre || it.zona || 'sin zona clasificada';
  const tag = it.tipo === 'solicitud' ? `🔧 solicitud` : `📏 medición`;
  return `- #${it.idx} | ${tag} | ${it.nv ? `NV ${it.nv}` : 'sin NV'} | ${it.nombre_cliente || 'sin nombre'} | ${it.direccion || 'sin dirección'} | ubicación ${ubicacion} | zona: ${zona}${it.tipo === 'solicitud' ? ` | pedido: ${it.descripcion}` : ''}`;
}

function armarPromptUsuario({ indexados, distancias_km, vehiculos, cuadrillas, config, hoy, semanaActual }) {
  const lineasItems = indexados.map(lineaItem).join('\n');
  const lineasDistancias = distancias_km.map((d) => `- #${d.de} <-> #${d.a}: ${d.km} km (~${(d.km / config.velocidad_kmh).toFixed(1)}h a ${config.velocidad_kmh}km/h)`).join('\n') || '(sin pares con ubicación suficiente para calcular distancias)';
  const lineasVehiculos = (vehiculos || []).filter((v) => v.activo).map((v) => `- ${v.nombre}`).join('\n') || '(sin vehículos configurados)';
  const lineasCuadrillas = (cuadrillas || []).filter((c) => c.activo).map((c) => `- ${c.nombre}`).join('\n') || '(sin cuadrillas configuradas)';

  return `Fecha de hoy: ${hoy}. Semana ISO actual: ${semanaActual}.

Parámetros operativos: velocidad de viaje asumida ${config.velocidad_kmh} km/h, ${config.horas_por_visita}h por visita/medición.

Items seleccionados por el usuario para este viaje (identificados por su número #N, NO inventes otro identificador):
${lineasItems}

Distancias entre pares de items (línea recta, no ruta real por camino):
${lineasDistancias}

Vehículos disponibles (sin restricción de capacidad, elegí el que te parezca más razonable o dejalo null si no hace falta):
${lineasVehiculos}

Cuadrillas disponibles:
${lineasCuadrillas}

Recomendá el viaje según las instrucciones del sistema. En orden_paradas, "item" tiene que ser el número #N exacto de la lista de arriba (solo el número, sin el "#"). Respondé solo con el JSON pedido.`;
}

async function llamarClaude({ modelo, systemPrompt, userPrompt, schema }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    const err = new Error('Falta configurar ANTHROPIC_API_KEY en el servidor');
    err.status = 503;
    throw err;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: modelo || 'claude-sonnet-5',
    // Mismo cuidado que en Logística: el thinking adaptativo de Sonnet 5 /
    // Opus 5 corre por default y comparte presupuesto con max_tokens.
    max_tokens: 16000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    output_config: { format: { type: 'json_schema', schema } },
  });

  if (response.stop_reason === 'refusal') {
    const err = new Error('La IA no pudo generar una recomendación para esta solicitud');
    err.status = 422;
    throw err;
  }
  if (response.stop_reason === 'max_tokens') {
    const err = new Error('La respuesta de la IA se cortó por límite de tokens. Probá con menos items.');
    err.status = 502;
    throw err;
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  try {
    return { data: JSON.parse(textBlock?.text || ''), usage: response.usage, modelo: response.model };
  } catch {
    console.error('IA Técnica: respuesta no parseable. stop_reason=', response.stop_reason, 'content=', JSON.stringify(response.content));
    const err = new Error('La IA devolvió una respuesta que no se pudo interpretar');
    err.status = 502;
    throw err;
  }
}

// contexto.distancias_km viene con de/a = "tipo:id" (ver
// servicioTecnicoIaContexto.js) - se traduce a #N usando el mismo índice que
// ve la IA en el prompt, para que ambas listas (items y distancias) hablen
// el mismo idioma corto.
function indexarContexto(contexto) {
  const { indexados, byIdx } = indexarItems(contexto.items);
  const idxPorClave = new Map(indexados.map((it) => [`${it.tipo}:${it.id}`, it.idx]));
  const distancias_km = contexto.distancias_km
    .map((d) => ({ de: idxPorClave.get(d.de), a: idxPorClave.get(d.a), km: d.km }))
    .filter((d) => d.de != null && d.a != null);
  return { indexados, byIdx, distancias_km };
}

/**
 * @param {Array<{tipo:string, id:string|number}>} itemsSeleccionados
 */
async function recomendarViaje(itemsSeleccionados) {
  if (!Array.isArray(itemsSeleccionados) || !itemsSeleccionados.length) throw new Error('Falta la lista de items seleccionados');
  const normalizados = itemsSeleccionados.map((it) => ({ tipo: it.tipo, id: String(it.id) }));

  const [config, contexto, vehiculos, cuadrillas, fechas] = await Promise.all([
    getIaConfig(),
    construirContexto(normalizados),
    db.listVehiculos(),
    db.listCuadrillas(),
    fechaYSemanaActual(),
  ]);

  const { indexados, byIdx, distancias_km } = indexarContexto(contexto);

  const promptUsuario = armarPromptUsuario({
    indexados, distancias_km, vehiculos, cuadrillas, config, hoy: fechas.hoy, semanaActual: fechas.semana_actual,
  });

  const { data, usage, modelo } = await llamarClaude({
    modelo: config.modelo, systemPrompt: config.prompt_sistema, userPrompt: promptUsuario, schema: RESPONSE_SCHEMA,
  });

  const recomendacion = { ...data, orden_paradas: resolverParadas(data.orden_paradas, byIdx) };
  return { recomendacion, contexto, usage, modelo };
}

// ===========================================================================
// Fase 3: planificación proactiva por zona.
// ===========================================================================

const PLAN_ZONA_SCHEMA = {
  type: 'object',
  properties: {
    viajes_propuestos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nombre: { type: 'string' },
          items: { type: 'array', items: { type: 'integer', description: 'Número #N de cada item incluido en este viaje' } },
          semana_sugerida: { type: 'string' },
          orden_paradas: { type: 'array', items: PARADA_SCHEMA },
          tiempo_total_estimado_horas: { type: 'number' },
          vehiculo_sugerido: { type: ['string', 'null'] },
          alertas: { type: 'array', items: { type: 'string' } },
          razonamiento: { type: 'string' },
        },
        required: ['nombre', 'items', 'semana_sugerida', 'orden_paradas', 'tiempo_total_estimado_horas', 'vehiculo_sugerido', 'alertas', 'razonamiento'],
        additionalProperties: false,
      },
    },
  },
  required: ['viajes_propuestos'],
  additionalProperties: false,
};

function armarPromptZona({ zonaNombre, indexados, distancias_km, vehiculos, cuadrillas, config, hoy, semanaActual, truncado, totalEnZona }) {
  const lineasItems = indexados.map(lineaItem).join('\n');
  const lineasDistancias = distancias_km.map((d) => `- #${d.de} <-> #${d.a}: ${d.km} km (~${(d.km / config.velocidad_kmh).toFixed(1)}h a ${config.velocidad_kmh}km/h)`).join('\n') || '(sin pares con ubicación suficiente para calcular distancias)';
  const lineasVehiculos = (vehiculos || []).filter((v) => v.activo).map((v) => `- ${v.nombre}`).join('\n') || '(sin vehículos configurados)';
  const lineasCuadrillas = (cuadrillas || []).filter((c) => c.activo).map((c) => `- ${c.nombre}`).join('\n') || '(sin cuadrillas configuradas)';

  return `Fecha de hoy: ${hoy}. Semana ISO actual: ${semanaActual}.

Estás planificando viajes de Servicio Técnico para la zona "${zonaNombre}". Estos items (solicitudes de técnica + mediciones) NO fueron pre-seleccionados por un usuario: son TODOS los que están pendientes en esta zona y todavía sin fecha programada. Tu trabajo es proponer uno o más viajes (particionando el conjunto) - no asumas que van todos juntos en un solo viaje si hay muchos o están dispersos.
${truncado ? `\nOJO: esta zona tiene ${totalEnZona} items pendientes en total; para no saturar el análisis solo te paso los primeros ${indexados.length}. Decilo en una alerta general.\n` : ''}

Parámetros operativos: velocidad de viaje asumida ${config.velocidad_kmh} km/h, ${config.horas_por_visita}h por visita/medición.

Items pendientes en esta zona (identificados por su número #N, NO inventes otro identificador):
${lineasItems}

Distancias entre pares de items (línea recta, no ruta real por camino):
${lineasDistancias}

Vehículos disponibles (sin restricción de capacidad, elegí el que te parezca más razonable para cada viaje o dejalo null):
${lineasVehiculos}

Cuadrillas disponibles:
${lineasCuadrillas}

Proponé los viajes según las instrucciones del sistema. En "items" de cada viaje propuesto, listá los números #N incluidos; en "orden_paradas", "item" tiene que ser uno de esos mismos números #N. Respondé solo con el JSON pedido (viajes_propuestos).`;
}

async function planificarZona(zonaNombre, itemsZona, ctx) {
  const truncado = itemsZona.length > MAX_ITEMS_POR_ZONA;
  const itemsUsados = truncado ? itemsZona.slice(0, MAX_ITEMS_POR_ZONA) : itemsZona;

  const contexto = await construirContexto(itemsUsados.map((it) => ({ tipo: it.tipo, id: it.id })));
  const { indexados, byIdx, distancias_km } = indexarContexto(contexto);

  const promptUsuario = armarPromptZona({
    zonaNombre, indexados, distancias_km, ...ctx, truncado, totalEnZona: itemsZona.length,
  });

  const { data } = await llamarClaude({
    modelo: ctx.config.modelo, systemPrompt: ctx.config.prompt_sistema, userPrompt: promptUsuario, schema: PLAN_ZONA_SCHEMA,
  });

  const viajes_propuestos = (data.viajes_propuestos || []).map((v) => ({
    ...v,
    items: (v.items || []).map((idx) => byIdx.get(idx)).filter(Boolean).map((it) => ({ tipo: it.tipo, id: it.id, nv: it.nv })),
    orden_paradas: resolverParadas(v.orden_paradas, byIdx),
  }));

  return { zona: zonaNombre, viajes_propuestos, total_en_zona: itemsZona.length, truncado };
}

/**
 * Mira todos los items pendientes, los agrupa por zona y le pide a la IA una
 * propuesta de viajes por cada zona con items pendientes. Una llamada por
 * zona, en paralelo.
 */
async function planificarRutas() {
  const [config, vehiculos, cuadrillas, fechas, pendientes] = await Promise.all([
    getIaConfig(),
    db.listVehiculos(),
    db.listCuadrillas(),
    fechaYSemanaActual(),
    listarItemsPendientesConUbicacion(),
  ]);

  const conUbicacion = pendientes.filter((p) => p.lat != null && p.lng != null);
  const sinUbicacion = pendientes.length - conUbicacion.length;

  const porZona = new Map();
  const sinZona = [];
  for (const it of conUbicacion) {
    const zonaNombre = it.zona?.zona_nombre;
    if (!zonaNombre) { sinZona.push({ tipo: it.tipo, id: it.id, nv: it.nv }); continue; }
    if (!porZona.has(zonaNombre)) porZona.set(zonaNombre, []);
    porZona.get(zonaNombre).push(it);
  }

  if (!porZona.size) {
    const err = new Error('Ningún item pendiente matchea una zona configurada. Cargá zonas con localidades de referencia en "Zonas" (Logística de Viajes) primero.');
    err.status = 422;
    throw err;
  }

  const ctx = { vehiculos, cuadrillas, config, hoy: fechas.hoy, semanaActual: fechas.semana_actual };

  const planes = await Promise.all(
    Array.from(porZona.entries()).map(([zonaNombre, itemsZona]) =>
      planificarZona(zonaNombre, itemsZona, ctx).catch((e) => ({ zona: zonaNombre, error: e.message, total_en_zona: itemsZona.length }))
    )
  );

  return { planes, sin_zona: { cantidad: sinZona.length, items: sinZona }, sin_ubicacion: sinUbicacion };
}

module.exports = { recomendarViaje, planificarRutas };

// lib/logisticaIaRecomendacion.js
//
// Fase 1 del motor de logística IA: dado un conjunto de NV seleccionados,
// arma el contexto (lib/logisticaIaContexto.js: ubicación, zona, reglas de
// envío ya evaluadas, distancias entre puntos) y le pide a Claude una
// recomendación de ruta/semana en JSON estructurado (output_config.format),
// usando el prompt y los parámetros operativos editables desde el
// planificador (lib/logisticaIaConfig.js).
//
// Diseño deliberado: los tiempos de viaje/instalación y el cumplimiento de
// reglas de envío se calculan en código (determinístico, confiable) y se le
// dan a la IA como datos ya resueltos - no se le pide que calcule fechas ni
// distancias, solo que razone sobre ellas para proponer orden/semana. Esto
// es un copiloto de decisión: el usuario revisa y confirma, nunca se aplica
// solo.
const Anthropic = require('@anthropic-ai/sdk');
const { pool } = require('../db');
const { getIaConfig } = require('./logisticaIaConfig');
const { construirContexto, listarPortonesSinViajeConUbicacion } = require('./logisticaIaContexto');
const db = require('./logisticaViajesDb');

// Cuántos portones como máximo se le mandan a la IA por zona en la
// planificación automática (Fase 3) - un lote más grande infla el prompt y
// el tiempo de respuesta sin agregar valor real (rara vez un solo viaje
// junta más que esto).
const MAX_PORTONES_POR_ZONA = 20;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    semana_sugerida: { type: 'string', description: 'Semana ISO formato AAAA-Www, ej "2026-W35"' },
    resumen: { type: 'string', description: 'Resumen breve (1-2 frases) de la recomendación' },
    orden_paradas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nv: { type: 'integer' },
          orden: { type: 'integer' },
          motivo: { type: 'string' },
        },
        required: ['nv', 'orden', 'motivo'],
        additionalProperties: false,
      },
    },
    tiempo_total_estimado_horas: { type: 'number' },
    vehiculo_sugerido: { type: ['string', 'null'] },
    alertas: {
      type: 'array',
      items: { type: 'string' },
      description: 'Ej: portones que no cumplen su regla de envío todavía, portones sin ubicación resuelta, etc.',
    },
    razonamiento: { type: 'string' },
  },
  required: ['semana_sugerida', 'resumen', 'orden_paradas', 'tiempo_total_estimado_horas', 'vehiculo_sugerido', 'alertas', 'razonamiento'],
  additionalProperties: false,
};

async function fechaYSemanaActual() {
  const { rows } = await pool.query(`select to_char(now(),'YYYY-MM-DD') as hoy, to_char(now(),'IYYY-"W"IW') as semana_actual;`);
  return rows[0];
}

function armarPromptUsuario({ portones, distancias_km, vehiculos, cuadrillas, config, hoy, semanaActual }) {
  const lineasPortones = portones.map((p) => {
    const ubicacion = p.lat != null ? `(${p.lat}, ${p.lng})` : 'SIN UBICACIÓN';
    const zona = p.zona || 'sin zona clasificada';
    const cumple = p.regla_envio_aplicada
      ? (p.cumple_regla_envio
          ? `cumple regla "${p.regla_envio_aplicada}" (habilitado desde ${p.fecha_habilitada_despacho})`
          : `NO cumple regla "${p.regla_envio_aplicada}" todavía (habilitado recién el ${p.fecha_habilitada_despacho})`)
      : 'sin regla de envío aplicable';
    return `- NV ${p.nv} | ${p.nombre_cliente || 'sin nombre'} | ${p.direccion || 'sin dirección'} | ubicación ${ubicacion} | zona: ${zona} | sistema: ${p.sistema || '—'} | pesa ${p.peso_capacidad} portón(es) de capacidad | ${cumple}`;
  }).join('\n');

  const lineasDistancias = distancias_km.map((d) => `- NV ${d.de} <-> NV ${d.a}: ${d.km} km (~${(d.km / config.velocidad_kmh).toFixed(1)}h a ${config.velocidad_kmh}km/h)`).join('\n') || '(sin pares con ubicación suficiente para calcular distancias)';

  const lineasVehiculos = (vehiculos || []).filter((v) => v.activo).map((v) => `- ${v.nombre} (capacidad: ${v.capacidad_portones} portones de despacho)`).join('\n') || '(sin vehículos configurados)';
  const lineasCuadrillas = (cuadrillas || []).filter((c) => c.activo).map((c) => `- ${c.nombre}`).join('\n') || '(sin cuadrillas configuradas)';

  return `Fecha de hoy: ${hoy}. Semana ISO actual: ${semanaActual}.

Parámetros operativos: velocidad de viaje asumida ${config.velocidad_kmh} km/h, ${config.horas_por_instalacion}h por instalación.

Portones seleccionados por el usuario para este viaje:
${lineasPortones}

Distancias entre pares de portones (línea recta, no ruta real por camino):
${lineasDistancias}

Vehículos disponibles:
${lineasVehiculos}

Cuadrillas disponibles:
${lineasCuadrillas}

Recomendá el viaje según las instrucciones del sistema. Respondé solo con el JSON pedido.`;
}

// Llamado genérico a Claude pidiendo un JSON que matchee `schema`. Centraliza
// el manejo de refusal / corte por max_tokens / respuesta no parseable, que
// es igual para recomendarViaje y planificarRutas.
async function llamarClaude({ modelo, systemPrompt, userPrompt, schema }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    const err = new Error('Falta configurar ANTHROPIC_API_KEY en el servidor');
    err.status = 503;
    throw err;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: modelo || 'claude-sonnet-5',
    // Ojo: en Sonnet 5 (y Opus 5) el thinking adaptativo corre por default
    // aunque no se lo pida, y consume del MISMO presupuesto que max_tokens
    // junto con la respuesta - con poco margen, el razonamiento se come todo
    // el budget y corta antes de llegar al JSON. Dejamos harto margen.
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
    const err = new Error('La respuesta de la IA se cortó por límite de tokens. Probá con menos portones.');
    err.status = 502;
    throw err;
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  try {
    return { data: JSON.parse(textBlock?.text || ''), usage: response.usage, modelo: response.model };
  } catch {
    console.error('IA: respuesta no parseable. stop_reason=', response.stop_reason, 'content=', JSON.stringify(response.content));
    const err = new Error('La IA devolvió una respuesta que no se pudo interpretar');
    err.status = 502;
    throw err;
  }
}

/**
 * @param {number[]} nvs - NV seleccionados por el usuario
 * @returns {Promise<{ recomendacion:object, contexto:object }>}
 */
async function recomendarViaje(nvs) {
  if (!Array.isArray(nvs) || !nvs.length) throw new Error('Falta la lista de NV seleccionados');

  const [config, contexto, vehiculos, cuadrillas, fechas] = await Promise.all([
    getIaConfig(),
    construirContexto(nvs),
    db.listVehiculos(),
    db.listCuadrillas(),
    fechaYSemanaActual(),
  ]);

  const promptUsuario = armarPromptUsuario({
    ...contexto,
    vehiculos,
    cuadrillas,
    config,
    hoy: fechas.hoy,
    semanaActual: fechas.semana_actual,
  });

  const { data: recomendacion, usage, modelo } = await llamarClaude({
    modelo: config.modelo, systemPrompt: config.prompt_sistema, userPrompt: promptUsuario, schema: RESPONSE_SCHEMA,
  });

  return { recomendacion, contexto, usage, modelo };
}

// ===========================================================================
// Fase 3: planificación proactiva por zona - sin selección manual previa, la
// IA mira TODOS los portones sin viaje, los agrupa por zona (clasificación
// determinística ya resuelta, ver lib/logisticaZonificacion.js) y propone
// qué viajes armar en cada una.
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
          nvs: { type: 'array', items: { type: 'integer' }, description: 'NV incluidos en este viaje propuesto' },
          semana_sugerida: { type: 'string', description: 'Semana ISO formato AAAA-Www' },
          orden_paradas: {
            type: 'array',
            items: {
              type: 'object',
              properties: { nv: { type: 'integer' }, orden: { type: 'integer' }, motivo: { type: 'string' } },
              required: ['nv', 'orden', 'motivo'],
              additionalProperties: false,
            },
          },
          tiempo_total_estimado_horas: { type: 'number' },
          vehiculo_sugerido: { type: ['string', 'null'] },
          alertas: { type: 'array', items: { type: 'string' } },
          razonamiento: { type: 'string' },
        },
        required: ['nombre', 'nvs', 'semana_sugerida', 'orden_paradas', 'tiempo_total_estimado_horas', 'vehiculo_sugerido', 'alertas', 'razonamiento'],
        additionalProperties: false,
      },
    },
  },
  required: ['viajes_propuestos'],
  additionalProperties: false,
};

function armarPromptZona({ zonaNombre, portones, distancias_km, vehiculos, cuadrillas, config, hoy, semanaActual, truncado, totalEnZona }) {
  const lineasPortones = portones.map((p) => {
    const ubicacion = p.lat != null ? `(${p.lat}, ${p.lng})` : 'SIN UBICACIÓN';
    const cumple = p.regla_envio_aplicada
      ? (p.cumple_regla_envio
          ? `cumple regla "${p.regla_envio_aplicada}" (habilitado desde ${p.fecha_habilitada_despacho})`
          : `NO cumple regla "${p.regla_envio_aplicada}" todavía (habilitado recién el ${p.fecha_habilitada_despacho})`)
      : 'sin regla de envío aplicable';
    return `- NV ${p.nv} | ${p.nombre_cliente || 'sin nombre'} | ${p.direccion || 'sin dirección'} | ubicación ${ubicacion} | sistema: ${p.sistema || '—'} | pesa ${p.peso_capacidad} portón(es) de capacidad | ${cumple}`;
  }).join('\n');

  const lineasDistancias = distancias_km.map((d) => `- NV ${d.de} <-> NV ${d.a}: ${d.km} km (~${(d.km / config.velocidad_kmh).toFixed(1)}h a ${config.velocidad_kmh}km/h)`).join('\n') || '(sin pares con ubicación suficiente para calcular distancias)';

  const lineasVehiculos = (vehiculos || []).filter((v) => v.activo).map((v) => `- ${v.nombre} (capacidad: ${v.capacidad_portones} portones de despacho)`).join('\n') || '(sin vehículos configurados)';
  const lineasCuadrillas = (cuadrillas || []).filter((c) => c.activo).map((c) => `- ${c.nombre}`).join('\n') || '(sin cuadrillas configuradas)';

  return `Fecha de hoy: ${hoy}. Semana ISO actual: ${semanaActual}.

Estás planificando viajes para la zona "${zonaNombre}". Estos portones NO fueron pre-seleccionados por un
usuario: son TODOS los que están pendientes de despacho/instalación en esta zona y todavía sin viaje asignado.
Tu trabajo es proponer uno o más viajes (particionando el conjunto) - no asumas que van todos juntos en un
solo viaje. Respetá la capacidad de despacho del vehículo que sugieras para cada viaje (sumando el peso de
capacidad de cada portón incluido); si no entran todos en un viaje, proponé varios.
${truncado ? `\nOJO: esta zona tiene ${totalEnZona} portones pendientes en total; para no saturar el análisis solo te paso los primeros ${portones.length}. Decilo en una alerta general.\n` : ''}

Parámetros operativos: velocidad de viaje asumida ${config.velocidad_kmh} km/h, ${config.horas_por_instalacion}h por instalación.

Portones pendientes en esta zona:
${lineasPortones}

Distancias entre pares de portones (línea recta, no ruta real por camino):
${lineasDistancias}

Vehículos disponibles:
${lineasVehiculos}

Cuadrillas disponibles:
${lineasCuadrillas}

Proponé los viajes según las instrucciones del sistema. Respondé solo con el JSON pedido (viajes_propuestos).`;
}

async function planificarZona(zonaNombre, nvsZona, ctx) {
  const truncado = nvsZona.length > MAX_PORTONES_POR_ZONA;
  const nvsUsados = truncado ? nvsZona.slice(0, MAX_PORTONES_POR_ZONA) : nvsZona;

  const contexto = await construirContexto(nvsUsados);
  const promptUsuario = armarPromptZona({
    zonaNombre, ...contexto, ...ctx, truncado, totalEnZona: nvsZona.length,
  });

  const { data } = await llamarClaude({
    modelo: ctx.config.modelo, systemPrompt: ctx.config.prompt_sistema, userPrompt: promptUsuario, schema: PLAN_ZONA_SCHEMA,
  });

  return { zona: zonaNombre, viajes_propuestos: data.viajes_propuestos, total_en_zona: nvsZona.length, truncado };
}

/**
 * Mira todos los portones sin viaje, los agrupa por zona (clasificación ya
 * resuelta) y le pide a la IA una propuesta de viajes por cada zona con
 * portones pendientes. Corre una llamada por zona, en paralelo.
 * @returns {Promise<{ planes:Array, sin_zona:{cantidad:number, nvs:number[]}, sin_ubicacion:number }>}
 */
async function planificarRutas() {
  const [config, vehiculos, cuadrillas, fechas, pendientes] = await Promise.all([
    getIaConfig(),
    db.listVehiculos(),
    db.listCuadrillas(),
    fechaYSemanaActual(),
    listarPortonesSinViajeConUbicacion(),
  ]);

  const conUbicacion = pendientes.filter((p) => p.lat != null && p.lng != null);
  const sinUbicacion = pendientes.length - conUbicacion.length;

  const porZona = new Map();
  const sinZona = [];
  for (const p of conUbicacion) {
    const zonaNombre = p.zona?.zona_nombre;
    if (!zonaNombre) { sinZona.push(p.nv); continue; }
    if (!porZona.has(zonaNombre)) porZona.set(zonaNombre, []);
    porZona.get(zonaNombre).push(p.nv);
  }

  if (!porZona.size) {
    const err = new Error('Ningún portón pendiente matchea una zona configurada. Cargá zonas con localidades de referencia en "Zonas" primero.');
    err.status = 422;
    throw err;
  }

  const ctx = { vehiculos, cuadrillas, config, hoy: fechas.hoy, semanaActual: fechas.semana_actual };

  const planes = await Promise.all(
    Array.from(porZona.entries()).map(([zonaNombre, nvsZona]) =>
      planificarZona(zonaNombre, nvsZona, ctx).catch((e) => ({ zona: zonaNombre, error: e.message, total_en_zona: nvsZona.length }))
    )
  );

  return { planes, sin_zona: { cantidad: sinZona.length, nvs: sinZona }, sin_ubicacion: sinUbicacion };
}

module.exports = { recomendarViaje, planificarRutas };

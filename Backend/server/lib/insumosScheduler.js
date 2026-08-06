// Auto-cierre de pedidos de insumos, con horario configurable POR SECCIÓN
// (antes era un horario fijo de las 20:00 para todas - ver
// insumosSeccionCierreDb.js para el horario de cada una).
// Idempotente por diseño (no por lock): closeStaleOpenPedidos hace UPDATE...WHERE
// sobre el estado, asi que correrlo dos veces (cron duplicado, dos instancias del
// proceso) no hace nada la segunda vez. El catch-up al bootear SIEMPRE limpia
// dias estrictamente anteriores a hoy (fines de semana/feriados/caidas del
// server), y ademas cierra HOY cualquier seccion cuyo horario configurado ya
// haya pasado (evalua cada seccion contra su propio horario, no uno global).
const cron = require('node-cron');
const { pool } = require('../db');
const { closeStaleOpenPedidos, argentinaTodayStr, AR_TZ } = require('./insumosPedidos');
const { getHorasCierre } = require('../insumosSeccionCierreDb');

function currentArgentinaHHMM() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: AR_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hh = parts.find((p) => p.type === 'hour')?.value;
  const mm = parts.find((p) => p.type === 'minute')?.value;
  return hh && mm ? `${hh}:${mm}` : null;
}

// Secciones cuyo horario de cierre configurado ya pasó (comparación de
// strings 'HH:MM' funciona igual que numérica, ambos son zero-padded).
async function getSeccionesVencidasHoy() {
  const nowHHMM = currentArgentinaHHMM();
  if (!nowHHMM) return [];
  const horas = await getHorasCierre();
  const vencidas = [];
  for (const [seccion, horaCierre] of horas.entries()) {
    if (horaCierre <= nowHHMM) vencidas.push(seccion);
  }
  return vencidas;
}

async function runDailyClose() {
  const client = await pool.connect();
  try {
    const seccionesVencidasHoy = await getSeccionesVencidasHoy();
    const result = await closeStaleOpenPedidos(client, argentinaTodayStr(), { seccionesVencidasHoy });
    if (result.cerrados || result.cerrados_vacios) {
      console.log(`[insumos-scheduler] cerrados=${result.cerrados} cerrados_vacios=${result.cerrados_vacios}`);
    }
    return result;
  } finally {
    client.release();
  }
}

function startInsumosScheduler() {
  // Cada 5 min en vez de un disparo fijo: cada seccion cierra cuando pasa SU
  // propio horario configurado (getSeccionesVencidasHoy lo resuelve en cada
  // tick), no un horario global compartido por todas.
  cron.schedule(
    '*/5 * * * 1-5',
    () => {
      runDailyClose().catch((err) => console.error('[insumos-scheduler] error:', err.message));
    },
    { timezone: AR_TZ }
  );
  console.log('[insumos-scheduler] programado: chequeo cada 5 min, lunes a viernes (cierre por seccion segun su horario configurado)');
}

module.exports = { startInsumosScheduler, runDailyClose };

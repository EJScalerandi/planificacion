// Auto-cierre de pedidos de insumos a las 20:00 (hora Argentina), lunes a viernes.
// Idempotente por diseño (no por lock): closeStaleOpenPedidos hace UPDATE...WHERE
// sobre el estado, asi que correrlo dos veces (cron duplicado, dos instancias del
// proceso) no hace nada la segunda vez. El catch-up al bootear SIEMPRE limpia
// dias estrictamente anteriores a hoy (fines de semana/feriados/caidas del
// server), pero el dia de HOY solo se cierra si ya paso el corte de las 20:00 -
// si no, un restart/deploy a mitad del dia cerraria en falso pedidos que la
// seccion todavia esta cargando o recien confirmo (paso real, no hipotetico:
// pasó el 2026-07-28 al levantar un backend local contra la misma base).
const cron = require('node-cron');
const { pool } = require('../db');
const { closeStaleOpenPedidos, argentinaTodayStr, AR_TZ } = require('./insumosPedidos');

function isPastCutoffArgentina() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: AR_TZ, hour: '2-digit', hour12: false }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  return Number.isFinite(hour) && hour >= 20;
}

async function runDailyClose({ closeToday } = {}) {
  const client = await pool.connect();
  try {
    const result = await closeStaleOpenPedidos(client, argentinaTodayStr(), {
      closeToday: closeToday ?? isPastCutoffArgentina(),
    });
    if (result.cerrados || result.cerrados_vacios) {
      console.log(`[insumos-scheduler] cerrados=${result.cerrados} cerrados_vacios=${result.cerrados_vacios}`);
    }
    return result;
  } finally {
    client.release();
  }
}

function startInsumosScheduler() {
  cron.schedule(
    '0 20 * * 1-5',
    () => {
      // Disparo real de las 20:00: siempre cierra el dia de hoy, sin depender
      // del reloj del proceso (que ya esta en el minuto justo por el cron).
      runDailyClose({ closeToday: true }).catch((err) => console.error('[insumos-scheduler] error:', err.message));
    },
    { timezone: AR_TZ }
  );
  console.log('[insumos-scheduler] programado: 20:00 America/Argentina/Buenos_Aires, lunes a viernes');
}

module.exports = { startInsumosScheduler, runDailyClose };

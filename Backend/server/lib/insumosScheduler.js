// Auto-cierre de pedidos de insumos a las 20:00 (hora Argentina), lunes a viernes.
// Idempotente por diseño (no por lock): closeStaleOpenPedidos hace UPDATE...WHERE
// sobre el estado, asi que correrlo dos veces (cron duplicado, dos instancias del
// proceso) no hace nada la segunda vez. Ademas cierra CUALQUIER pedido con
// fecha <= hoy (no solo "de hoy"), asi un catch-up al bootear cubre reinicios
// que se hayan perdido el disparo de las 20:00 de un dia previo.
const cron = require('node-cron');
const { pool } = require('../db');
const { closeStaleOpenPedidos, argentinaTodayStr, AR_TZ } = require('./insumosPedidos');

async function runDailyClose() {
  const client = await pool.connect();
  try {
    const result = await closeStaleOpenPedidos(client, argentinaTodayStr());
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
      runDailyClose().catch((err) => console.error('[insumos-scheduler] error:', err.message));
    },
    { timezone: AR_TZ }
  );
  console.log('[insumos-scheduler] programado: 20:00 America/Argentina/Buenos_Aires, lunes a viernes');
}

module.exports = { startInsumosScheduler, runDailyClose };

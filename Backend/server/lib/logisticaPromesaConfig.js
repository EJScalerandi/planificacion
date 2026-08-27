// lib/logisticaPromesaConfig.js
//
// Config de "semana prometida" del viaje: cuántas semanas después de la
// semana de producción ya reservada por el Presupuestador (ver
// logisticaPromesaMapa.js) se considera que "toca" el viaje. Fila única
// (id=1) - ver server/sql/migration_logistica_promesa_config.sql.
const { pool } = require('../db');

async function getPromesaConfig() {
  const { rows } = await pool.query(
    `select id, semanas_despues_produccion, updated_at from public.logistica_promesa_config where id = 1;`
  );
  return rows[0] || null;
}

async function updatePromesaConfig({ semanas_despues_produccion }) {
  const n = Number(semanas_despues_produccion);
  if (!Number.isInteger(n) || n < 0) throw new Error('semanas_despues_produccion debe ser un entero >= 0');
  const { rows } = await pool.query(
    `update public.logistica_promesa_config set semanas_despues_produccion = $1, updated_at = now() where id = 1
     returning id, semanas_despues_produccion, updated_at;`,
    [n]
  );
  return rows[0];
}

module.exports = { getPromesaConfig, updatePromesaConfig };

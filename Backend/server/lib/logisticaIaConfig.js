// lib/logisticaIaConfig.js
//
// Config editable del motor de logística IA (Fase 1): prompt del sistema
// (reglas de negocio en lenguaje natural, editable desde el planificador) +
// parámetros operativos (modelo de Claude, velocidad de viaje asumida, horas
// por instalación). Fila única (id=1) - ver
// server/sql/migration_logistica_ia_config.sql.
const { pool } = require('../db');

async function getIaConfig() {
  const { rows } = await pool.query(
    `select id, prompt_sistema, modelo, velocidad_kmh, horas_por_instalacion, updated_at
     from public.logistica_ia_config where id = 1;`
  );
  return rows[0] || null;
}

async function updateIaConfig(patch) {
  const fields = ['prompt_sistema', 'modelo', 'velocidad_kmh', 'horas_por_instalacion'];
  const sets = [];
  const params = [];
  for (const f of fields) {
    if (patch[f] === undefined) continue;
    params.push(patch[f]);
    sets.push(`${f} = $${params.length}`);
  }
  if (!sets.length) throw new Error('Nada para actualizar');
  sets.push('updated_at = now()');
  const { rows } = await pool.query(
    `update public.logistica_ia_config set ${sets.join(', ')} where id = 1
     returning id, prompt_sistema, modelo, velocidad_kmh, horas_por_instalacion, updated_at;`,
    params
  );
  return rows[0];
}

module.exports = { getIaConfig, updateIaConfig };

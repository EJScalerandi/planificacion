// lib/servicioTecnicoIaConfig.js
//
// Config editable del motor de IA de Servicio Técnico: espejo de
// logisticaIaConfig.js. Prompt del sistema (editable desde el planificador)
// + parámetros operativos (modelo de Claude, velocidad de viaje asumida,
// horas por visita). Fila única (id=1) - ver
// server/sql/migration_servicio_tecnico_ia.sql.
const { pool } = require('../db');

async function getIaConfig() {
  const { rows } = await pool.query(
    `select id, prompt_sistema, modelo, velocidad_kmh, horas_por_visita, updated_at
     from public.servicio_tecnico_ia_config where id = 1;`
  );
  return rows[0] || null;
}

async function updateIaConfig(patch) {
  const fields = ['prompt_sistema', 'modelo', 'velocidad_kmh', 'horas_por_visita'];
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
    `update public.servicio_tecnico_ia_config set ${sets.join(', ')} where id = 1
     returning id, prompt_sistema, modelo, velocidad_kmh, horas_por_visita, updated_at;`,
    params
  );
  return rows[0];
}

module.exports = { getIaConfig, updateIaConfig };

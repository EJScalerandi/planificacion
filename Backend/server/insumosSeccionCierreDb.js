const { pool } = require('./db');
const { INSUMOS_SECCIONES, isValidInsumosSeccion } = require('./lib/insumosSecciones');

// Horario de cierre (auto-cierre de pedidos) por sección. Una sección sin
// fila en insumos_seccion_cierre usa este default.
const DEFAULT_HORA_CIERRE = '20:00';

// Acepta 'HH:MM' o 'HH:MM:SS' (como vuelve el TIME de Postgres); siempre
// devuelve 'HH:MM' o null si no es un horario válido.
function normalizeHora(t) {
  const s = String(t || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isInteger(hh) || hh < 0 || hh > 23) return null;
  if (!Number.isInteger(mm) || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// Devuelve un Map seccion -> 'HH:MM' con las 11 secciones siempre presentes
// (default 20:00 para las que no tengan fila propia todavía).
async function getHorasCierre() {
  const { rows } = await pool.query('select seccion, hora_cierre from public.insumos_seccion_cierre');
  const map = new Map();
  for (const s of INSUMOS_SECCIONES) map.set(s.slug, DEFAULT_HORA_CIERRE);
  for (const r of rows) {
    const hh = normalizeHora(r.hora_cierre);
    if (hh) map.set(r.seccion, hh);
  }
  return map;
}

async function setHorasCierre(entries = []) {
  const clean = (Array.isArray(entries) ? entries : [])
    .map((e) => ({ seccion: String(e?.seccion || '').trim(), hora: normalizeHora(e?.hora_cierre) }))
    .filter((e) => isValidInsumosSeccion(e.seccion) && e.hora);

  const client = await pool.connect();
  try {
    await client.query('begin');
    for (const e of clean) {
      await client.query(
        `insert into public.insumos_seccion_cierre (seccion, hora_cierre, updated_at)
         values ($1, $2::time, now())
         on conflict (seccion) do update
           set hora_cierre = excluded.hora_cierre, updated_at = now()`,
        [e.seccion, e.hora]
      );
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }

  return getHorasCierre();
}

module.exports = { getHorasCierre, setHorasCierre, DEFAULT_HORA_CIERRE };

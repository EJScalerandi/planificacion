const { pool } = require('./db');

// Nota compartida por nodo del diagrama "Índice de Programación" (quién está
// trabajando ahí y qué está haciendo). Un nodo sin fila propia todavía no
// tiene nota cargada.

async function getNota(nodoId) {
  const { rows } = await pool.query(
    'select nodo_id, nota, updated_by, updated_at from public.notas_nodo where nodo_id = $1',
    [nodoId]
  );
  if (!rows.length) return { nodo_id: nodoId, nota: '', updated_by: null, updated_at: null };
  return rows[0];
}

async function setNota(nodoId, nota, updatedBy) {
  const { rows } = await pool.query(
    `insert into public.notas_nodo (nodo_id, nota, updated_by, updated_at)
     values ($1, $2, $3, now())
     on conflict (nodo_id) do update
       set nota = excluded.nota, updated_by = excluded.updated_by, updated_at = now()
     returning nodo_id, nota, updated_by, updated_at`,
    [nodoId, String(nota || ''), updatedBy || null]
  );
  return rows[0];
}

module.exports = { getNota, setNota };

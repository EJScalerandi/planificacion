const { pool } = require('./db');

// Usuarios de prueba cargados a mano por nodo del diagrama "Índice de
// Programación" (varios por nodo, a diferencia del acceso "principal" de
// notas_nodo). Ver migration_notas_nodo_usuarios_prueba.sql.

async function listTestUsers(nodoId) {
  const { rows } = await pool.query(
    `select id, nodo_id, etiqueta, usuario, password, created_by, created_at
       from public.notas_nodo_usuarios_prueba
      where nodo_id = $1
      order by created_at asc`,
    [nodoId]
  );
  return rows;
}

async function addTestUser(nodoId, { etiqueta, usuario, password }, createdBy) {
  const { rows } = await pool.query(
    `insert into public.notas_nodo_usuarios_prueba (nodo_id, etiqueta, usuario, password, created_by)
     values ($1, $2, $3, $4, $5)
     returning id, nodo_id, etiqueta, usuario, password, created_by, created_at`,
    [nodoId, String(etiqueta || ''), String(usuario || ''), String(password || ''), createdBy || null]
  );
  return rows[0];
}

async function deleteTestUser(nodoId, id) {
  await pool.query(
    'delete from public.notas_nodo_usuarios_prueba where nodo_id = $1 and id = $2',
    [nodoId, id]
  );
}

module.exports = { listTestUsers, addTestUser, deleteTestUser };

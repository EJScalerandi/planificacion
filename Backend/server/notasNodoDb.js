const { pool } = require('./db');

// Nota + usuario/contraseña compartidos por nodo del diagrama "Índice de
// Programación" (quién está trabajando ahí, qué está haciendo, y el acceso
// real cargado a mano por el equipo). Un nodo sin fila propia todavía no
// tiene nada cargado.

async function getNota(nodoId) {
  const { rows } = await pool.query(
    'select nodo_id, nota, admin_user, admin_password, updated_by, updated_at from public.notas_nodo where nodo_id = $1',
    [nodoId]
  );
  if (!rows.length) {
    return { nodo_id: nodoId, nota: '', admin_user: '', admin_password: '', updated_by: null, updated_at: null };
  }
  return rows[0];
}

// El acceso principal (admin_user/admin_password) sólo se pisa cuando llegan
// los DOS campos cargados: si solo vino uno (o ninguno), esta fila guarda la
// nota igual pero deja admin_user/admin_password como estaban en la base -
// así un blur a medio cargar nunca borra un acceso que ya estaba guardado.
async function setNota(nodoId, { nota, adminUser, adminPassword } = {}, updatedBy) {
  const hasCreds = String(adminUser || '').trim() && String(adminPassword || '').trim();

  if (hasCreds) {
    const { rows } = await pool.query(
      `insert into public.notas_nodo (nodo_id, nota, admin_user, admin_password, updated_by, updated_at)
       values ($1, $2, $3, $4, $5, now())
       on conflict (nodo_id) do update
         set nota = excluded.nota,
             admin_user = excluded.admin_user,
             admin_password = excluded.admin_password,
             updated_by = excluded.updated_by,
             updated_at = now()
       returning nodo_id, nota, admin_user, admin_password, updated_by, updated_at`,
      [nodoId, String(nota || ''), String(adminUser).trim(), String(adminPassword).trim(), updatedBy || null]
    );
    return rows[0];
  }

  const { rows } = await pool.query(
    `insert into public.notas_nodo (nodo_id, nota, updated_by, updated_at)
     values ($1, $2, $3, now())
     on conflict (nodo_id) do update
       set nota = excluded.nota,
           updated_by = excluded.updated_by,
           updated_at = now()
     returning nodo_id, nota, admin_user, admin_password, updated_by, updated_at`,
    [nodoId, String(nota || ''), updatedBy || null]
  );
  return rows[0];
}

module.exports = { getNota, setNota };

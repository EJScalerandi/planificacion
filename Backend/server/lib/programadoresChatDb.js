// lib/programadoresChatDb.js
//
// Chat de Programadores (/admin/programadores/chat): un único grupo tipo
// WhatsApp entre los usuarios con scope programadores:admin. Sin edición ni
// borrado de mensajes (no se pidió).
const { pool } = require('../db');

const SCOPE = 'programadores:admin';
const PAGINA = 50;

const MENSAJE_COLS = 'id, autor_id, autor_username, texto, adjuntos, created_at';

// Tres modos, excluyentes:
// - despuesDe: lo nuevo desde el último que ya tiene el front (polling).
// - antesDe: la página anterior ("Cargar anteriores").
// - ninguno: los últimos PAGINA (carga inicial).
// Siempre devuelve en orden cronológico (id asc).
async function listMensajes({ despuesDe, antesDe } = {}) {
  if (despuesDe != null) {
    const { rows } = await pool.query(
      `select ${MENSAJE_COLS} from public.programadores_chat_mensajes
        where id > $1 order by id asc limit 200;`,
      [despuesDe]
    );
    return { mensajes: rows, hayMas: false };
  }
  const params = [PAGINA + 1];
  let where = '';
  if (antesDe != null) {
    params.push(antesDe);
    where = 'where id < $2';
  }
  const { rows } = await pool.query(
    `select ${MENSAJE_COLS} from public.programadores_chat_mensajes
      ${where} order by id desc limit $1;`,
    params
  );
  const hayMas = rows.length > PAGINA;
  return { mensajes: rows.slice(0, PAGINA).reverse(), hayMas };
}

async function createMensaje({ autorId, autorUsername, texto, adjuntos }) {
  const { rows } = await pool.query(
    `insert into public.programadores_chat_mensajes (autor_id, autor_username, texto, adjuntos)
     values ($1, $2, $3, $4)
     returning ${MENSAJE_COLS};`,
    [autorId || null, autorUsername, texto || null, JSON.stringify(adjuntos || [])]
  );
  return rows[0];
}

async function listLecturas() {
  const { rows } = await pool.query(
    'select username, ultimo_leido_id from public.programadores_chat_lecturas;'
  );
  return rows.map((r) => ({ username: r.username, ultimo_leido_id: Number(r.ultimo_leido_id) }));
}

// Nunca retrocede: si llega un "leído hasta 10" viejo después de un "hasta
// 15", queda 15.
async function marcarLeido(username, hastaId) {
  await pool.query(
    `insert into public.programadores_chat_lecturas (username, ultimo_leido_id)
     values ($1, $2)
     on conflict (username) do update
       set ultimo_leido_id = greatest(public.programadores_chat_lecturas.ultimo_leido_id, excluded.ultimo_leido_id),
           updated_at = now();`,
    [username, hastaId]
  );
}

// Mensajes de OTROS posteriores a lo último que leyó. La primera vez que se
// consulta para un usuario (sin fila en _lecturas) se fija la línea de base
// en el último mensaje existente: lo que ya estaba antes no cuenta como "no
// leído", solo lo que llegue desde ahora.
async function contarNoLeidos(username) {
  await pool.query(
    `insert into public.programadores_chat_lecturas (username, ultimo_leido_id)
     select $1, coalesce(max(id), 0) from public.programadores_chat_mensajes
     on conflict (username) do nothing;`,
    [username]
  );
  const { rows } = await pool.query(
    `select count(*)::int as n
       from public.programadores_chat_mensajes m
       join public.programadores_chat_lecturas l on l.username = $1
      where m.id > l.ultimo_leido_id and m.autor_username <> $1;`,
    [username]
  );
  return rows[0]?.n || 0;
}

// Integrantes del grupo = admins activos con el scope. Se usa para el
// encabezado del chat y para saber cuándo un mensaje lo vieron todos.
async function listMiembros() {
  const { rows } = await pool.query(
    `select username, name from public.admin_users
      where is_active and $1 = any(coalesce(scopes, '{}'::text[]))
      order by lower(username);`,
    [SCOPE]
  );
  return rows;
}

module.exports = { SCOPE, listMensajes, createMensaje, listLecturas, marcarLeido, contarNoLeidos, listMiembros };

// lib/ticketsDb.js — capa de datos del sistema de tickets: un admin logueado
// crea un ticket (categoría + texto libre) y puede ver/responder los propios;
// cualquier admin logueado ve/responde/cierra todos desde /admin/tickets.
const { pool } = require('../db');

// Las consultas de LISTADO (varias filas, para pintar una tabla/lista) NO
// traen `adjuntos` a propósito: esa columna puede pesar varios MB por fila
// (adjuntos en base64, hasta ~15MB combinados por ticket) y la lista solo
// necesita estos campos. El detalle de un ticket puntual (getTicketForOwner/
// getTicketAdmin) sí trae todo con `select *`. Sin este recorte, cada poll
// del badge de "no leídos"/pendientes (cada 60s por pestaña abierta) y cada
// carga de /admin/tickets bajaban el base64 de TODOS los adjuntos de TODOS
// los tickets solo para mostrar categoría/estado/fecha.
const TICKET_LIST_COLUMNS = `
  id, categoria, mensaje, estado, creado_por_id, creado_por_username,
  ruta_origen, app_origen, created_at, updated_at
`;

async function createTicket({ categoria, mensaje, rutaOrigen, creadoPorId, creadoPorUsername, appOrigen, adjuntos }) {
  const { rows } = await pool.query(
    `
    insert into public.tickets (categoria, mensaje, ruta_origen, creado_por_id, creado_por_username, app_origen, adjuntos)
    values ($1, $2, $3, $4, $5, $6, $7::jsonb)
    returning *;
    `,
    [
      categoria,
      mensaje,
      rutaOrigen || null,
      creadoPorId || null,
      creadoPorUsername || null,
      appOrigen || 'planificacion',
      JSON.stringify(Array.isArray(adjuntos) ? adjuntos : []),
    ]
  );
  return rows[0];
}

async function listMyTickets(userId) {
  const { rows } = await pool.query(
    `select ${TICKET_LIST_COLUMNS} from public.tickets where creado_por_id = $1 order by created_at desc;`,
    [userId]
  );
  return rows;
}

async function listAllTickets({ estado, categoria, appOrigen } = {}) {
  const conditions = [];
  const params = [];
  if (estado) {
    params.push(estado);
    conditions.push(`estado = $${params.length}`);
  }
  if (categoria) {
    params.push(categoria);
    conditions.push(`categoria = $${params.length}`);
  }
  if (appOrigen) {
    params.push(appOrigen);
    conditions.push(`app_origen = $${params.length}`);
  }
  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
  const { rows } = await pool.query(
    `select ${TICKET_LIST_COLUMNS} from public.tickets ${where} order by created_at desc;`,
    params
  );
  return rows;
}

async function listMessages(ticketId) {
  const { rows } = await pool.query(
    `select * from public.ticket_mensajes where ticket_id = $1 order by created_at asc;`,
    [ticketId]
  );
  return rows;
}

async function getTicketForOwner(id, userId) {
  const { rows } = await pool.query(
    `select * from public.tickets where id = $1 and creado_por_id = $2;`,
    [id, userId]
  );
  const ticket = rows[0];
  if (!ticket) return null;
  const mensajes = await listMessages(id);
  return { ...ticket, mensajes };
}

async function getTicketAdmin(id) {
  const { rows } = await pool.query(`select * from public.tickets where id = $1;`, [id]);
  const ticket = rows[0];
  if (!ticket) return null;
  const mensajes = await listMessages(id);
  return { ...ticket, mensajes };
}

async function addMessage(ticketId, { autorId, autorUsername, esAdmin, mensaje }) {
  const { rows } = await pool.query(
    `
    insert into public.ticket_mensajes (ticket_id, autor_id, autor_username, es_admin, mensaje)
    values ($1, $2, $3, $4, $5)
    returning *;
    `,
    [ticketId, autorId || null, autorUsername || null, !!esAdmin, mensaje]
  );
  await pool.query(`update public.tickets set updated_at = now() where id = $1;`, [ticketId]);
  return rows[0];
}

async function setEstado(id, estado) {
  const { rows } = await pool.query(
    `update public.tickets set estado = $2, updated_at = now() where id = $1 returning *;`,
    [id, estado]
  );
  return rows[0];
}

// Anular el propio ticket: BORRA la fila (a pedido explícito del usuario -
// "de qué sirve tenerlo" - no es un soft-delete/estado). Solo quien lo creó,
// y solo si no está "closed" (ya resuelto por soporte - borrar después de
// eso no tiene sentido, ahí sí queda como historial). No hace falta ser
// admin, es autoservicio. `ticket_mensajes` tiene ON DELETE CASCADE, así
// que las respuestas del ticket se borran solas con esto.
async function deleteOwnTicket(id, userId) {
  const { rows } = await pool.query(
    `delete from public.tickets where id = $1 and creado_por_id = $2 and estado != 'closed' returning id;`,
    [id, userId]
  );
  return rows[0] || null;
}

// Borrar un ticket ya CERRADO, a mano, desde el panel admin. Cualquier admin
// (no hace falta ser quien lo creó, a diferencia de deleteOwnTicket) - pero
// solo si está "closed": es una decisión explícita de alguien de soporte
// sobre historial ya resuelto, no algo que pase solo. `ticket_mensajes`
// tiene ON DELETE CASCADE, así que sus respuestas se borran solas.
async function deleteClosedTicket(id) {
  const { rows } = await pool.query(
    `delete from public.tickets where id = $1 and estado = 'closed' returning id;`,
    [id]
  );
  return rows[0] || null;
}

module.exports = {
  createTicket,
  listMyTickets,
  listAllTickets,
  getTicketForOwner,
  getTicketAdmin,
  addMessage,
  setEstado,
  deleteOwnTicket,
  deleteClosedTicket,
};

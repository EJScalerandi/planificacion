// lib/ticketsDb.js — capa de datos del sistema de tickets: un admin logueado
// crea un ticket (categoría + texto libre) y puede ver/responder los propios;
// cualquier admin logueado ve/responde/cierra todos desde /admin/tickets.
const { pool } = require('../db');

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
    `select * from public.tickets where creado_por_id = $1 order by created_at desc;`,
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
    `select * from public.tickets ${where} order by created_at desc;`,
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

module.exports = {
  createTicket,
  listMyTickets,
  listAllTickets,
  getTicketForOwner,
  getTicketAdmin,
  addMessage,
  setEstado,
};

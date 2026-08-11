// lib/logisticaConsultasDb.js
//
// Consultas (tickets) de Logística hacia Técnica/Comercial, leídas/escritas
// directo sobre las mismas tablas que usa el Presupuestador
// (presupuestador_technical_tickets / presupuestador_commercial_tickets y sus
// *_ticket_messages), porque Planta y Presupuestador comparten la MISMA base
// de datos (Supabase). No hay llamada HTTP entre apps: Planta escribe directo.
//
// Identidad: todos los tickets creados desde acá quedan a nombre de la cuenta
// compartida "logistica" (public.presupuestador_users, is_logistica = true),
// que ya existía de antes. No se identifica a la persona puntual de Planta
// que escribió cada ticket - decisión tomada con el usuario.
const { pool } = require('../db');

const KIND_CONFIG = {
  technical: {
    ticketsTable: 'presupuestador_technical_tickets',
    messagesTable: 'presupuestador_technical_ticket_messages',
    staffReadCol: 'technical_last_read_at',
    staffRole: 'rev_tecnica',
    notFoundMsg: 'Consulta técnica no encontrada',
  },
  commercial: {
    ticketsTable: 'presupuestador_commercial_tickets',
    messagesTable: 'presupuestador_commercial_ticket_messages',
    staffReadCol: 'commercial_last_read_at',
    staffRole: 'enc_comercial',
    notFoundMsg: 'Consulta comercial no encontrada',
  },
};

function cfgFor(kind) {
  const cfg = KIND_CONFIG[kind];
  if (!cfg) throw new Error(`kind inválido: ${kind}`);
  return cfg;
}

let logisticaUserId = null;
async function getLogisticaUserId() {
  if (logisticaUserId) return logisticaUserId;
  const { rows } = await pool.query(
    `select id from public.presupuestador_users where username = 'logistica' and is_logistica = true limit 1;`
  );
  const id = Number(rows?.[0]?.id || 0);
  if (!id) throw new Error('No se encontró la cuenta de Logística en el Presupuestador (presupuestador_users.username = logistica)');
  logisticaUserId = id;
  return id;
}

function normalizeStatus(value, fallback = 'open') {
  const v = String(value || fallback).trim().toLowerCase();
  if (['all', 'open', 'pending', 'in_progress', 'closed'].includes(v)) return v;
  return fallback;
}

function normalizeSubject(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 180);
}

function normalizeReferenceNumber(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 60) || null;
}

function normalizeMessage(value) {
  return String(value || '').trim();
}

const MAX_TICKET_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const MAX_TICKET_VIDEO_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const VIDEO_TICKET_ATTACHMENT_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
const ALLOWED_TICKET_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  ...VIDEO_TICKET_ATTACHMENT_TYPES,
]);

function formatMb(bytes) {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

// Revalida en el server lo que ya valida el navegador (mismo criterio que el
// Presupuestador, ver cotizador-back/src/technicalConsultsDb.js).
function normalizeAttachment(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const dataUrl = String(raw.data_url || '').trim();
  if (!dataUrl) return null;
  if (!dataUrl.startsWith('data:')) throw new Error('Adjunto inválido');
  const type = String(raw.type || '').trim().toLowerCase();
  if (!ALLOWED_TICKET_ATTACHMENT_TYPES.has(type)) throw new Error('El adjunto debe ser una imagen, un PDF o un video');
  const size = Number(raw.size || 0) || 0;
  const maxBytes = VIDEO_TICKET_ATTACHMENT_TYPES.has(type) ? MAX_TICKET_VIDEO_ATTACHMENT_BYTES : MAX_TICKET_ATTACHMENT_BYTES;
  if (size > maxBytes) throw new Error(`El archivo excede el tamaño permitido (máximo ${formatMb(maxBytes)})`);
  return {
    name: String(raw.name || '').trim().slice(0, 200) || 'archivo',
    type,
    size,
    data_url: dataUrl,
    uploaded_at: raw.uploaded_at || new Date().toISOString(),
  };
}

function ticketStatusLabel(status) {
  const s = String(status || 'pending').trim().toLowerCase();
  if (['pending', 'in_progress', 'closed'].includes(s)) return s;
  return 'pending';
}

async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (err) {
    try { await client.query('rollback'); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

function listSql(cfg) {
  return `
    select
      t.id,
      t.created_by_user_id,
      t.assigned_to_user_id,
      t.status,
      t.subject,
      t.reference_number,
      t.created_at,
      t.updated_at,
      t.closed_at,
      t.requester_last_read_at,
      t.${cfg.staffReadCol},
      t.last_message_at,
      t.last_message_by_user_id,
      coalesce(nullif(assignee.full_name, ''), assignee.username, '') as assigned_to_name,
      coalesce(nullif(closer.full_name, ''), closer.username, '') as closed_by_name,
      (
        select m.message_text
        from public.${cfg.messagesTable} m
        where m.ticket_id = t.id
        order by m.created_at desc, m.id desc
        limit 1
      ) as last_message_text,
      (
        select m.message_type
        from public.${cfg.messagesTable} m
        where m.ticket_id = t.id
        order by m.created_at desc, m.id desc
        limit 1
      ) as last_message_type,
      (
        select count(*)::int
        from public.${cfg.messagesTable} m
        where m.ticket_id = t.id
          and m.author_user_id <> $1
          and m.created_at > coalesce(t.requester_last_read_at, to_timestamp(0))
      ) as unread_count,
      exists(
        select 1
        from public.${cfg.messagesTable} m
        where m.ticket_id = t.id
          and m.author_user_id <> $1
          and m.created_at > coalesce(t.requester_last_read_at, to_timestamp(0))
      ) as has_unread
    from public.${cfg.ticketsTable} t
    left join public.presupuestador_users assignee on assignee.id = t.assigned_to_user_id
    left join public.presupuestador_users closer on closer.id = t.closed_by_user_id
  `;
}

async function listConsults(kind, { status = 'open' } = {}) {
  const cfg = cfgFor(kind);
  const uid = await getLogisticaUserId();
  const normalizedStatus = normalizeStatus(status, 'open');

  const where = [`t.created_by_user_id = $1`];
  const params = [uid];
  if (normalizedStatus === 'open') {
    where.push(`t.status in ('pending', 'in_progress')`);
  } else if (['pending', 'in_progress', 'closed'].includes(normalizedStatus)) {
    params.push(normalizedStatus);
    where.push(`t.status = $${params.length}`);
  }

  const q = await pool.query(
    `${listSql(cfg)}
     where ${where.join(' and ')}
     order by coalesce(t.last_message_at, t.created_at) desc, t.id desc`,
    params
  );
  return q.rows || [];
}

async function getTicketRow(clientOrDb, cfg, id) {
  const q = await clientOrDb.query(
    `select t.*,
            coalesce(nullif(assignee.full_name, ''), assignee.username, '') as assigned_to_name,
            coalesce(nullif(closer.full_name, ''), closer.username, '') as closed_by_name
       from public.${cfg.ticketsTable} t
       left join public.presupuestador_users assignee on assignee.id = t.assigned_to_user_id
       left join public.presupuestador_users closer on closer.id = t.closed_by_user_id
      where t.id = $1
      limit 1`,
    [Number(id)]
  );
  return q.rows?.[0] || null;
}

async function getTicketMessages(clientOrDb, cfg, ticketId) {
  const q = await clientOrDb.query(
    `select
       m.id,
       m.ticket_id,
       m.author_user_id,
       m.author_role,
       m.message_text,
       m.message_type,
       m.attachment,
       m.created_at,
       coalesce(nullif(u.full_name, ''), u.username, concat('#', m.author_user_id::text)) as author_name,
       u.username as author_username
     from public.${cfg.messagesTable} m
     join public.presupuestador_users u on u.id = m.author_user_id
     where m.ticket_id = $1
     order by m.created_at asc, m.id asc`,
    [Number(ticketId)]
  );
  return q.rows || [];
}

async function assertOwnTicket(cfg, ticket, uid) {
  if (!ticket) throw new Error(cfg.notFoundMsg);
  if (Number(ticket.created_by_user_id || 0) !== uid) throw new Error('No autorizado');
}

async function getConsultDetail(kind, id) {
  const cfg = cfgFor(kind);
  const uid = await getLogisticaUserId();
  const ticket = await getTicketRow(pool, cfg, id);
  await assertOwnTicket(cfg, ticket, uid);

  const messages = await getTicketMessages(pool, cfg, ticket.id);
  const unreadQ = await pool.query(
    `select count(*)::int as unread_count
       from public.${cfg.messagesTable} m
      where m.ticket_id = $1
        and m.author_user_id <> $2
        and m.created_at > coalesce($3::timestamptz, to_timestamp(0))`,
    [ticket.id, uid, ticket.requester_last_read_at || null]
  );

  return {
    ...ticket,
    unread_count: Number(unreadQ.rows?.[0]?.unread_count || 0),
    status: ticketStatusLabel(ticket.status),
    messages,
    can_reply: ticket.status !== 'closed',
  };
}

async function createConsult(kind, { subject, message, attachment, reference_number } = {}) {
  const cfg = cfgFor(kind);
  const uid = await getLogisticaUserId();

  const cleanSubject = normalizeSubject(subject);
  const cleanMessage = normalizeMessage(message);
  if (!cleanSubject) throw new Error('Falta asunto');
  if (!cleanMessage) throw new Error('Falta mensaje');
  const cleanAttachment = normalizeAttachment(attachment);
  const cleanReferenceNumber = normalizeReferenceNumber(reference_number);

  const now = new Date().toISOString();

  const ticketId = await withTx(async (client) => {
    const createdTicket = await client.query(
      `insert into public.${cfg.ticketsTable} (
         created_by_user_id, status, subject, reference_number,
         requester_last_read_at, ${cfg.staffReadCol},
         last_message_at, last_message_by_user_id, created_at, updated_at
       )
       values ($1, 'pending', $2, $3, $4, null, $4, $1, $4, $4)
       returning id`,
      [uid, cleanSubject, cleanReferenceNumber, now]
    );
    const id = Number(createdTicket.rows?.[0]?.id || 0);
    if (!id) throw new Error('No se pudo crear la consulta');

    await client.query(
      `insert into public.${cfg.messagesTable} (
         ticket_id, author_user_id, author_role, message_text, message_type, attachment, created_at
       )
       values ($1, $2, 'logistica', $3, 'message', $4::jsonb, $5)`,
      [id, uid, cleanMessage, cleanAttachment ? JSON.stringify(cleanAttachment) : null, now]
    );

    return id;
  });

  return getConsultDetail(kind, ticketId);
}

async function addConsultMessage(kind, id, { message, attachment } = {}) {
  const cfg = cfgFor(kind);
  const uid = await getLogisticaUserId();
  const cleanMessage = normalizeMessage(message);
  if (!cleanMessage) throw new Error('Falta mensaje');
  const cleanAttachment = normalizeAttachment(attachment);

  const ticketId = Number(id || 0);
  if (!ticketId) throw new Error('Consulta inválida');

  await withTx(async (client) => {
    const ticket = await getTicketRow(client, cfg, ticketId);
    await assertOwnTicket(cfg, ticket, uid);
    if (ticket.status === 'closed') throw new Error('La consulta está cerrada');

    const now = new Date().toISOString();

    await client.query(
      `insert into public.${cfg.messagesTable} (
         ticket_id, author_user_id, author_role, message_text, message_type, attachment, created_at
       )
       values ($1, $2, 'logistica', $3, 'message', $4::jsonb, $5)`,
      [ticketId, uid, cleanMessage, cleanAttachment ? JSON.stringify(cleanAttachment) : null, now]
    );

    await client.query(
      `update public.${cfg.ticketsTable}
          set updated_at = $2,
              last_message_at = $2,
              last_message_by_user_id = $3,
              requester_last_read_at = $2
        where id = $1`,
      [ticketId, now, uid]
    );
  });

  return getConsultDetail(kind, ticketId);
}

async function markConsultRead(kind, id) {
  const cfg = cfgFor(kind);
  const uid = await getLogisticaUserId();
  const ticketId = Number(id || 0);
  if (!ticketId) throw new Error('Consulta inválida');

  const ticket = await getTicketRow(pool, cfg, ticketId);
  await assertOwnTicket(cfg, ticket, uid);

  await pool.query(
    `update public.${cfg.ticketsTable} set requester_last_read_at = now() where id = $1`,
    [ticketId]
  );
  return true;
}

async function getUnreadSummary(kind) {
  const cfg = cfgFor(kind);
  const uid = await getLogisticaUserId();
  const q = await pool.query(
    `select
       count(*) filter (
         where exists (
           select 1
           from public.${cfg.messagesTable} m
           where m.ticket_id = t.id
             and m.author_user_id <> $1
             and m.created_at > coalesce(t.requester_last_read_at, to_timestamp(0))
         )
       )::int as unread_count,
       count(*) filter (where t.status in ('pending', 'in_progress'))::int as open_count
     from public.${cfg.ticketsTable} t
     where t.created_by_user_id = $1`,
    [uid]
  );
  return {
    unread_count: Number(q.rows?.[0]?.unread_count || 0),
    open_count: Number(q.rows?.[0]?.open_count || 0),
  };
}

module.exports = {
  listConsults,
  createConsult,
  getConsultDetail,
  addConsultMessage,
  markConsultRead,
  getUnreadSummary,
};

// src/components/LogisticaConsultasPanel.jsx
//
// Consultas de Logística hacia Técnica / Comercial, desde /a. Funciona igual
// que lo que ya tienen vendedores/distribuidores en el Presupuestador (mismas
// tablas, misma base de datos) - ver Backend/server/lib/logisticaConsultasDb.js.
// Toda consulta creada acá queda a nombre de la cuenta compartida "Logística".
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchLogisticaConsultas,
  fetchLogisticaConsultaDetail,
  createLogisticaConsulta,
  addLogisticaConsultaMessage,
  markLogisticaConsultaRead,
} from '../api';
import {
  fileToTicketAttachment,
  formatTicketAttachmentMeta,
  isImageTicketAttachment,
  isVideoTicketAttachment,
  ticketAttachmentDisplayUrl,
  openTicketAttachment,
  downloadTicketAttachment,
} from '../utils/ticketAttachment';

function fmtDateTime(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return String(v);
  }
}

function ShellModal({ onClose, title, children, width = 'min(980px, 100%)' }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 9999,
      }}
    >
      <div
        style={{
          width,
          maxHeight: '92vh',
          background: 'var(--surface)',
          borderRadius: 14,
          border: '1px solid var(--border)',
          boxShadow: '0 18px 55px rgba(0,0,0,0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '12px 14px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            background: 'var(--brand-100)',
          }}
        >
          <div style={{ fontWeight: 900 }}>{title}</div>
          <button className="btn" type="button" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <div style={{ overflow: 'auto', flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

const STATUS_LABEL = { pending: 'Pendiente', in_progress: 'En proceso', closed: 'Cerrada' };
function statusTone(status) {
  if (status === 'closed') return { bg: '#f1f5f9', fg: '#475569', border: '#cbd5e1' };
  if (status === 'in_progress') return { bg: '#fffbeb', fg: '#92400e', border: '#f59e0b' };
  return { bg: '#fef2f2', fg: '#991b1b', border: '#fca5a5' };
}

function AttachmentPicker({ attachment, err, onPick, onClear, disabled }) {
  const inputRef = useRef(null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
          style={{ display: 'none' }}
          disabled={disabled}
          onChange={async (e) => {
            const file = e.target.files?.[0] || null;
            e.target.value = '';
            if (!file) return;
            await onPick(file);
          }}
        />
        <button type="button" className="btn" disabled={disabled} onClick={() => inputRef.current?.click()}>
          {attachment ? 'Cambiar adjunto' : '+ Adjuntar (imagen/PDF/video)'}
        </button>
        {attachment ? (
          <>
            <span style={{ fontSize: 12, opacity: 0.8 }}>{formatTicketAttachmentMeta(attachment)}</span>
            <button type="button" className="btn" disabled={disabled} onClick={onClear} style={{ color: '#991b1b' }}>
              Quitar
            </button>
          </>
        ) : null}
      </div>
      {err ? <div style={{ color: 'crimson', fontSize: 12 }}>{err}</div> : null}
    </div>
  );
}

function AttachmentPreview({ attachment }) {
  if (!attachment) return null;
  if (isImageTicketAttachment(attachment)) {
    return (
      <div style={{ marginTop: 6 }}>
        <img
          src={ticketAttachmentDisplayUrl(attachment)}
          alt={attachment.name || 'adjunto'}
          style={{ maxWidth: 220, maxHeight: 160, borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer' }}
          onClick={() => openTicketAttachment(attachment)}
        />
      </div>
    );
  }
  return (
    <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
      <button type="button" className="btn" onClick={() => openTicketAttachment(attachment)}>
        {isVideoTicketAttachment(attachment) ? 'Ver video' : 'Abrir adjunto'}
      </button>
      <button type="button" className="btn" onClick={() => downloadTicketAttachment(attachment)}>
        Descargar
      </button>
      <span style={{ fontSize: 12, opacity: 0.75 }}>{formatTicketAttachmentMeta(attachment)}</span>
    </div>
  );
}

export default function LogisticaConsultasPanel({ onClose }) {
  const [kind, setKind] = useState('technical'); // 'technical' | 'commercial'
  const [status, setStatus] = useState('open');

  const [tickets, setTickets] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [errList, setErrList] = useState('');

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [showNew, setShowNew] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [newRef, setNewRef] = useState('');
  const [newAttachment, setNewAttachment] = useState(null);
  const [newAttachmentErr, setNewAttachmentErr] = useState('');
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState('');

  const [replyText, setReplyText] = useState('');
  const [replyAttachment, setReplyAttachment] = useState(null);
  const [replyAttachmentErr, setReplyAttachmentErr] = useState('');
  const [sending, setSending] = useState(false);
  const [replyErr, setReplyErr] = useState('');

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setErrList('');
    try {
      const { data } = await fetchLogisticaConsultas(kind, status);
      setTickets(data?.tickets || []);
    } catch (e) {
      setErrList(e?.response?.data?.error || e.message);
    } finally {
      setLoadingList(false);
    }
  }, [kind, status]);

  useEffect(() => {
    setSelectedId(null);
    setDetail(null);
    setShowNew(false);
    loadList();
  }, [kind, status, loadList]);

  const loadDetail = useCallback(
    async (id) => {
      if (!id) return;
      setLoadingDetail(true);
      try {
        const { data } = await fetchLogisticaConsultaDetail(kind, id);
        setDetail(data?.ticket || null);
        markLogisticaConsultaRead(kind, id).catch(() => {});
      } catch {
        setDetail(null);
      } finally {
        setLoadingDetail(false);
      }
    },
    [kind]
  );

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  async function handlePickAttachment(file, setAtt, setErr) {
    setErr('');
    try {
      const att = await fileToTicketAttachment(file);
      setAtt(att);
    } catch (e) {
      setErr(e.message || 'No se pudo adjuntar el archivo');
    }
  }

  async function handleCreate() {
    setCreateErr('');
    if (!newSubject.trim() || !newMessage.trim()) {
      setCreateErr('Completá asunto y mensaje');
      return;
    }
    setCreating(true);
    try {
      const { data } = await createLogisticaConsulta(kind, {
        subject: newSubject,
        message: newMessage,
        reference_number: newRef || null,
        attachment: newAttachment,
      });
      setShowNew(false);
      setNewSubject('');
      setNewMessage('');
      setNewRef('');
      setNewAttachment(null);
      await loadList();
      if (data?.ticket?.id) setSelectedId(data.ticket.id);
    } catch (e) {
      setCreateErr(e?.response?.data?.error || e.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleReply() {
    setReplyErr('');
    if (!replyText.trim()) {
      setReplyErr('Escribí un mensaje');
      return;
    }
    setSending(true);
    try {
      await addLogisticaConsultaMessage(kind, selectedId, { message: replyText, attachment: replyAttachment });
      setReplyText('');
      setReplyAttachment(null);
      await loadDetail(selectedId);
      await loadList();
    } catch (e) {
      setReplyErr(e?.response?.data?.error || e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <ShellModal onClose={onClose} title="Consultas · Logística">
      <div style={{ padding: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className={`btn${kind === 'technical' ? ' btn--brand' : ''}`} onClick={() => setKind('technical')}>
              Técnica
            </button>
            <button type="button" className={`btn${kind === 'commercial' ? ' btn--brand' : ''}`} onClick={() => setKind('commercial')}>
              Comercial
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className={`btn${status === 'open' ? ' btn--brand' : ''}`} onClick={() => setStatus('open')}>
              Abiertas
            </button>
            <button type="button" className={`btn${status === 'closed' ? ' btn--brand' : ''}`} onClick={() => setStatus('closed')}>
              Cerradas
            </button>
            <button type="button" className={`btn${status === 'all' ? ' btn--brand' : ''}`} onClick={() => setStatus('all')}>
              Todas
            </button>
          </div>

          <button type="button" className="btn" onClick={loadList} disabled={loadingList}>
            {loadingList ? 'Actualizando…' : 'Refrescar'}
          </button>

          <button
            type="button"
            className="btn btn--brand"
            style={{ marginLeft: 'auto' }}
            onClick={() => {
              setShowNew((p) => !p);
              setSelectedId(null);
              setDetail(null);
            }}
          >
            + Nueva consulta
          </button>
        </div>

        {errList ? <div style={{ color: 'crimson', marginBottom: 10 }}>{errList}</div> : null}

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {/* Lista */}
          <div style={{ flex: 1, minWidth: 300, maxHeight: 520, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!loadingList && !tickets.length ? <div style={{ opacity: 0.7 }}>Sin consultas para mostrar.</div> : null}

            {tickets.map((t) => {
              const isSelected = String(t.id) === String(selectedId);
              const tone = statusTone(t.status);
              const unread = Number(t.unread_count || 0);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setShowNew(false);
                    setSelectedId(t.id);
                  }}
                  style={{
                    textAlign: 'left',
                    border: isSelected ? '2px solid var(--brand)' : '1px solid var(--border)',
                    background: isSelected ? 'var(--brand-100)' : 'var(--surface)',
                    borderRadius: 12,
                    padding: 10,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontWeight: 800 }}>
                      #{t.id} · {t.subject}
                    </div>
                    <div
                      style={{
                        padding: '2px 8px',
                        borderRadius: 999,
                        border: `1px solid ${tone.border}`,
                        background: tone.bg,
                        color: tone.fg,
                        fontSize: 11,
                        fontWeight: 800,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {STATUS_LABEL[t.status] || t.status}
                    </div>
                  </div>
                  {t.reference_number ? (
                    <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>Ref: {t.reference_number}</div>
                  ) : null}
                  {t.last_message_text ? (
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>{String(t.last_message_text).slice(0, 140)}</div>
                  ) : null}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    <span style={{ fontSize: 11, opacity: 0.6 }}>{fmtDateTime(t.last_message_at || t.updated_at || t.created_at)}</span>
                    {unread > 0 ? (
                      <span
                        style={{
                          minWidth: 18,
                          height: 18,
                          borderRadius: 999,
                          background: '#d93025',
                          color: '#fff',
                          fontSize: 11,
                          fontWeight: 800,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '0 6px',
                        }}
                      >
                        {unread}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detalle / Nueva consulta */}
          <div style={{ flex: 1.4, minWidth: 340, maxHeight: 520, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
            {showNew ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontWeight: 900 }}>Nueva consulta a {kind === 'technical' ? 'Técnica' : 'Comercial'}</div>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>Asunto</span>
                  <input className="btn" style={{ textAlign: 'left' }} value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="Asunto de la consulta" />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>N° de venta / NV (opcional)</span>
                  <input className="btn" style={{ textAlign: 'left' }} value={newRef} onChange={(e) => setNewRef(e.target.value)} placeholder="Ej: 4321" />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>Mensaje</span>
                  <textarea
                    rows={5}
                    style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: 13, padding: 8, borderRadius: 10, border: '1px solid var(--border)' }}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Contanos el detalle de la consulta…"
                  />
                </label>
                <AttachmentPicker
                  attachment={newAttachment}
                  err={newAttachmentErr}
                  disabled={creating}
                  onPick={(file) => handlePickAttachment(file, setNewAttachment, setNewAttachmentErr)}
                  onClear={() => setNewAttachment(null)}
                />
                {createErr ? <div style={{ color: 'crimson', fontSize: 13 }}>{createErr}</div> : null}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn--brand" disabled={creating} onClick={handleCreate}>
                    {creating ? 'Enviando…' : 'Enviar consulta'}
                  </button>
                  <button type="button" className="btn" disabled={creating} onClick={() => setShowNew(false)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : !selectedId ? (
              <div style={{ opacity: 0.7 }}>Seleccioná una consulta de la lista, o creá una nueva.</div>
            ) : loadingDetail ? (
              <div style={{ opacity: 0.7 }}>Cargando conversación…</div>
            ) : !detail ? (
              <div style={{ color: 'crimson' }}>No se pudo cargar la consulta.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 15 }}>
                    #{detail.id} · {detail.subject}
                  </div>
                  {detail.reference_number ? (
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>Ref: {detail.reference_number}</div>
                  ) : null}
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
                    Estado: {STATUS_LABEL[detail.status] || detail.status} · Creada {fmtDateTime(detail.created_at)}
                  </div>
                  {detail.assigned_to_name ? (
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Asignado a: {detail.assigned_to_name}</div>
                  ) : null}
                  {detail.closed_at ? (
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      Cerrada por {detail.closed_by_name || '—'} · {fmtDateTime(detail.closed_at)}
                    </div>
                  ) : null}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(detail.messages || []).map((m) => {
                    const mine = m.author_role === 'logistica';
                    return (
                      <div
                        key={m.id}
                        style={{
                          alignSelf: mine ? 'flex-end' : 'flex-start',
                          maxWidth: '85%',
                          background: mine ? 'var(--brand-100)' : '#f1f5f9',
                          border: '1px solid var(--border)',
                          borderRadius: 12,
                          padding: 10,
                        }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.75, marginBottom: 4 }}>
                          {m.message_type === 'resolution' ? 'Resolución · ' : ''}
                          {m.author_name} · {fmtDateTime(m.created_at)}
                        </div>
                        <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{m.message_text}</div>
                        <AttachmentPreview attachment={m.attachment} />
                      </div>
                    );
                  })}
                </div>

                {detail.can_reply ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    <textarea
                      rows={3}
                      style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: 13, padding: 8, borderRadius: 10, border: '1px solid var(--border)' }}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Escribir respuesta…"
                    />
                    <AttachmentPicker
                      attachment={replyAttachment}
                      err={replyAttachmentErr}
                      disabled={sending}
                      onPick={(file) => handlePickAttachment(file, setReplyAttachment, setReplyAttachmentErr)}
                      onClear={() => setReplyAttachment(null)}
                    />
                    {replyErr ? <div style={{ color: 'crimson', fontSize: 13 }}>{replyErr}</div> : null}
                    <div>
                      <button type="button" className="btn btn--brand" disabled={sending} onClick={handleReply}>
                        {sending ? 'Enviando…' : 'Responder'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, opacity: 0.7, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    Esta consulta está cerrada, no admite más respuestas.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </ShellModal>
  );
}

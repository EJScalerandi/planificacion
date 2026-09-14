import { useEffect, useRef, useState } from 'react';
import { createTicket, fetchMyTickets, fetchMyTicketDetail, addMyTicketMessage } from '../api';
import {
  fileToTicketAttachment,
  formatTicketAttachmentMeta,
  isImageTicketAttachment,
  openTicketAttachment,
  downloadTicketAttachment,
} from '../utils/ticketAttachment';

// Botón "Tickets" (junto a "Menú" en NonProductionLayout, y junto a
// "Refrescar" en los tableros de producción — ver App.jsx) que abre un panel
// chico para mandar un ticket (categoría + texto libre) y ver el estado de
// los que ya mandaste. Cualquier admin logueado los gestiona desde
// /admin/tickets (pages/admin/AdminTicketsPage.jsx).
const TICKET_CATEGORIAS = [
  'Duda sobre el sistema',
  'Error / algo no funciona',
  'Solicitud de acceso o permiso',
  'Consulta sobre un pedido / NV',
  'Otro',
];

const ESTADO_LABEL = { pending: 'Pendiente', in_progress: 'En curso', closed: 'Cerrado' };
const ESTADO_COLOR = {
  pending: 'var(--state-pending, #b45309)',
  in_progress: 'var(--state-process, #92720c)',
  closed: 'var(--state-done, #15803d)',
};

export default function TicketWidget() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('nueva'); // 'nueva' | 'mias'
  const panelRef = useRef(null);

  const [categoria, setCategoria] = useState(TICKET_CATEGORIAS[0]);
  const [mensaje, setMensaje] = useState('');
  const [adjuntos, setAdjuntos] = useState([]);
  const [subiendoAdjunto, setSubiendoAdjunto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [errorNueva, setErrorNueva] = useState('');

  const [misTickets, setMisTickets] = useState([]);
  const [cargandoMias, setCargandoMias] = useState(false);
  const [ticketSeleccionado, setTicketSeleccionado] = useState(null);
  const [respuesta, setRespuesta] = useState('');

  useEffect(() => {
    function onDocClick(e) {
      if (open && panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  useEffect(() => {
    if (open && tab === 'mias') cargarMisTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab]);

  async function cargarMisTickets() {
    setCargandoMias(true);
    try {
      const { data } = await fetchMyTickets();
      setMisTickets(data?.tickets || []);
    } catch (err) {
      console.error('Error cargando mis tickets:', err);
    } finally {
      setCargandoMias(false);
    }
  }

  async function abrirTicket(id) {
    try {
      const { data } = await fetchMyTicketDetail(id);
      setTicketSeleccionado(data?.ticket || null);
    } catch (err) {
      console.error('Error abriendo ticket:', err);
    }
  }

  async function onSeleccionarArchivos(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setErrorNueva('');
    setSubiendoAdjunto(true);
    try {
      const nuevos = [];
      for (const file of files) {
        nuevos.push(await fileToTicketAttachment(file));
      }
      setAdjuntos((prev) => [...prev, ...nuevos].slice(0, 5));
    } catch (err) {
      setErrorNueva(err.message || 'No se pudo adjuntar el archivo.');
    } finally {
      setSubiendoAdjunto(false);
    }
  }

  function quitarAdjunto(idx) {
    setAdjuntos((prev) => prev.filter((_, i) => i !== idx));
  }

  async function enviarNuevoTicket(e) {
    e.preventDefault();
    if (!mensaje.trim()) {
      setErrorNueva('Escribí el detalle antes de enviar.');
      return;
    }
    setErrorNueva('');
    setEnviando(true);
    try {
      await createTicket({
        categoria,
        mensaje: mensaje.trim(),
        rutaOrigen: window.location.pathname,
        adjuntos,
      });
      setMensaje('');
      setAdjuntos([]);
      setEnviado(true);
      setTimeout(() => setEnviado(false), 4000);
    } catch (err) {
      setErrorNueva(err?.response?.data?.error || 'No se pudo enviar el ticket. Probá de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  async function enviarRespuesta(e) {
    e.preventDefault();
    if (!ticketSeleccionado || !respuesta.trim()) return;
    try {
      await addMyTicketMessage(ticketSeleccionado.id, { mensaje: respuesta.trim() });
      setRespuesta('');
      await abrirTicket(ticketSeleccionado.id);
    } catch (err) {
      console.error('Error enviando respuesta:', err);
    }
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="btn"
        onClick={() => setOpen((v) => !v)}
        title="Tickets"
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px' }}
      >
        <img src="/ticket-logo.png" alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} />
        Tickets
      </button>

      {open && (
        <div
          ref={panelRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 360,
            maxWidth: '90vw',
            background: 'var(--surface)',
            color: 'var(--ink)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 12px 32px rgba(15,23,42,.18)',
            zIndex: 1000,
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => setTab('nueva')}
              style={{
                flex: 1,
                padding: '10px 8px',
                border: 'none',
                cursor: 'pointer',
                background: tab === 'nueva' ? 'var(--brand-100)' : 'transparent',
                color: tab === 'nueva' ? 'var(--brand-700)' : 'var(--ink)',
                fontWeight: tab === 'nueva' ? 700 : 400,
              }}
            >
              Nuevo ticket
            </button>
            <button
              type="button"
              onClick={() => setTab('mias')}
              style={{
                flex: 1,
                padding: '10px 8px',
                border: 'none',
                cursor: 'pointer',
                background: tab === 'mias' ? 'var(--brand-100)' : 'transparent',
                color: tab === 'mias' ? 'var(--brand-700)' : 'var(--ink)',
                fontWeight: tab === 'mias' ? 700 : 400,
              }}
            >
              Mis tickets
            </button>
          </div>

          <div style={{ padding: 14, maxHeight: 420, overflowY: 'auto' }}>
            {tab === 'nueva' && (
              <form onSubmit={enviarNuevoTicket}>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--ink-weak)' }}>
                  Categoría
                </label>
                <select
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  style={{ width: '100%', padding: 8, marginBottom: 10, borderRadius: 8, border: '1px solid var(--border)' }}
                >
                  {TICKET_CATEGORIAS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--ink-weak)' }}>
                  Contanos tu ticket
                </label>
                <textarea
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                  rows={5}
                  placeholder="Escribí acá el detalle..."
                  style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid var(--border)', resize: 'vertical' }}
                />

                <label style={{ display: 'block', fontSize: 12, margin: '10px 0 4px', color: 'var(--ink-weak)' }}>
                  Adjuntar foto, video o PDF (opcional)
                </label>
                <input
                  type="file"
                  accept="image/*,video/mp4,video/quicktime,video/webm,application/pdf"
                  multiple
                  onChange={onSeleccionarArchivos}
                  disabled={subiendoAdjunto || adjuntos.length >= 5}
                  style={{ fontSize: 12 }}
                />
                {subiendoAdjunto && <div style={{ fontSize: 12, color: 'var(--ink-weak)', marginTop: 4 }}>Procesando...</div>}

                {adjuntos.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {adjuntos.map((a, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          fontSize: 12, padding: '4px 8px', marginBottom: 4,
                          borderRadius: 6, border: '1px solid var(--border)',
                        }}
                      >
                        <span>{formatTicketAttachmentMeta(a)}</span>
                        <button
                          type="button"
                          onClick={() => quitarAdjunto(idx)}
                          style={{ background: 'none', border: 'none', color: '#b3261e', cursor: 'pointer', padding: 0 }}
                        >
                          Quitar
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {errorNueva && <div style={{ color: '#b3261e', fontSize: 12, marginTop: 6 }}>{errorNueva}</div>}
                {enviado && (
                  <div style={{ color: 'var(--brand-700)', fontSize: 12, marginTop: 6 }}>
                    ¡Listo! Tu ticket fue enviado.
                  </div>
                )}

                <button type="submit" className="btn btn--brand" disabled={enviando} style={{ width: '100%', marginTop: 10 }}>
                  {enviando ? 'Enviando...' : 'Enviar ticket'}
                </button>
              </form>
            )}

            {tab === 'mias' && !ticketSeleccionado && (
              <div>
                {cargandoMias && <div style={{ fontSize: 13, color: 'var(--ink-weak)' }}>Cargando...</div>}
                {!cargandoMias && misTickets.length === 0 && (
                  <div style={{ fontSize: 13, color: 'var(--ink-weak)' }}>Todavía no enviaste ningún ticket.</div>
                )}
                {misTickets.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => abrirTicket(t.id)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 10px',
                      marginBottom: 6,
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{t.categoria}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-weak)', margin: '2px 0' }}>
                      {new Date(t.created_at).toLocaleString()}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: ESTADO_COLOR[t.estado] || 'var(--ink)' }}>
                      {ESTADO_LABEL[t.estado] || t.estado}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {tab === 'mias' && ticketSeleccionado && (
              <div>
                <button
                  type="button"
                  onClick={() => setTicketSeleccionado(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--brand-700)', cursor: 'pointer', padding: 0, marginBottom: 8 }}
                >
                  ← Volver
                </button>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{ticketSeleccionado.categoria}</div>
                <span style={{ fontSize: 11, fontWeight: 700, color: ESTADO_COLOR[ticketSeleccionado.estado] || 'var(--ink)' }}>
                  {ESTADO_LABEL[ticketSeleccionado.estado] || ticketSeleccionado.estado}
                </span>
                <div style={{ fontSize: 13, marginTop: 8, whiteSpace: 'pre-wrap' }}>{ticketSeleccionado.mensaje}</div>

                {(ticketSeleccionado.adjuntos || []).length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {ticketSeleccionado.adjuntos.map((a, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => openTicketAttachment(a)}
                        onDoubleClick={() => downloadTicketAttachment(a)}
                        title={`${formatTicketAttachmentMeta(a)} (clic para ver, doble clic para descargar)`}
                        style={{
                          border: '1px solid var(--border)', borderRadius: 6, padding: 4,
                          background: 'transparent', cursor: 'pointer', fontSize: 11, textAlign: 'left',
                        }}
                      >
                        {isImageTicketAttachment(a) ? (
                          <img src={a.data_url} alt={a.name} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 4, display: 'block' }} />
                        ) : (
                          <span>📎 {formatTicketAttachmentMeta(a)}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  {(ticketSeleccionado.mensajes || []).map((m) => (
                    <div key={m.id} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, color: 'var(--ink-weak)' }}>
                        {m.es_admin ? (m.autor_username || 'Soporte') : 'Vos'} · {new Date(m.created_at).toLocaleString()}
                      </div>
                      <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{m.mensaje}</div>
                    </div>
                  ))}
                </div>

                {ticketSeleccionado.estado !== 'closed' && (
                  <form onSubmit={enviarRespuesta} style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                    <input
                      value={respuesta}
                      onChange={(e) => setRespuesta(e.target.value)}
                      placeholder="Agregar un comentario..."
                      style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid var(--border)' }}
                    />
                    <button type="submit" className="btn btn--brand">Enviar</button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// pages/admin/AdminTicketsPage.jsx — ver todos los tickets, responderlos y
// cambiarles el estado. Sin scope propio: cualquier admin logueado entra,
// igual que /admin/indice-programacion. Las respuestas que se mandan acá se
// ven reflejadas en "Mis tickets" del widget de quien creó el ticket
// (Frontend/src/components/TicketWidget.jsx).
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  clearAdminToken,
  fetchAdminTickets,
  fetchAdminTicketDetail,
  addAdminTicketMessage,
  updateTicketStatus,
} from '../../src/api';
import BaseModal from '../../src/components/modals/BaseModal';
import {
  formatTicketAttachmentMeta,
  isImageTicketAttachment,
  openTicketAttachment,
  downloadTicketAttachment,
} from '../../src/utils/ticketAttachment';

const ESTADOS = [
  { key: '', label: 'Todos' },
  { key: 'pending', label: 'Pendientes' },
  { key: 'in_progress', label: 'En curso' },
  { key: 'closed', label: 'Cerrados' },
];

const ESTADO_LABEL = { pending: 'Pendiente', in_progress: 'En curso', closed: 'Cerrado' };
const ESTADO_COLOR = {
  pending: 'var(--state-pending, #b45309)',
  in_progress: 'var(--state-process, #92720c)',
  closed: 'var(--state-done, #15803d)',
};

// Este panel es el lugar central para los tickets de TODAS las apps del
// ecosistema (planificación, integrador, y las que se sumen después) —
// todas escriben en las mismas tablas `tickets`/`ticket_mensajes`.
const APP_LABEL = { planificacion: 'Planificación', integrador: 'Integrador' };

// Quien responde elige a nombre de quién queda la respuesta (para que el
// que mandó el ticket vea el nombre real, no "Soporte").
const RESPONDIENTES = ['Esteban', 'Juan Ignacio', 'Santiago'];

export default function AdminTicketsPage() {
  const nav = useNavigate();
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [tickets, setTickets] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const [seleccionado, setSeleccionado] = useState(null);
  const [respuesta, setRespuesta] = useState('');
  const [autorNombre, setAutorNombre] = useState(RESPONDIENTES[0]);
  const [enviandoRespuesta, setEnviandoRespuesta] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);

  const logout = () => {
    clearAdminToken();
    nav('/admin/login');
  };

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const { data } = await fetchAdminTickets(estadoFiltro ? { estado: estadoFiltro } : {});
      setTickets(data?.tickets || []);
    } catch (err) {
      setError(err?.response?.data?.error || 'Error cargando los tickets');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoFiltro]);

  async function abrir(id) {
    try {
      const { data } = await fetchAdminTicketDetail(id);
      setSeleccionado(data?.ticket || null);
    } catch (err) {
      console.error('Error abriendo ticket:', err);
    }
  }

  async function enviarRespuesta(e) {
    e.preventDefault();
    if (!seleccionado || !respuesta.trim()) return;
    setEnviandoRespuesta(true);
    try {
      await addAdminTicketMessage(seleccionado.id, { mensaje: respuesta.trim(), autorNombre: autorNombre.trim() });
      setRespuesta('');
      await abrir(seleccionado.id);
      await cargar();
    } catch (err) {
      console.error('Error enviando respuesta:', err);
    } finally {
      setEnviandoRespuesta(false);
    }
  }

  async function cambiarEstado(nuevoEstado) {
    if (!seleccionado) return;
    setCambiandoEstado(true);
    try {
      const { data } = await updateTicketStatus(seleccionado.id, nuevoEstado);
      setSeleccionado((prev) => (prev ? { ...prev, estado: data?.ticket?.estado || nuevoEstado } : prev));
      await cargar();
    } catch (err) {
      console.error('Error cambiando estado:', err);
    } finally {
      setCambiandoEstado(false);
    }
  }

  const pendientesCount = useMemo(
    () => tickets.filter((t) => t.estado === 'pending').length,
    [tickets]
  );

  return (
    <div className="container" style={{ maxWidth: 1000 }}>
      <div className="header-row" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="btn" to="/admin">← Admin</Link>
          <Link className="btn" to="/index">Inicio</Link>
        </div>
        <h2 style={{ margin: 0 }}>Tickets</h2>
        <button className="btn" type="button" onClick={logout}>Cerrar Sesión</button>
      </div>

      <div style={{ display: 'flex', gap: 8, margin: '14px 0', flexWrap: 'wrap', alignItems: 'center' }}>
        {ESTADOS.map((e) => (
          <button
            key={e.key}
            type="button"
            className={estadoFiltro === e.key ? 'btn btn--brand' : 'btn'}
            onClick={() => setEstadoFiltro(e.key)}
          >
            {e.label}
            {e.key === 'pending' && pendientesCount > 0 && !estadoFiltro ? ` (${pendientesCount})` : ''}
          </button>
        ))}
        <button className="btn" type="button" onClick={cargar} disabled={cargando} style={{ marginLeft: 'auto' }}>
          {cargando ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      {error && <div style={{ color: '#b3261e', marginBottom: 10 }}>{error}</div>}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)' }}>
              <th style={{ padding: 8 }}>App</th>
              <th style={{ padding: 8 }}>Categoría</th>
              <th style={{ padding: 8 }}>Mensaje</th>
              <th style={{ padding: 8 }}>Creado por</th>
              <th style={{ padding: 8 }}>Fecha</th>
              <th style={{ padding: 8 }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr
                key={t.id}
                onClick={() => abrir(t.id)}
                style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
              >
                <td style={{ padding: 8 }}>{APP_LABEL[t.app_origen] || t.app_origen || '—'}</td>
                <td style={{ padding: 8, fontWeight: 600 }}>{t.categoria}</td>
                <td style={{ padding: 8, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.mensaje}
                </td>
                <td style={{ padding: 8 }}>{t.creado_por_username || '—'}</td>
                <td style={{ padding: 8 }}>{new Date(t.created_at).toLocaleString()}</td>
                <td style={{ padding: 8 }}>
                  <span style={{ fontWeight: 700, color: ESTADO_COLOR[t.estado] || 'var(--ink)' }}>
                    {ESTADO_LABEL[t.estado] || t.estado}
                  </span>
                </td>
              </tr>
            ))}
            {!cargando && tickets.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 16, textAlign: 'center', color: 'var(--ink-weak)' }}>
                  No hay tickets{estadoFiltro ? ' con ese estado' : ''}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <BaseModal
        open={!!seleccionado}
        onClose={() => setSeleccionado(null)}
        title={seleccionado?.categoria}
        subtitle={
          seleccionado
            ? `${APP_LABEL[seleccionado.app_origen] || seleccionado.app_origen || ''} · Creado por ${seleccionado.creado_por_username || '—'} · ${new Date(seleccionado.created_at).toLocaleString()}`
            : ''
        }
      >
        {seleccionado && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {['pending', 'in_progress', 'closed'].map((e) => (
                <button
                  key={e}
                  type="button"
                  className={seleccionado.estado === e ? 'btn btn--brand' : 'btn'}
                  disabled={cambiandoEstado}
                  onClick={() => cambiarEstado(e)}
                >
                  {ESTADO_LABEL[e]}
                </button>
              ))}
            </div>

            <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', marginBottom: 12 }}>{seleccionado.mensaje}</div>

            {(seleccionado.adjuntos || []).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {seleccionado.adjuntos.map((a, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => openTicketAttachment(a)}
                    onDoubleClick={() => downloadTicketAttachment(a)}
                    title={`${formatTicketAttachmentMeta(a)} (clic para ver, doble clic para descargar)`}
                    style={{
                      border: '1px solid var(--border)', borderRadius: 8, padding: 6,
                      background: 'transparent', cursor: 'pointer', fontSize: 12, textAlign: 'left',
                    }}
                  >
                    {isImageTicketAttachment(a) ? (
                      <img src={a.data_url} alt={a.name} style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
                    ) : (
                      <span>📎 {formatTicketAttachmentMeta(a)}</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              {(seleccionado.mensajes || []).map((m) => (
                <div key={m.id} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--ink-weak)' }}>
                    {m.autor_username || (m.es_admin ? 'Soporte' : 'Usuario')} · {new Date(m.created_at).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{m.mensaje}</div>
                </div>
              ))}
              {(!seleccionado.mensajes || seleccionado.mensajes.length === 0) && (
                <div style={{ fontSize: 13, color: 'var(--ink-weak)' }}>Todavía no hay respuestas.</div>
              )}
            </div>

            <form onSubmit={enviarRespuesta} style={{ marginTop: 10 }}>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--ink-weak)' }}>
                Respondiendo como
              </label>
              <select
                value={autorNombre}
                onChange={(e) => setAutorNombre(e.target.value)}
                style={{ width: '100%', padding: 8, marginBottom: 8, borderRadius: 8, border: '1px solid var(--border)' }}
              >
                {RESPONDIENTES.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={respuesta}
                  onChange={(e) => setRespuesta(e.target.value)}
                  placeholder="Responder..."
                  style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid var(--border)' }}
                />
                <button type="submit" className="btn btn--brand" disabled={enviandoRespuesta}>
                  {enviandoRespuesta ? 'Enviando...' : 'Enviar'}
                </button>
              </div>
            </form>
          </div>
        )}
      </BaseModal>
    </div>
  );
}

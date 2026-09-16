// pages/admin/AdminTicketsBoardPage.jsx — misma data que AdminTicketsPage.jsx
// (vista de lista/tabla) pero como tablero tipo Trello: una columna por app
// de origen + una columna "Cerrados" compartida entre todas. Arrastrar una
// tarjeta a "Cerrados" cierra el ticket; arrastrarla de vuelta a la columna
// de su propia app la reabre (a "Pendiente"). No se puede arrastrar entre
// columnas de apps distintas - el origen de un ticket no se reasigna.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { clearAdminToken, fetchAdminTickets, updateTicketStatus } from '../../src/api';
import AdminTicketDetailModal, { APP_LABEL } from '../../src/components/AdminTicketDetailModal';

const CLOSED_COL = '__closed';
const APP_ORDER = ['planificacion', 'integrador', 'presupuestador', 'remitos', 'informe-ventas', 'distribuidor'];

function primerasPalabras(texto, n = 10) {
  const palabras = String(texto || '').trim().split(/\s+/).filter(Boolean);
  if (palabras.length <= n) return palabras.join(' ');
  return `${palabras.slice(0, n).join(' ')}…`;
}

export default function AdminTicketsBoardPage() {
  const nav = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [seleccionadoId, setSeleccionadoId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  // Estado (no un ref) a propósito: necesitamos que cambiar esto dispare un
  // re-render para que las columnas inválidas se atenúen visualmente
  // mientras se arrastra (un ref no re-renderiza).
  const [draggingTicket, setDraggingTicket] = useState(null);

  const logout = () => {
    clearAdminToken();
    nav('/admin/login');
  };

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const { data } = await fetchAdminTickets({});
      setTickets(data?.tickets || []);
    } catch (err) {
      setError(err?.response?.data?.error || 'Error cargando los tickets');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  // Una columna por app que realmente tenga algún ticket (orden fijo para
  // las conocidas, el resto ordenadas alfabéticamente al final - por si se
  // suma una app nueva al ecosistema y todavía no está en APP_ORDER).
  const columnas = useMemo(() => {
    const apps = new Set(tickets.map((t) => t.app_origen).filter(Boolean));
    const conocidas = APP_ORDER.filter((a) => apps.has(a));
    const desconocidas = [...apps].filter((a) => !APP_ORDER.includes(a)).sort();
    return [...conocidas, ...desconocidas];
  }, [tickets]);

  const porColumna = useMemo(() => {
    const map = {};
    for (const app of columnas) map[app] = [];
    map[CLOSED_COL] = [];
    for (const t of tickets) {
      if (t.estado === 'closed') {
        map[CLOSED_COL].push(t);
      } else if (map[t.app_origen]) {
        map[t.app_origen].push(t);
      }
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    return map;
  }, [tickets, columnas]);

  function onDragStart(t) {
    setDraggingTicket({ id: t.id, appOrigen: t.app_origen, estado: t.estado });
  }

  function onDragEnd() {
    setDraggingTicket(null);
    setDragOverCol(null);
  }

  // A "Cerrados" se puede soltar cualquier ticket que no esté ya cerrado.
  // A la columna de una app solo se puede soltar el ticket que YA estaba
  // cerrado y es justamente de esa app (reabrir) - no se puede "mover" un
  // ticket a la columna de otra app, el origen es un dato fijo del ticket.
  function puedeSoltarEn(colKey) {
    if (!draggingTicket) return false;
    if (colKey === CLOSED_COL) return draggingTicket.estado !== 'closed';
    return draggingTicket.estado === 'closed' && colKey === draggingTicket.appOrigen;
  }

  async function onDrop(colKey) {
    const d = draggingTicket;
    setDragOverCol(null);
    if (!d || !puedeSoltarEn(colKey)) return;
    const nuevoEstado = colKey === CLOSED_COL ? 'closed' : 'pending';
    setTickets((prev) => prev.map((t) => (t.id === d.id ? { ...t, estado: nuevoEstado } : t)));
    try {
      await updateTicketStatus(d.id, nuevoEstado);
    } catch (err) {
      console.error('Error moviendo ticket:', err);
      cargar();
    }
  }

  const columnasConCerrados = [...columnas, CLOSED_COL];

  return (
    <div className="container" style={{ maxWidth: '100%' }}>
      <div className="header-row" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="btn" to="/admin">← Admin</Link>
          <Link className="btn" to="/index">Inicio</Link>
          <Link className="btn" to="/admin/tickets">Ver como lista</Link>
        </div>
        <h2 style={{ margin: 0 }}>Tickets · Tablero</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" type="button" onClick={cargar} disabled={cargando}>
            {cargando ? 'Actualizando...' : 'Actualizar'}
          </button>
          <button className="btn" type="button" onClick={logout}>Cerrar Sesión</button>
        </div>
      </div>

      {error && <div style={{ color: '#b3261e', margin: '10px 0' }}>{error}</div>}
      {cargando && tickets.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--ink-weak)', marginTop: 12 }}>Cargando...</div>
      )}

      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12, marginTop: 14 }}>
        {columnasConCerrados.map((colKey) => {
          const items = porColumna[colKey] || [];
          const esCerrados = colKey === CLOSED_COL;
          const puedeRecibir = draggingTicket ? puedeSoltarEn(colKey) : true;
          return (
            <div
              key={colKey}
              onDragOver={(e) => {
                if (puedeSoltarEn(colKey)) {
                  e.preventDefault();
                  setDragOverCol(colKey);
                }
              }}
              onDragLeave={() => setDragOverCol((c) => (c === colKey ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                onDrop(colKey);
              }}
              style={{
                minWidth: 260, width: 260, flexShrink: 0,
                background: dragOverCol === colKey ? 'var(--brand-100)' : 'var(--surface)',
                border: `1px solid ${dragOverCol === colKey ? 'var(--brand-700)' : 'var(--border)'}`,
                borderRadius: 12, display: 'flex', flexDirection: 'column', maxHeight: '75vh',
                opacity: !puedeRecibir && draggingTicket ? 0.6 : 1,
                transition: 'opacity .1s, background .1s',
              }}
            >
              <div style={{
                padding: '10px 12px', borderBottom: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: esCerrados ? 'var(--surface-2, #f1f5f9)' : 'transparent',
                borderRadius: '12px 12px 0 0',
              }}>
                <strong style={{ fontSize: 13 }}>{esCerrados ? 'Cerrados' : (APP_LABEL[colKey] || colKey)}</strong>
                <span style={{ fontSize: 11, color: 'var(--ink-weak)', fontWeight: 700 }}>{items.length}</span>
              </div>

              <div style={{ padding: 8, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--ink-weak)', textAlign: 'center', padding: '14px 0' }}>
                    Sin tickets
                  </div>
                )}
                {items.map((t) => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={() => onDragStart(t)}
                    onDragEnd={onDragEnd}
                    onClick={() => setSeleccionadoId(t.id)}
                    title={t.estado === 'in_progress' ? 'En curso · arrastrar para cambiar de columna · clic para ver todo' : 'Arrastrar para cambiar de columna · clic para ver todo'}
                    style={{
                      border: t.estado === 'in_progress' ? '2px solid #16a34a' : '1px solid var(--border)',
                      borderRadius: 8, padding: t.estado === 'in_progress' ? 7 : 8,
                      background: 'var(--surface)', cursor: 'grab',
                      boxShadow: '0 1px 2px rgba(15,23,42,.08)',
                    }}
                  >
                    {esCerrados && (
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--brand-700)', marginBottom: 3 }}>
                        {APP_LABEL[t.app_origen] || t.app_origen}
                      </div>
                    )}
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-weak)', marginBottom: 2 }}>
                      {t.categoria}
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.3 }}>{primerasPalabras(t.mensaje)}</div>
                    <div style={{ fontSize: 10, color: 'var(--ink-weak)', marginTop: 5 }}>
                      {t.creado_por_username || '—'} · {new Date(t.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <AdminTicketDetailModal
        ticketId={seleccionadoId}
        onClose={() => setSeleccionadoId(null)}
        onTicketChanged={(patch) => {
          setTickets((prev) => prev.map((t) => (t.id === patch.id ? { ...t, ...patch } : t)));
        }}
        onTicketDeleted={(id) => setTickets((prev) => prev.filter((t) => t.id !== id))}
      />
    </div>
  );
}

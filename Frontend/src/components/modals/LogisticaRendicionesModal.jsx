// src/components/modals/LogisticaRendicionesModal.jsx
//
// Auditoría de rendiciones de gastos, pedido explícito del usuario. Una
// "rendición" es el conjunto de gastos cargados por la cuadrilla en un viaje
// (ver GastosSheet en pages/DespachoV2Page.jsx) - no hay una tabla de
// rendiciones aparte, se arma agregando por viaje. Cada gasto ya viene leído
// por IA (logisticaGastosIa.js); acá se resalta en rojo lo que la IA no
// pudo confirmar (estado_revision='revisar'), y solo se puede aprobar la
// rendición completa cuando el viaje ya fue "finalizado" por la cuadrilla.
import React, { useEffect, useState } from 'react';
import { fetchLogisticaRendiciones, fetchLogisticaRendicionDetalle, aprobarLogisticaRendicion } from '../../api';

const th = { textAlign: 'left', padding: 10, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
const td = { padding: 10, borderBottom: '1px solid var(--border)', verticalAlign: 'top' };

function fechaLegible(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
function fechaHoraLegible(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.toLocaleDateString('es-AR')} ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
}
function montoLegible(n) {
  return Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 });
}

function GastoRowAdmin({ g }) {
  const revisar = g.estado_revision === 'revisar';
  return (
    <tr style={revisar ? { background: '#fef2f2' } : undefined}>
      <td style={td}>
        {revisar && (g.campos_inciertos || []).includes('fecha') ? <span style={{ color: '#dc2626', fontWeight: 800 }}>⚠️ </span> : null}
        {fechaLegible(g.fecha)}
      </td>
      <td style={td}>
        {revisar && (g.campos_inciertos || []).includes('motivo') ? <span style={{ color: '#dc2626', fontWeight: 800 }}>⚠️ </span> : null}
        {g.motivo}
      </td>
      <td style={td}>
        {revisar && (g.campos_inciertos || []).includes('monto') ? <span style={{ color: '#dc2626', fontWeight: 800 }}>⚠️ </span> : null}
        ${montoLegible(g.monto)}
      </td>
      <td style={td}>{g.tipo_comprobante || '—'}{g.medio_pago ? ` · ${g.medio_pago}` : ''}</td>
      <td style={td}>{g.cargado_por || '—'}</td>
      <td style={td}>
        <a href={g.url} target="_blank" rel="noopener noreferrer">
          {String(g.tipo_mime || '').startsWith('image/') ? '🖼️ Ver' : '📄 Ver'}
        </a>
      </td>
    </tr>
  );
}

function RendicionDetalle({ viajeId, onVolver, onAprobado }) {
  const [detalle, setDetalle] = useState(null);
  const [err, setErr] = useState('');
  const [aprobando, setAprobando] = useState(false);

  const cargar = () => {
    setErr('');
    fetchLogisticaRendicionDetalle(viajeId)
      .then((d) => setDetalle(d?.detalle || null))
      .catch((e) => setErr(e?.response?.data?.error || e.message));
  };
  useEffect(() => { setDetalle(null); cargar(); }, [viajeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const aprobar = async () => {
    setAprobando(true);
    setErr('');
    try {
      await aprobarLogisticaRendicion(viajeId);
      cargar();
      onAprobado?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setAprobando(false);
    }
  };

  const gastosARevisar = (detalle?.gastos || []).filter((g) => g.estado_revision === 'revisar').length;

  return (
    <div>
      <button className="btn" style={{ marginBottom: 10 }} onClick={onVolver}>← Volver a rendiciones</button>
      {err ? <div style={{ color: 'crimson', fontWeight: 800, fontSize: 12, marginBottom: 8 }}>{err}</div> : null}
      {!detalle ? (
        <div style={{ opacity: 0.7 }}>Cargando…</div>
      ) : (
        <>
          <div style={{ fontWeight: 900, fontSize: 15, marginBottom: 4 }}>{detalle.viaje_nombre || `Viaje #${detalle.viaje_id}`}</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
            {fechaLegible(detalle.viaje_fecha)} · {detalle.cuadrilla_nombre || 'sin cuadrilla'}
          </div>
          <div style={{ fontSize: 12, marginBottom: 12 }}>
            {detalle.hora_llegada_real ? (
              <span style={{ color: '#16a34a', fontWeight: 700 }}>✅ Viaje finalizado ({fechaHoraLegible(detalle.hora_llegada_real)})</span>
            ) : (
              <span style={{ color: '#b45309', fontWeight: 700 }}>⏳ La cuadrilla todavía no finalizó el viaje</span>
            )}
          </div>

          {gastosARevisar > 0 ? (
            <div style={{ fontSize: 12, color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 8, marginBottom: 10 }}>
              ⚠️ {gastosARevisar} gasto{gastosARevisar === 1 ? '' : 's'} con algo que la IA no pudo confirmar - resaltado{gastosARevisar === 1 ? '' : 's'} en rojo abajo.
            </div>
          ) : null}

          {detalle.fondo_efectivo != null ? (
            <div style={{ fontSize: 12, background: 'var(--surface-muted, #f9fafb)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 10, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div><b>Fondo entregado:</b> ${montoLegible(detalle.fondo_efectivo)}</div>
              <div><b>Gastado en efectivo:</b> ${montoLegible(detalle.total_efectivo)} <span style={{ opacity: 0.6 }}>(provisorio, según lo que leyó la IA del ticket - falta confirmar contra el email de la tarjeta)</span></div>
              <div style={{ fontWeight: 800, color: detalle.saldo_a_devolver < 0 ? '#dc2626' : '#16a34a' }}>
                {detalle.saldo_a_devolver < 0
                  ? `Faltan $${montoLegible(Math.abs(detalle.saldo_a_devolver))} (gastó más que el fondo)`
                  : `A devolver a administración: $${montoLegible(detalle.saldo_a_devolver)}`}
              </div>
            </div>
          ) : null}

          <div style={{ overflow: 'auto', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--surface-muted, #f9fafb)' }}>
                  <th style={th}>Fecha</th>
                  <th style={th}>Motivo</th>
                  <th style={th}>Monto</th>
                  <th style={th}>Comprobante</th>
                  <th style={th}>Cargado por</th>
                  <th style={th}>Ticket</th>
                </tr>
              </thead>
              <tbody>
                {(detalle.gastos || []).map((g) => <GastoRowAdmin key={g.id} g={g} />)}
                {(detalle.gastos || []).length === 0 ? (
                  <tr><td style={{ ...td, color: '#6b7280' }} colSpan={6}>Sin gastos cargados.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div style={{ textAlign: 'right', fontWeight: 900, fontSize: 16, marginBottom: 14 }}>
            Total: ${montoLegible(detalle.total)}
          </div>

          {detalle.rendicion_aprobada_at ? (
            <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 800, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 10 }}>
              ✅ Rendición aprobada por {detalle.rendicion_aprobada_por || 'logística'} el {fechaHoraLegible(detalle.rendicion_aprobada_at)}
            </div>
          ) : (
            <button
              className="btn btn--brand" style={{ width: '100%' }}
              disabled={aprobando || !detalle.hora_llegada_real}
              title={!detalle.hora_llegada_real ? 'La cuadrilla tiene que finalizar el viaje antes de poder aprobar la rendición' : undefined}
              onClick={aprobar}
            >
              {aprobando ? 'Aprobando…' : !detalle.hora_llegada_real ? '🔒 Esperando que se finalice el viaje' : '✅ Aprobar rendición'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default function LogisticaRendicionesModal({ open, onClose }) {
  const [rendiciones, setRendiciones] = useState(null);
  const [err, setErr] = useState('');
  const [viajeAbierto, setViajeAbierto] = useState(null);

  const cargar = () => {
    setErr('');
    fetchLogisticaRendiciones()
      .then((d) => setRendiciones(d?.rendiciones || []))
      .catch((e) => setErr(e?.response?.data?.error || e.message));
  };

  useEffect(() => {
    if (!open) return;
    setViajeAbierto(null);
    setRendiciones(null);
    cargar();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div style={{ width: 'min(820px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.18)', padding: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 900 }}>💰 Rendiciones de gastos</div>
          <button className="btn" style={{ marginLeft: 'auto' }} onClick={onClose}>Cerrar</button>
        </div>

        {err ? <div style={{ color: 'crimson', fontWeight: 800, fontSize: 12, marginBottom: 8 }}>{err}</div> : null}

        {viajeAbierto != null ? (
          <RendicionDetalle viajeId={viajeAbierto} onVolver={() => setViajeAbierto(null)} onAprobado={cargar} />
        ) : (
          <div style={{ overflow: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--surface-muted, #f9fafb)' }}>
                  <th style={th}>Viaje</th>
                  <th style={th}>Fecha</th>
                  <th style={th}>Cuadrilla</th>
                  <th style={th}>Gastos</th>
                  <th style={th}>Total</th>
                  <th style={th}>A devolver</th>
                  <th style={th}>Estado</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {rendiciones == null ? (
                  <tr><td style={{ ...td, color: '#6b7280' }} colSpan={8}>Cargando…</td></tr>
                ) : rendiciones.length === 0 ? (
                  <tr><td style={{ ...td, color: '#6b7280' }} colSpan={8}>No hay rendiciones cargadas todavía.</td></tr>
                ) : (
                  rendiciones.map((r) => (
                    <tr key={r.viaje_id}>
                      <td style={td}>{r.viaje_nombre || `Viaje #${r.viaje_id}`}</td>
                      <td style={td}>{fechaLegible(r.viaje_fecha)}</td>
                      <td style={td}>{r.cuadrilla_nombre || '—'}</td>
                      <td style={td}>{r.cantidad_gastos}</td>
                      <td style={td}>${montoLegible(r.total)}</td>
                      <td style={td}>
                        {r.saldo_a_devolver != null ? (
                          <span style={{ fontWeight: 700, color: r.saldo_a_devolver < 0 ? '#dc2626' : 'inherit' }}>
                            ${montoLegible(Math.abs(r.saldo_a_devolver))}{r.saldo_a_devolver < 0 ? ' (faltante)' : ''}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={td}>
                        {r.rendicion_aprobada_at ? (
                          <span style={{ color: '#16a34a', fontWeight: 700, fontSize: 11 }}>✅ Aprobada</span>
                        ) : r.cantidad_a_revisar > 0 ? (
                          <span style={{ color: '#dc2626', fontWeight: 700, fontSize: 11 }}>⚠️ {r.cantidad_a_revisar} a revisar</span>
                        ) : !r.hora_llegada_real ? (
                          <span style={{ color: '#b45309', fontWeight: 700, fontSize: 11 }}>⏳ Viaje en curso</span>
                        ) : (
                          <span style={{ opacity: 0.7, fontSize: 11 }}>Lista para aprobar</span>
                        )}
                      </td>
                      <td style={td}>
                        <button className="btn" onClick={() => setViajeAbierto(r.viaje_id)}>Ver</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

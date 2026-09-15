// src/components/modals/LogisticaRendicionesModal.jsx
//
// Consulta de rendiciones de gastos, pedido explícito del usuario. Una
// "rendición" es el conjunto de gastos cargados por la cuadrilla en un
// viaje (ver GastosSheet en pages/DespachoV2Page.jsx) - no hay una tabla de
// rendiciones aparte, se arma agregando por viaje. Por ahora solo consulta
// (tabla de rendiciones -> detalle con gastos/tickets/total); la auditoría
// ("ya fue controlada", con nexo a otra app) queda para una vuelta futura,
// pedido explícito del usuario.
import React, { useEffect, useState } from 'react';
import { fetchLogisticaRendiciones, fetchLogisticaRendicionDetalle } from '../../api';

const th = { textAlign: 'left', padding: 10, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
const td = { padding: 10, borderBottom: '1px solid var(--border)', verticalAlign: 'top' };

function fechaLegible(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
function montoLegible(n) {
  return Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 });
}

function RendicionDetalle({ viajeId, onVolver }) {
  const [detalle, setDetalle] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setDetalle(null);
    setErr('');
    fetchLogisticaRendicionDetalle(viajeId)
      .then((d) => setDetalle(d?.detalle || null))
      .catch((e) => setErr(e?.response?.data?.error || e.message));
  }, [viajeId]);

  return (
    <div>
      <button className="btn" style={{ marginBottom: 10 }} onClick={onVolver}>← Volver a rendiciones</button>
      {err ? <div style={{ color: 'crimson', fontWeight: 800, fontSize: 12, marginBottom: 8 }}>{err}</div> : null}
      {!detalle ? (
        <div style={{ opacity: 0.7 }}>Cargando…</div>
      ) : (
        <>
          <div style={{ fontWeight: 900, fontSize: 15, marginBottom: 4 }}>{detalle.viaje_nombre || `Viaje #${detalle.viaje_id}`}</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 12 }}>
            {fechaLegible(detalle.viaje_fecha)} · {detalle.cuadrilla_nombre || 'sin cuadrilla'}
          </div>
          <div style={{ overflow: 'auto', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--surface-muted, #f9fafb)' }}>
                  <th style={th}>Fecha</th>
                  <th style={th}>Motivo</th>
                  <th style={th}>Monto</th>
                  <th style={th}>Cargado por</th>
                  <th style={th}>Ticket</th>
                </tr>
              </thead>
              <tbody>
                {(detalle.gastos || []).map((g) => (
                  <tr key={g.id}>
                    <td style={td}>{fechaLegible(g.fecha)}</td>
                    <td style={td}>{g.motivo}</td>
                    <td style={td}>${montoLegible(g.monto)}</td>
                    <td style={td}>{g.cargado_por || '—'}</td>
                    <td style={td}>
                      <a href={g.url} target="_blank" rel="noopener noreferrer">
                        {String(g.tipo_mime || '').startsWith('image/') ? '🖼️ Ver' : '📄 Ver'}
                      </a>
                    </td>
                  </tr>
                ))}
                {(detalle.gastos || []).length === 0 ? (
                  <tr><td style={{ ...td, color: '#6b7280' }} colSpan={5}>Sin gastos cargados.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div style={{ textAlign: 'right', fontWeight: 900, fontSize: 16 }}>
            Total: ${montoLegible(detalle.total)}
          </div>
        </>
      )}
    </div>
  );
}

export default function LogisticaRendicionesModal({ open, onClose }) {
  const [rendiciones, setRendiciones] = useState(null);
  const [err, setErr] = useState('');
  const [viajeAbierto, setViajeAbierto] = useState(null);

  useEffect(() => {
    if (!open) return;
    setViajeAbierto(null);
    setErr('');
    setRendiciones(null);
    fetchLogisticaRendiciones()
      .then((d) => setRendiciones(d?.rendiciones || []))
      .catch((e) => setErr(e?.response?.data?.error || e.message));
  }, [open]);

  if (!open) return null;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div style={{ width: 'min(780px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.18)', padding: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 900 }}>💰 Rendiciones de gastos</div>
          <button className="btn" style={{ marginLeft: 'auto' }} onClick={onClose}>Cerrar</button>
        </div>

        {err ? <div style={{ color: 'crimson', fontWeight: 800, fontSize: 12, marginBottom: 8 }}>{err}</div> : null}

        {viajeAbierto != null ? (
          <RendicionDetalle viajeId={viajeAbierto} onVolver={() => setViajeAbierto(null)} />
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
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {rendiciones == null ? (
                  <tr><td style={{ ...td, color: '#6b7280' }} colSpan={6}>Cargando…</td></tr>
                ) : rendiciones.length === 0 ? (
                  <tr><td style={{ ...td, color: '#6b7280' }} colSpan={6}>No hay rendiciones cargadas todavía.</td></tr>
                ) : (
                  rendiciones.map((r) => (
                    <tr key={r.viaje_id}>
                      <td style={td}>{r.viaje_nombre || `Viaje #${r.viaje_id}`}</td>
                      <td style={td}>{fechaLegible(r.viaje_fecha)}</td>
                      <td style={td}>{r.cuadrilla_nombre || '—'}</td>
                      <td style={td}>{r.cantidad_gastos}</td>
                      <td style={td}>${montoLegible(r.total)}</td>
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

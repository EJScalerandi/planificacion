// src/components/modals/ServicioTecnicoSolicitudDetalleModal.jsx
//
// Detalle de una solicitud de Servicio Técnico: datos del cliente/portón
// (autocompletados si hay NV, o cargados a mano por Diego) + dos historiales
// separados (admin / técnico) - cada uno con su propio hilo de notas.
// Fotos: todavía no hay mecanismo de subida armado (el proyecto no tiene
// storage de archivos configurado) - queda pendiente para una fase
// siguiente; por ahora el historial es solo texto.
import React, { useEffect, useState } from 'react';
import { fetchStSolicitud, updateStSolicitud, agregarStHistorial } from '../../api';
import { formatDMY } from '../../utils/isoWeek';

const ESTADOS = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'planificado', label: 'Planificado' },
  { value: 'en_viaje', label: 'En viaje' },
  { value: 'resuelto', label: 'Resuelto' },
  { value: 'cancelado', label: 'Cancelado' },
];

function HistorialColumn({ titulo, tipo, entradas, onAgregar, busy }) {
  const [texto, setTexto] = useState('');
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 10, padding: 8, minHeight: 220 }}>
      <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 6 }}>{titulo}</div>
      <div style={{ flex: '1 1 auto', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
        {entradas.length === 0 ? <div style={{ fontSize: 11, opacity: 0.6 }}>Sin entradas todavía.</div> : null}
        {entradas.map((e) => (
          <div key={e.id} style={{ fontSize: 11, background: 'var(--surface-muted, #f9fafb)', borderRadius: 8, padding: 6 }}>
            <div style={{ opacity: 0.6, marginBottom: 2 }}>{e.autor || '—'} · {formatDMY(e.created_at?.slice(0, 10))}</div>
            <div>{e.texto}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          className="pp-input" style={{ flex: 1, fontSize: 11 }} placeholder="Agregar nota…" value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && texto.trim()) { onAgregar(tipo, texto.trim()); setTexto(''); } }}
        />
        <button
          className="btn" style={{ fontSize: 11, padding: '3px 8px' }} disabled={busy || !texto.trim()}
          onClick={() => { onAgregar(tipo, texto.trim()); setTexto(''); }}
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function ServicioTecnicoSolicitudDetalleModal({ open, solicitudId, onClose, onChanged }) {
  const [solicitud, setSolicitud] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const reload = () => {
    if (!solicitudId) return;
    setLoading(true);
    fetchStSolicitud(solicitudId)
      .then((data) => setSolicitud(data?.solicitud || null))
      .catch((e) => setErr(e?.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!open) return;
    setErr('');
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, solicitudId]);

  if (!open) return null;

  const cambiarEstado = async (estado) => {
    setBusy(true);
    setErr('');
    try {
      await updateStSolicitud(solicitudId, { estado });
      reload();
      onChanged?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const agregarNota = async (tipo, texto) => {
    setBusy(true);
    setErr('');
    try {
      await agregarStHistorial(solicitudId, { tipo, texto });
      reload();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const historialAdmin = (solicitud?.historial || []).filter((h) => h.tipo === 'admin');
  const historialTecnico = (solicitud?.historial || []).filter((h) => h.tipo === 'tecnico');

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div style={{ width: 'min(820px, 100%)', maxHeight: '92vh', overflowY: 'auto', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.18)', padding: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 900 }}>Solicitud de Servicio Técnico {solicitud?.nv ? `· NV ${solicitud.nv}` : ''}</div>
          <button className="btn" style={{ marginLeft: 'auto' }} onClick={onClose}>Cerrar</button>
        </div>

        {err ? <div style={{ color: 'crimson', fontWeight: 800, fontSize: 12, marginBottom: 8 }}>{err}</div> : null}

        {loading || !solicitud ? (
          <div style={{ opacity: 0.75, fontSize: 13 }}>Cargando…</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, marginBottom: 10, border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
              <div><b>Cliente:</b> {solicitud.nombre_cliente || '—'}</div>
              <div><b>Distribuidor:</b> {solicitud.distribuidor || '—'}</div>
              <div><b>Dirección:</b> {solicitud.direccion || '—'}</div>
              <div><b>Teléfono:</b> {solicitud.telefono || '—'}</div>
              <div><b>Fecha de venta:</b> {solicitud.fecha_venta ? formatDMY(solicitud.fecha_venta) : '—'}</div>
              <div>
                <b>Mapa:</b>{' '}
                {solicitud.maps_url ? <a href={solicitud.maps_url} target="_blank" rel="noopener noreferrer">Abrir →</a> : <span style={{ color: '#b45309' }}>Sin URL cargada</span>}
              </div>
              <div style={{ gridColumn: '1 / -1' }}><b>Descripción:</b> {solicitud.descripcion}</div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8 }}>
                <b>Estado:</b>
                <select className="pp-select" value={solicitud.estado} disabled={busy} onChange={(e) => cambiarEstado(e.target.value)}>
                  {ESTADOS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <HistorialColumn titulo="📋 Historial admin" tipo="admin" entradas={historialAdmin} onAgregar={agregarNota} busy={busy} />
              <HistorialColumn titulo="🔧 Historial técnico" tipo="tecnico" entradas={historialTecnico} onAgregar={agregarNota} busy={busy} />
            </div>

            <div style={{ fontSize: 10, opacity: 0.55, marginTop: 10 }}>
              Adjuntar fotos todavía no está disponible - lo sumamos en una próxima vuelta.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

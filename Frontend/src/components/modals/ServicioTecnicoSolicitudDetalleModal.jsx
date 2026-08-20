// src/components/modals/ServicioTecnicoSolicitudDetalleModal.jsx
//
// Detalle de una solicitud de Servicio Técnico: datos del cliente/portón
// (autocompletados si hay NV, o cargados a mano por Diego) + dos historiales
// separados (admin / técnico) - cada uno con su propio hilo de notas, con un
// adjunto opcional (imagen/PDF/video). Mismo mecanismo que ya usa el
// Presupuestador para los tickets: el archivo se manda como base64 (data
// URL) y se guarda en una columna jsonb - sin storage externo.
import React, { useEffect, useRef, useState } from 'react';
import { fetchStSolicitud, updateStSolicitud, agregarStHistorial } from '../../api';
import { formatDMY } from '../../utils/isoWeek';

const ESTADOS = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'planificado', label: 'Planificado' },
  { value: 'en_viaje', label: 'En viaje' },
  { value: 'resuelto', label: 'Resuelto' },
  { value: 'cancelado', label: 'Cancelado' },
];

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_BYTES = 5 * 1024 * 1024;
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', ...VIDEO_TYPES]);

function fileToAttachment(file) {
  return new Promise((resolve, reject) => {
    if (!ALLOWED_TYPES.has(file.type)) { reject(new Error('El adjunto debe ser una imagen, un PDF o un video.')); return; }
    const maxBytes = VIDEO_TYPES.has(file.type) ? MAX_VIDEO_BYTES : MAX_BYTES;
    if (file.size > maxBytes) { reject(new Error(`El archivo excede el tamaño permitido (máximo ${Math.round(maxBytes / (1024 * 1024))}MB).`)); return; }
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, data_url: String(reader.result || ''), uploaded_at: new Date().toISOString() });
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

function AttachmentPreview({ attachment }) {
  if (!attachment) return null;
  if (attachment.type?.startsWith('image/')) {
    return <img src={attachment.data_url} alt={attachment.name} style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 6, marginTop: 4, display: 'block' }} />;
  }
  return (
    <a href={attachment.data_url} download={attachment.name} style={{ fontSize: 10, display: 'block', marginTop: 4 }}>
      📎 {attachment.name}
    </a>
  );
}

function HistorialColumn({ titulo, tipo, entradas, onAgregar, busy }) {
  const [texto, setTexto] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [archivoErr, setArchivoErr] = useState('');
  const fileRef = useRef(null);

  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setArchivoErr('');
    try {
      setArchivo(await fileToAttachment(file));
    } catch (err) {
      setArchivoErr(err.message);
      setArchivo(null);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const enviar = async () => {
    if (!texto.trim()) return;
    await onAgregar(tipo, texto.trim(), archivo);
    setTexto('');
    setArchivo(null);
  };

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 10, padding: 8, minHeight: 260 }}>
      <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 6 }}>{titulo}</div>
      <div style={{ flex: '1 1 auto', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
        {entradas.length === 0 ? <div style={{ fontSize: 11, opacity: 0.6 }}>Sin entradas todavía.</div> : null}
        {entradas.map((e) => (
          <div key={e.id} style={{ fontSize: 11, background: 'var(--surface-muted, #f9fafb)', borderRadius: 8, padding: 6 }}>
            <div style={{ opacity: 0.6, marginBottom: 2 }}>{e.autor || '—'} · {formatDMY(e.created_at?.slice(0, 10))}</div>
            <div>{e.texto}</div>
            <AttachmentPreview attachment={e.attachment} />
          </div>
        ))}
      </div>
      {archivoErr ? <div style={{ color: 'crimson', fontSize: 10, marginBottom: 4 }}>{archivoErr}</div> : null}
      {archivo ? (
        <div style={{ fontSize: 10, opacity: 0.75, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          📎 {archivo.name}
          <button type="button" onClick={() => setArchivo(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#991b1b', fontWeight: 900 }}>×</button>
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          className="pp-input" style={{ flex: 1, fontSize: 11 }} placeholder="Agregar nota…" value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && texto.trim()) enviar(); }}
        />
        <input ref={fileRef} type="file" accept="image/*,application/pdf,video/mp4,video/quicktime,video/webm" style={{ display: 'none' }} onChange={onPickFile} />
        <button className="btn" type="button" style={{ fontSize: 11, padding: '3px 7px' }} title="Adjuntar archivo" onClick={() => fileRef.current?.click()}>📎</button>
        <button
          className="btn" style={{ fontSize: 11, padding: '3px 8px' }} disabled={busy || !texto.trim()}
          onClick={enviar}
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

  const agregarNota = async (tipo, texto, attachment) => {
    setBusy(true);
    setErr('');
    try {
      await agregarStHistorial(solicitudId, { tipo, texto, attachment: attachment || undefined });
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
          </>
        )}
      </div>
    </div>
  );
}

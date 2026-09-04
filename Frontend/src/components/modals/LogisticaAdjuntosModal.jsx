// src/components/modals/LogisticaAdjuntosModal.jsx
//
// Adjuntos de Logística (DNI, certificado de reincidencia que piden algunos
// countrys, etc.) - pedido explícito del usuario: "a las rutas y/o los
// portones". Modal genérico, reutilizable: se abre con viajeId (adjuntos del
// viaje entero, ej. un manifiesto) o con nv (adjuntos de ese portón puntual,
// ej. el DNI de quien recibe) - nunca los dos a la vez desde donde se llama
// hoy, pero el backend soporta cualquiera de los dos.
import React, { useEffect, useRef, useState } from 'react';
import {
  fetchLogisticaAdjuntos, uploadLogisticaAdjunto, deleteLogisticaAdjunto,
  fetchLogisticaAdjuntosMiembroPorCuadrilla, habilitarLogisticaAdjuntoMiembro,
} from '../../api';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,application/pdf';

function tamanoLegible(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fechaLegible(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function esImagen(mime) {
  return String(mime || '').startsWith('image/');
}

export default function LogisticaAdjuntosModal({ open, onClose, viajeId, nv, titulo, canEdit, cuadrillaId }) {
  const [adjuntos, setAdjuntos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [descripcion, setDescripcion] = useState('');
  const [borrandoId, setBorrandoId] = useState(null);
  const fileInputRef = useRef(null);

  // DNI ya cargados en el catálogo de la cuadrilla (LogisticaCuadrillasModal)
  // - se pueden "habilitar" acá sin volver a subirlos. Solo tiene sentido si
  // sabemos de qué cuadrilla es (viene del viaje que abrió este modal).
  const [miembros, setMiembros] = useState(null);
  const [habilitandoId, setHabilitandoId] = useState(null);

  const load = () => {
    if (!open || (viajeId == null && nv == null)) return;
    setErr('');
    setLoading(true);
    fetchLogisticaAdjuntos({ viajeId, nv })
      .then((data) => setAdjuntos(data?.adjuntos || []))
      .catch((e) => setErr(e?.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open) { load(); setDescripcion(''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, viajeId, nv]);

  useEffect(() => {
    if (open && cuadrillaId != null) {
      fetchLogisticaAdjuntosMiembroPorCuadrilla(cuadrillaId).then((d) => setMiembros(d?.miembros || [])).catch(() => setMiembros([]));
    } else {
      setMiembros(null);
    }
  }, [open, cuadrillaId]);

  if (!open) return null;

  const elegirArchivo = () => fileInputRef.current?.click();

  const onArchivoElegido = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo después
    if (!archivo) return;
    setSubiendo(true);
    setErr('');
    try {
      await uploadLogisticaAdjunto({ viajeId, nv, descripcion: descripcion.trim() || null, archivo });
      setDescripcion('');
      load();
    } catch (e2) {
      setErr(e2?.response?.data?.error || e2.message);
    } finally {
      setSubiendo(false);
    }
  };

  const habilitar = async (origenMiembroId) => {
    setHabilitandoId(origenMiembroId);
    setErr('');
    try {
      await habilitarLogisticaAdjuntoMiembro({ origen_miembro_id: origenMiembroId, viaje_id: viajeId, nv });
      load();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setHabilitandoId(null);
    }
  };

  const borrar = async (adjunto) => {
    if (!window.confirm(`¿Borrar "${adjunto.nombre_archivo}"? No se puede deshacer.`)) return;
    setBorrandoId(adjunto.id);
    setErr('');
    try {
      await deleteLogisticaAdjunto(adjunto.id);
      setAdjuntos((prev) => prev.filter((a) => a.id !== adjunto.id));
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setBorrandoId(null);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div style={{ width: 'min(520px, 100%)', maxHeight: '85vh', display: 'flex', flexDirection: 'column', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.25)', padding: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 900 }}>📎 Adjuntos{titulo ? ` · ${titulo}` : ''}</div>
          <button className="btn" style={{ marginLeft: 'auto' }} onClick={onClose}>Cerrar</button>
        </div>

        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 8 }}>
          Fotos o PDF (DNI, certificado de reincidencia que piden algunos countrys, etc.) - hasta 15 MB c/u.
        </div>

        {err ? <div style={{ color: 'crimson', fontWeight: 800, fontSize: 12, marginBottom: 8 }}>{err}</div> : null}

        <div style={{ flex: '1 1 auto', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
          {loading ? (
            <div style={{ opacity: 0.75, fontSize: 13 }}>Cargando…</div>
          ) : adjuntos.length === 0 ? (
            <div style={{ fontSize: 12, opacity: 0.6, padding: 8 }}>Todavía no hay adjuntos.</div>
          ) : (
            adjuntos.map((a) => (
              <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center', border: '1px solid var(--border)', borderRadius: 10, padding: 8 }}>
                <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ flex: '0 0 auto', display: 'block' }} title="Abrir">
                  {esImagen(a.tipo_mime) ? (
                    <img src={a.url} alt={a.nombre_archivo} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
                  ) : (
                    <div style={{ width: 48, height: 48, borderRadius: 6, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>📄</div>
                  )}
                </a>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                    {a.nombre_archivo}
                  </a>
                  {a.descripcion ? <div style={{ fontSize: 11, opacity: 0.8 }}>{a.descripcion}</div> : null}
                  <div style={{ fontSize: 10, opacity: 0.6 }}>
                    {tamanoLegible(a.tamano_bytes)} · {fechaLegible(a.created_at)}{a.subido_por ? ` · ${a.subido_por}` : ''}
                  </div>
                </div>
                {canEdit ? (
                  <button
                    type="button" className="btn" style={{ padding: '3px 8px', fontSize: 11, borderColor: '#ef4444', color: '#991b1b', flex: '0 0 auto' }}
                    disabled={borrandoId === a.id}
                    onClick={() => borrar(a)}
                  >
                    {borrandoId === a.id ? '…' : '🗑️'}
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>

        {canEdit && miembros?.some((m) => m.adjuntos?.length) ? (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginBottom: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 6 }}>📇 DNI de la cuadrilla</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {miembros.filter((m) => m.adjuntos?.length).map((m) => (
                <div key={m.qc_user_id} style={{ fontSize: 11 }}>
                  <div style={{ fontWeight: 700, marginBottom: 2 }}>{m.qc_user_name}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {m.adjuntos.map((a) => {
                      const yaHabilitado = adjuntos.some((x) => x.origen_miembro_id === a.id);
                      return (
                        <button
                          key={a.id} type="button" className="btn" disabled={yaHabilitado || habilitandoId === a.id}
                          style={{ fontSize: 10, padding: '3px 8px', ...(yaHabilitado ? { opacity: 0.6 } : {}) }}
                          onClick={() => habilitar(a.id)}
                        >
                          {yaHabilitado ? '✓ ' : '+ '}{a.nombre_archivo}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {canEdit ? (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input
              className="pp-input" style={{ fontSize: 12 }}
              placeholder="Descripción (opcional, ej: DNI de Juan Pérez)"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
            <input ref={fileInputRef} type="file" accept={ACCEPT} style={{ display: 'none' }} onChange={onArchivoElegido} />
            <button type="button" className="btn btn--brand" disabled={subiendo} onClick={elegirArchivo}>
              {subiendo ? 'Subiendo…' : '📎 Elegir foto o PDF'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// src/components/modals/LogisticaZonasModal.jsx
//
// ABM de zonas (Zona Sur, Zona Bs As, etc.) usadas al crear un viaje. Guardado
// en backend (public.logistica_zonas), no localStorage: lo usa todo el equipo
// de logística, no solo quien lo configuró.
//
// Cada zona además tiene "referencias" (localidades geocodificadas, ej. Zona
// Sur 1 = Rosario + Bs As) para la clasificación determinística de portones
// por ubicación (Fase 0 del motor de logística IA, ver
// server/lib/logisticaZonificacion.js): un portón se asigna a la zona cuya
// referencia esté más cerca. Solo se pide el nombre de la localidad — el
// backend la geocodifica vía Nominatim (mismo mecanismo que ya resuelve
// direcciones del Presupuestador).
import React, { useEffect, useState } from 'react';
import {
  createLogisticaZona, updateLogisticaZona, deleteLogisticaZona,
  createLogisticaZonaReferencia, deleteLogisticaZonaReferencia,
} from '../../api';

const th = { textAlign: 'left', padding: 10, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
const td = { padding: 10, borderBottom: '1px solid var(--border)', verticalAlign: 'top' };

export default function LogisticaZonasModal({ open, config, onClose, onChanged }) {
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [refInputs, setRefInputs] = useState({}); // { [zonaId]: texto en el input de nueva localidad }

  useEffect(() => {
    if (open) { setNuevoNombre(''); setErr(''); setRefInputs({}); }
  }, [open]);

  if (!open) return null;

  const zonas = config?.zonas || [];
  const referencias = config?.zona_referencias || [];

  const agregar = async () => {
    const nombre = nuevoNombre.trim();
    if (!nombre) return;
    setBusy(true);
    setErr('');
    try {
      await createLogisticaZona({ nombre });
      setNuevoNombre('');
      await onChanged?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleActivo = async (z) => {
    setBusy(true);
    setErr('');
    try {
      await updateLogisticaZona(z.id, { activo: !z.activo });
      await onChanged?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const borrar = async (z) => {
    if (!window.confirm(`¿Borrar la zona "${z.nombre}"? También se borran sus localidades de referencia.`)) return;
    setBusy(true);
    setErr('');
    try {
      await deleteLogisticaZona(z.id);
      await onChanged?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const agregarReferencia = async (zonaId) => {
    const nombre = (refInputs[zonaId] || '').trim();
    if (!nombre) return;
    setBusy(true);
    setErr('');
    try {
      await createLogisticaZonaReferencia({ zona_id: zonaId, nombre });
      setRefInputs((s) => ({ ...s, [zonaId]: '' }));
      await onChanged?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const borrarReferencia = async (r) => {
    setBusy(true);
    setErr('');
    try {
      await deleteLogisticaZonaReferencia(r.id);
      await onChanged?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div style={{ width: 'min(720px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.18)', padding: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 900 }}>Zonas</div>
          <button className="btn" style={{ marginLeft: 'auto' }} onClick={onClose}>Cerrar</button>
        </div>

        <div style={{ fontSize: 12, color: 'var(--muted, #6b7280)', marginBottom: 10 }}>
          Cada zona puede tener una o más localidades de referencia (ej. Zona Sur 1 = Rosario + Bs As): un
          portón se clasifica automáticamente en la zona cuya localidad de referencia le queda más cerca.
        </div>

        {err ? <div style={{ color: 'crimson', fontWeight: 800, fontSize: 12, marginBottom: 8 }}>{err}</div> : null}

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            className="pp-input" style={{ flex: 1 }} placeholder="Ej: Zona Sur" value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') agregar(); }}
          />
          <button className="btn btn--brand" disabled={busy || !nuevoNombre.trim()} onClick={agregar}>Agregar</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {zonas.map((z) => {
            const refsDeZona = referencias.filter((r) => r.zona_id === z.id);
            return (
              <div key={z.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontWeight: 800 }}>{z.nombre}</div>
                  <button className="btn" style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 11 }} disabled={busy} onClick={() => toggleActivo(z)}>
                    {z.activo ? 'Activa' : 'Inactiva'}
                  </button>
                  <button className="btn" style={{ padding: '2px 8px', fontSize: 11, borderColor: '#ef4444', color: '#991b1b' }} disabled={busy} onClick={() => borrar(z)}>
                    Borrar zona
                  </button>
                </div>

                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {refsDeZona.map((r) => (
                    <span
                      key={r.id}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '3px 8px', borderRadius: 999, background: 'var(--surface-muted, #f3f4f6)', border: '1px solid var(--border)' }}
                    >
                      📍 {r.nombre}
                      <button
                        type="button" disabled={busy} onClick={() => borrarReferencia(r)}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#991b1b', fontWeight: 900, padding: 0, lineHeight: 1 }}
                        title="Quitar localidad"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {refsDeZona.length === 0 ? (
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>Sin localidades de referencia todavía.</span>
                  ) : null}
                </div>

                <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                  <input
                    className="pp-input" style={{ flex: 1, fontSize: 12 }} placeholder="Agregar localidad (ej: Rosario, Santa Fe)"
                    value={refInputs[z.id] || ''}
                    onChange={(e) => setRefInputs((s) => ({ ...s, [z.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') agregarReferencia(z.id); }}
                  />
                  <button className="btn" style={{ fontSize: 12 }} disabled={busy || !(refInputs[z.id] || '').trim()} onClick={() => agregarReferencia(z.id)}>
                    + Localidad
                  </button>
                </div>
              </div>
            );
          })}
          {zonas.length === 0 ? (
            <div style={{ color: '#6b7280', fontSize: 12 }}>No hay zonas cargadas todavía.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

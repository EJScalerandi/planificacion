// src/components/modals/LogisticaZonasModal.jsx
//
// ABM de zonas (Zona Sur, Zona Bs As, etc.) usadas al crear un viaje. Guardado
// en backend (public.logistica_zonas), no localStorage: lo usa todo el equipo
// de logística, no solo quien lo configuró.
import React, { useEffect, useState } from 'react';
import { createLogisticaZona, updateLogisticaZona, deleteLogisticaZona } from '../../api';

const th = { textAlign: 'left', padding: 10, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
const td = { padding: 10, borderBottom: '1px solid var(--border)', verticalAlign: 'top' };

export default function LogisticaZonasModal({ open, config, onClose, onChanged }) {
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) { setNuevoNombre(''); setErr(''); }
  }, [open]);

  if (!open) return null;

  const zonas = config?.zonas || [];

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
    if (!window.confirm(`¿Borrar la zona "${z.nombre}"?`)) return;
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

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div style={{ width: 'min(560px, 100%)', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.18)', padding: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 900 }}>Zonas</div>
          <button className="btn" style={{ marginLeft: 'auto' }} onClick={onClose}>Cerrar</button>
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

        <div style={{ overflow: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface-muted, #f9fafb)' }}>
                <th style={th}>Nombre</th>
                <th style={th}>Activa</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {zonas.map((z) => (
                <tr key={z.id}>
                  <td style={td}>{z.nombre}</td>
                  <td style={td}>
                    <button className="btn" disabled={busy} onClick={() => toggleActivo(z)}>{z.activo ? 'Sí' : 'No'}</button>
                  </td>
                  <td style={td}>
                    <button className="btn" style={{ borderColor: '#ef4444', color: '#991b1b' }} disabled={busy} onClick={() => borrar(z)}>Borrar</button>
                  </td>
                </tr>
              ))}
              {zonas.length === 0 ? (
                <tr><td style={{ ...td, color: '#6b7280' }} colSpan={3}>No hay zonas cargadas todavía.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

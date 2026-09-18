// src/components/modals/LogisticaParadasExtraModal.jsx
//
// ABM del catálogo de "paradas estándar" (puntos extra reutilizables entre
// viajes, ej. alojamiento de la cuadrilla) - mismo patrón que
// LogisticaVehiculosModal.jsx. Se asignan a un viaje puntual desde el panel
// de rutas del mapa (AgregarParadaExtra en LogisticaViajeSemanaModal.jsx),
// acá solo se mantiene el catálogo.
import React, { useEffect, useState } from 'react';
import { createLogisticaPuntoExtra, updateLogisticaPuntoExtra, deleteLogisticaPuntoExtra } from '../../api';

const th = { textAlign: 'left', padding: 10, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
const td = { padding: 10, borderBottom: '1px solid var(--border)', verticalAlign: 'top' };

export default function LogisticaParadasExtraModal({ open, puntosExtra, onClose, onChanged }) {
  const [nombre, setNombre] = useState('');
  const [mapsUrl, setMapsUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editId, setEditId] = useState(null);
  const [editMapsUrl, setEditMapsUrl] = useState('');

  useEffect(() => {
    if (open) { setNombre(''); setMapsUrl(''); setErr(''); setEditId(null); }
  }, [open]);

  if (!open) return null;

  const puntos = puntosExtra || [];

  const agregar = async () => {
    const nm = nombre.trim();
    const url = mapsUrl.trim();
    if (!nm || !url) return;
    setBusy(true);
    setErr('');
    try {
      await createLogisticaPuntoExtra({ nombre: nm, maps_url: url });
      setNombre('');
      setMapsUrl('');
      await onChanged?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const guardarUrl = async (p) => {
    const url = editMapsUrl.trim();
    if (!url) return;
    setBusy(true);
    setErr('');
    try {
      await updateLogisticaPuntoExtra(p.id, { maps_url: url });
      setEditId(null);
      await onChanged?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleActivo = async (p) => {
    setBusy(true);
    setErr('');
    try {
      await updateLogisticaPuntoExtra(p.id, { activo: !p.activo });
      await onChanged?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const borrar = async (p) => {
    if (!window.confirm(`¿Borrar la parada "${p.nombre}"?`)) return;
    setBusy(true);
    setErr('');
    try {
      await deleteLogisticaPuntoExtra(p.id);
      await onChanged?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div style={{ width: 'min(680px, 100%)', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.18)', padding: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 900 }}>Paradas estándar</div>
          <button className="btn" style={{ marginLeft: 'auto' }} onClick={onClose}>Cerrar</button>
        </div>

        <div style={{ fontSize: 12, color: 'var(--muted, #6b7280)', marginBottom: 10 }}>
          Catálogo de paradas reutilizables entre viajes (ej. alojamiento de la cuadrilla) - se
          asignan a un viaje puntual desde el panel de rutas del mapa.
        </div>

        {err ? <div style={{ color: 'crimson', fontWeight: 800, fontSize: 12, marginBottom: 8 }}>{err}</div> : null}

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input className="pp-input" style={{ flex: 1 }} placeholder="Ej: Hotel Córdoba Centro" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <input className="pp-input" style={{ flex: 2 }} placeholder="Link de Google Maps" value={mapsUrl} onChange={(e) => setMapsUrl(e.target.value)} />
          <button className="btn btn--brand" disabled={busy || !nombre.trim() || !mapsUrl.trim()} onClick={agregar}>Agregar</button>
        </div>

        <div style={{ overflow: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface-muted, #f9fafb)' }}>
                <th style={th}>Nombre</th>
                <th style={th}>Ubicación</th>
                <th style={th}>Activo</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {puntos.map((p) => (
                <tr key={p.id}>
                  <td style={td}>{p.nombre}</td>
                  <td style={td}>
                    {editId === p.id ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input className="pp-input" style={{ width: 220 }} value={editMapsUrl} onChange={(e) => setEditMapsUrl(e.target.value)} />
                        <button className="btn btn--brand" disabled={busy} onClick={() => guardarUrl(p)}>Guardar</button>
                        <button className="btn" disabled={busy} onClick={() => setEditId(null)}>Cancelar</button>
                      </div>
                    ) : (
                      <button className="btn" disabled={busy} onClick={() => { setEditId(p.id); setEditMapsUrl(p.maps_url || ''); }}>
                        {p.maps_url ? 'Ver / editar link' : '(sin link)'}
                      </button>
                    )}
                  </td>
                  <td style={td}>
                    <button className="btn" disabled={busy} onClick={() => toggleActivo(p)}>{p.activo ? 'Sí' : 'No'}</button>
                  </td>
                  <td style={td}>
                    <button className="btn" style={{ borderColor: '#ef4444', color: '#991b1b' }} disabled={busy} onClick={() => borrar(p)}>Borrar</button>
                  </td>
                </tr>
              ))}
              {puntos.length === 0 ? (
                <tr><td style={{ ...td, color: '#6b7280' }} colSpan={4}>No hay paradas estándar cargadas todavía.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// src/components/modals/ServicioTecnicoConfigModal.jsx
//
// ABM de vehículos y cuadrillas propios de Servicio Técnico (equipo de
// Diego, distinto del de despacho de Logística). Las zonas geográficas se
// comparten con Logística (public.logistica_zonas) y son de solo lectura
// acá - se editan desde Logística de Viajes.
import React, { useEffect, useState } from 'react';
import {
  createStVehiculo, updateStVehiculo, deleteStVehiculo,
  createStCuadrilla, updateStCuadrilla, deleteStCuadrilla, setStCuadrillaMiembros,
} from '../../api';

const th = { textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
const td = { padding: 8, borderBottom: '1px solid var(--border)', verticalAlign: 'top' };

export default function ServicioTecnicoConfigModal({ open, config, onClose, onChanged }) {
  const [nuevoVehiculo, setNuevoVehiculo] = useState('');
  const [nuevaCuadrilla, setNuevaCuadrilla] = useState('');
  const [miembrosEdit, setMiembrosEdit] = useState(null); // cuadrilla_id en edición de miembros
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) { setNuevoVehiculo(''); setNuevaCuadrilla(''); setMiembrosEdit(null); setErr(''); }
  }, [open]);

  if (!open) return null;

  const vehiculos = config?.vehiculos || [];
  const cuadrillas = config?.cuadrillas || [];
  const qcUsers = config?.qc_users || [];

  const run = async (fn) => {
    setBusy(true);
    setErr('');
    try {
      await fn();
      await onChanged?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const cuadrillaEnEdicion = cuadrillas.find((c) => c.id === miembrosEdit);
  const miembrosIdsActuales = (cuadrillaEnEdicion?.miembros || []).map((m) => m.id);

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div style={{ width: 'min(760px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.18)', padding: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 900 }}>Vehículos y cuadrillas de Técnica</div>
          <button className="btn" style={{ marginLeft: 'auto' }} onClick={onClose}>Cerrar</button>
        </div>

        {err ? <div style={{ color: 'crimson', fontWeight: 800, fontSize: 12, marginBottom: 8 }}>{err}</div> : null}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>Vehículos</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input className="pp-input" style={{ flex: 1, fontSize: 12 }} placeholder="Ej: Camioneta Diego" value={nuevoVehiculo} onChange={(e) => setNuevoVehiculo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && nuevoVehiculo.trim()) { run(() => createStVehiculo({ nombre: nuevoVehiculo.trim() })); setNuevoVehiculo(''); } }} />
              <button className="btn" disabled={busy || !nuevoVehiculo.trim()} onClick={() => { run(() => createStVehiculo({ nombre: nuevoVehiculo.trim() })); setNuevoVehiculo(''); }}>+</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr><th style={th}>Nombre</th><th style={th}>Activo</th><th style={th}></th></tr></thead>
              <tbody>
                {vehiculos.map((v) => (
                  <tr key={v.id}>
                    <td style={td}>{v.nombre}</td>
                    <td style={td}><button className="btn" style={{ padding: '2px 6px', fontSize: 11 }} disabled={busy} onClick={() => run(() => updateStVehiculo(v.id, { activo: !v.activo }))}>{v.activo ? 'Sí' : 'No'}</button></td>
                    <td style={td}><button className="btn" style={{ padding: '2px 6px', fontSize: 11, borderColor: '#ef4444', color: '#991b1b' }} disabled={busy} onClick={() => run(() => deleteStVehiculo(v.id))}>Borrar</button></td>
                  </tr>
                ))}
                {vehiculos.length === 0 ? <tr><td style={{ ...td, color: '#6b7280' }} colSpan={3}>Sin vehículos cargados.</td></tr> : null}
              </tbody>
            </table>
          </div>

          <div>
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>Cuadrillas</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input className="pp-input" style={{ flex: 1, fontSize: 12 }} placeholder="Ej: Técnico Juan" value={nuevaCuadrilla} onChange={(e) => setNuevaCuadrilla(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && nuevaCuadrilla.trim()) { run(() => createStCuadrilla({ nombre: nuevaCuadrilla.trim() })); setNuevaCuadrilla(''); } }} />
              <button className="btn" disabled={busy || !nuevaCuadrilla.trim()} onClick={() => { run(() => createStCuadrilla({ nombre: nuevaCuadrilla.trim() })); setNuevaCuadrilla(''); }}>+</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr><th style={th}>Nombre</th><th style={th}>Miembros</th><th style={th}></th></tr></thead>
              <tbody>
                {cuadrillas.map((c) => (
                  <tr key={c.id}>
                    <td style={td}>{c.nombre}</td>
                    <td style={td}>
                      <button className="btn" style={{ padding: '2px 6px', fontSize: 11 }} disabled={busy} onClick={() => setMiembrosEdit(miembrosEdit === c.id ? null : c.id)}>
                        {(c.miembros || []).length} · editar
                      </button>
                    </td>
                    <td style={td}><button className="btn" style={{ padding: '2px 6px', fontSize: 11, borderColor: '#ef4444', color: '#991b1b' }} disabled={busy} onClick={() => run(() => deleteStCuadrilla(c.id))}>Borrar</button></td>
                  </tr>
                ))}
                {cuadrillas.length === 0 ? <tr><td style={{ ...td, color: '#6b7280' }} colSpan={3}>Sin cuadrillas cargadas.</td></tr> : null}
              </tbody>
            </table>

            {cuadrillaEnEdicion ? (
              <div style={{ marginTop: 8, border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 800, marginBottom: 4 }}>Miembros de "{cuadrillaEnEdicion.nombre}"</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
                  {qcUsers.map((u) => (
                    <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                      <input
                        type="checkbox" checked={miembrosIdsActuales.includes(u.id)}
                        onChange={(e) => {
                          const next = e.target.checked ? [...miembrosIdsActuales, u.id] : miembrosIdsActuales.filter((id) => id !== u.id);
                          run(() => setStCuadrillaMiembros(cuadrillaEnEdicion.id, next));
                        }}
                      />
                      {u.name}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

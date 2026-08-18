// src/components/modals/LogisticaVehiculosModal.jsx
//
// ABM de vehículos (Mercedes, Partner, etc.) con capacidad de portones para
// despacho. Capacidad 0 = no lleva despacho (solo instala), como la Partner
// del pedido original.
import React, { useEffect, useState } from 'react';
import { createLogisticaVehiculo, updateLogisticaVehiculo, deleteLogisticaVehiculo } from '../../api';

const th = { textAlign: 'left', padding: 10, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
const td = { padding: 10, borderBottom: '1px solid var(--border)', verticalAlign: 'top' };

export default function LogisticaVehiculosModal({ open, config, onClose, onChanged }) {
  const [nombre, setNombre] = useState('');
  const [capacidad, setCapacidad] = useState('0');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editId, setEditId] = useState(null);
  const [editCapacidad, setEditCapacidad] = useState('0');

  useEffect(() => {
    if (open) { setNombre(''); setCapacidad('0'); setErr(''); setEditId(null); }
  }, [open]);

  if (!open) return null;

  const vehiculos = config?.vehiculos || [];

  const agregar = async () => {
    const nm = nombre.trim();
    const cap = Number(capacidad);
    if (!nm || !Number.isFinite(cap) || cap < 0) return;
    setBusy(true);
    setErr('');
    try {
      await createLogisticaVehiculo({ nombre: nm, capacidad_portones: cap });
      setNombre('');
      setCapacidad('0');
      await onChanged?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const guardarCapacidad = async (v) => {
    const cap = Number(editCapacidad);
    if (!Number.isFinite(cap) || cap < 0) return;
    setBusy(true);
    setErr('');
    try {
      await updateLogisticaVehiculo(v.id, { capacidad_portones: cap });
      setEditId(null);
      await onChanged?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleActivo = async (v) => {
    setBusy(true);
    setErr('');
    try {
      await updateLogisticaVehiculo(v.id, { activo: !v.activo });
      await onChanged?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const borrar = async (v) => {
    if (!window.confirm(`¿Borrar el vehículo "${v.nombre}"?`)) return;
    setBusy(true);
    setErr('');
    try {
      await deleteLogisticaVehiculo(v.id);
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
      <div style={{ width: 'min(640px, 100%)', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.18)', padding: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 900 }}>Vehículos</div>
          <button className="btn" style={{ marginLeft: 'auto' }} onClick={onClose}>Cerrar</button>
        </div>

        <div style={{ fontSize: 12, color: 'var(--muted, #6b7280)', marginBottom: 10 }}>
          Capacidad = cantidad de portones que lleva para despacho. 0 = solo instala (no suma despacho).
        </div>

        {err ? <div style={{ color: 'crimson', fontWeight: 800, fontSize: 12, marginBottom: 8 }}>{err}</div> : null}

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input className="pp-input" style={{ flex: 1 }} placeholder="Ej: Mercedes" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <input className="pp-input" type="number" min="0" style={{ width: 100 }} value={capacidad} onChange={(e) => setCapacidad(e.target.value)} />
          <button className="btn btn--brand" disabled={busy || !nombre.trim()} onClick={agregar}>Agregar</button>
        </div>

        <div style={{ overflow: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface-muted, #f9fafb)' }}>
                <th style={th}>Nombre</th>
                <th style={th}>Capacidad</th>
                <th style={th}>Activo</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {vehiculos.map((v) => (
                <tr key={v.id}>
                  <td style={td}>{v.nombre}</td>
                  <td style={td}>
                    {editId === v.id ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input className="pp-input" type="number" min="0" style={{ width: 80 }} value={editCapacidad} onChange={(e) => setEditCapacidad(e.target.value)} />
                        <button className="btn btn--brand" disabled={busy} onClick={() => guardarCapacidad(v)}>Guardar</button>
                        <button className="btn" disabled={busy} onClick={() => setEditId(null)}>Cancelar</button>
                      </div>
                    ) : (
                      <button className="btn" disabled={busy} onClick={() => { setEditId(v.id); setEditCapacidad(String(v.capacidad_portones)); }}>
                        {v.capacidad_portones}
                      </button>
                    )}
                  </td>
                  <td style={td}>
                    <button className="btn" disabled={busy} onClick={() => toggleActivo(v)}>{v.activo ? 'Sí' : 'No'}</button>
                  </td>
                  <td style={td}>
                    <button className="btn" style={{ borderColor: '#ef4444', color: '#991b1b' }} disabled={busy} onClick={() => borrar(v)}>Borrar</button>
                  </td>
                </tr>
              ))}
              {vehiculos.length === 0 ? (
                <tr><td style={{ ...td, color: '#6b7280' }} colSpan={4}>No hay vehículos cargados todavía.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

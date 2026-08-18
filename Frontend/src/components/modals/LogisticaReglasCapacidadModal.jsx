// src/components/modals/LogisticaReglasCapacidadModal.jsx
//
// Reglas de "peso" para el descuento de capacidad del vehículo: si la medida
// (alto/ancho/la mayor de las dos) supera un umbral, el portón cuenta como N
// portones en vez de 1 (ej. "mayores a 4m cuentan como 2"). Gana la primera
// regla activa que matchee (por prioridad), igual que las reglas
// Sistema->Fecha Salida que ya existían en /a. Se resuelve en el backend
// (server/lib/logisticaCapacidad.js) porque afecta la capacidad real del
// vehículo, no es solo una recomendación visual.
import React, { useEffect, useState } from 'react';
import { createLogisticaReglaCapacidad, updateLogisticaReglaCapacidad, deleteLogisticaReglaCapacidad } from '../../api';

const th = { textAlign: 'left', padding: 10, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
const td = { padding: 10, borderBottom: '1px solid var(--border)', verticalAlign: 'top' };

const CAMPO_OPCIONES = [
  { value: 'max_mm', label: 'Mayor medida (alto o ancho)' },
  { value: 'alto_mm', label: 'Alto' },
  { value: 'ancho_mm', label: 'Ancho' },
];
const OPERADOR_OPCIONES = ['>', '>=', '<', '<=', '='];

const emptyForm = { nombre: '', campo: 'max_mm', operador: '>', valor_mm: '4000', peso: '2', prioridad: '0' };

export default function LogisticaReglasCapacidadModal({ open, config, onClose, onChanged }) {
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) { setForm(emptyForm); setErr(''); }
  }, [open]);

  if (!open) return null;

  const reglas = config?.reglas || [];

  const agregar = async () => {
    const valorMm = Number(form.valor_mm);
    const peso = Number(form.peso);
    if (!Number.isFinite(valorMm) || !Number.isFinite(peso)) return;
    setBusy(true);
    setErr('');
    try {
      await createLogisticaReglaCapacidad({
        nombre: form.nombre.trim() || null,
        campo: form.campo,
        operador: form.operador,
        valor_mm: valorMm,
        peso,
        prioridad: Number(form.prioridad) || 0,
      });
      setForm(emptyForm);
      await onChanged?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleActivo = async (r) => {
    setBusy(true);
    setErr('');
    try {
      await updateLogisticaReglaCapacidad(r.id, { activo: !r.activo });
      await onChanged?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const borrar = async (r) => {
    if (!window.confirm(`¿Borrar la regla "${r.nombre || `#${r.id}`}"?`)) return;
    setBusy(true);
    setErr('');
    try {
      await deleteLogisticaReglaCapacidad(r.id);
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
      <div style={{ width: 'min(900px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.18)', padding: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 900 }}>Reglas de capacidad (medida → pesa como N portones)</div>
          <button className="btn" style={{ marginLeft: 'auto' }} onClick={onClose}>Cerrar</button>
        </div>

        <div style={{ fontSize: 12, color: 'var(--muted, #6b7280)', marginBottom: 10 }}>
          Gana la primera regla activa que matchee (por prioridad, menor primero). Si ninguna matchea, el
          portón pesa 1. El peso de despacho de un viaje no puede superar la capacidad del vehículo.
        </div>

        {err ? <div style={{ color: 'crimson', fontWeight: 800, fontSize: 12, marginBottom: 8 }}>{err}</div> : null}

        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
            Nombre
            <input className="pp-input" style={{ width: 160 }} value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Mayores a 4m" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
            Campo
            <select className="pp-select" value={form.campo} onChange={(e) => setForm((f) => ({ ...f, campo: e.target.value }))}>
              {CAMPO_OPCIONES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
            Operador
            <select className="pp-select" value={form.operador} onChange={(e) => setForm((f) => ({ ...f, operador: e.target.value }))}>
              {OPERADOR_OPCIONES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
            Valor (mm)
            <input className="pp-input" type="number" style={{ width: 100 }} value={form.valor_mm} onChange={(e) => setForm((f) => ({ ...f, valor_mm: e.target.value }))} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
            Pesa como
            <input className="pp-input" type="number" style={{ width: 80 }} value={form.peso} onChange={(e) => setForm((f) => ({ ...f, peso: e.target.value }))} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
            Prioridad
            <input className="pp-input" type="number" style={{ width: 80 }} value={form.prioridad} onChange={(e) => setForm((f) => ({ ...f, prioridad: e.target.value }))} />
          </label>
          <button className="btn btn--brand" disabled={busy} onClick={agregar}>Agregar</button>
        </div>

        <div style={{ overflow: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface-muted, #f9fafb)' }}>
                <th style={th}>Nombre</th>
                <th style={th}>Condición</th>
                <th style={th}>Pesa</th>
                <th style={th}>Prioridad</th>
                <th style={th}>Activa</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {reglas.map((r) => (
                <tr key={r.id}>
                  <td style={td}>{r.nombre || <span style={{ color: '#9ca3af' }}>—</span>}</td>
                  <td style={td}>{(CAMPO_OPCIONES.find((o) => o.value === r.campo)?.label) || r.campo} {r.operador} {r.valor_mm}mm</td>
                  <td style={td}>{r.peso}</td>
                  <td style={td}>{r.prioridad}</td>
                  <td style={td}>
                    <button className="btn" disabled={busy} onClick={() => toggleActivo(r)}>{r.activo ? 'Sí' : 'No'}</button>
                  </td>
                  <td style={td}>
                    <button className="btn" style={{ borderColor: '#ef4444', color: '#991b1b' }} disabled={busy} onClick={() => borrar(r)}>Borrar</button>
                  </td>
                </tr>
              ))}
              {reglas.length === 0 ? (
                <tr><td style={{ ...td, color: '#6b7280' }} colSpan={6}>No hay reglas cargadas. Sin reglas, todos los portones pesan 1.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

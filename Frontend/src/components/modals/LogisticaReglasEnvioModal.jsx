// src/components/modals/LogisticaReglasEnvioModal.jsx
//
// Reglas de negocio para el motor de logística IA: "un portón no puede
// despacharse antes de N días desde tal fecha" (ejemplo real del usuario: 45
// días desde la firma del link, 60 si es Coplanar). Gana la primera regla
// activa que matchee (por prioridad), mismo patrón que las reglas de
// capacidad. Estas reglas todavía NO se aplican en ningún lado (eso es
// Fase 1, el motor IA) — acá solo se cargan y quedan listas.
import React, { useEffect, useState } from 'react';
import { createLogisticaReglaEnvio, updateLogisticaReglaEnvio, deleteLogisticaReglaEnvio } from '../../api';

const th = { textAlign: 'left', padding: 10, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
const td = { padding: 10, borderBottom: '1px solid var(--border)', verticalAlign: 'top' };

const FECHA_REF_OPCIONES = [
  { value: 'fecha_nv', label: 'Fecha de venta (NV)' },
  { value: 'fecha_med', label: 'Fecha de medición' },
  { value: 'fecha_prod', label: 'Fecha de producción' },
];
const OPERADOR_OPCIONES = ['=', '!=', '>', '>=', '<', '<='];

const emptyForm = {
  nombre: '', descripcion: '', dias_minimos: '45', fecha_referencia_campo: 'fecha_nv',
  campo: '', operador: '=', valor: '', prioridad: '0',
};

export default function LogisticaReglasEnvioModal({ open, config, onClose, onChanged }) {
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) { setForm(emptyForm); setErr(''); }
  }, [open]);

  if (!open) return null;

  const reglas = config?.reglas_envio || [];

  const agregar = async () => {
    const nombre = form.nombre.trim();
    const dias = Number(form.dias_minimos);
    if (!nombre || !Number.isFinite(dias) || dias < 0) return;
    setBusy(true);
    setErr('');
    try {
      await createLogisticaReglaEnvio({
        nombre,
        descripcion: form.descripcion.trim() || null,
        dias_minimos: dias,
        fecha_referencia_campo: form.fecha_referencia_campo,
        campo: form.campo.trim() || null,
        operador: form.campo.trim() ? form.operador : null,
        valor: form.campo.trim() ? (form.valor.trim() || null) : null,
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
      await updateLogisticaReglaEnvio(r.id, { activo: !r.activo });
      await onChanged?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const borrar = async (r) => {
    if (!window.confirm(`¿Borrar la regla "${r.nombre}"?`)) return;
    setBusy(true);
    setErr('');
    try {
      await deleteLogisticaReglaEnvio(r.id);
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
      <div style={{ width: 'min(960px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.18)', padding: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 900 }}>Reglas de envío (días mínimos antes de despachar)</div>
          <button className="btn" style={{ marginLeft: 'auto' }} onClick={onClose}>Cerrar</button>
        </div>

        <div style={{ fontSize: 12, color: 'var(--muted, #6b7280)', marginBottom: 10 }}>
          Gana la primera regla activa que matchee (por prioridad, menor primero) — dejá "Condición" vacía
          para una regla base que aplica a cualquier portón. Todavía no se validan en ningún lado: esto es la
          configuración; la IA las va a usar como contexto al recomendar rutas.
        </div>

        {err ? <div style={{ color: 'crimson', fontWeight: 800, fontSize: 12, marginBottom: 8 }}>{err}</div> : null}

        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
            Nombre
            <input className="pp-input" style={{ width: 160 }} value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Coplanar 60 días" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
            Días mínimos
            <input className="pp-input" type="number" style={{ width: 90 }} value={form.dias_minimos} onChange={(e) => setForm((f) => ({ ...f, dias_minimos: e.target.value }))} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
            Desde
            <select className="pp-select" value={form.fecha_referencia_campo} onChange={(e) => setForm((f) => ({ ...f, fecha_referencia_campo: e.target.value }))}>
              {FECHA_REF_OPCIONES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
            Condición: campo
            <input className="pp-input" style={{ width: 110 }} value={form.campo} onChange={(e) => setForm((f) => ({ ...f, campo: e.target.value }))} placeholder="sistema" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
            Operador
            <select className="pp-select" value={form.operador} onChange={(e) => setForm((f) => ({ ...f, operador: e.target.value }))} disabled={!form.campo.trim()}>
              {OPERADOR_OPCIONES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
            Valor
            <input className="pp-input" style={{ width: 110 }} value={form.valor} onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} placeholder="Coplanar" disabled={!form.campo.trim()} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
            Prioridad
            <input className="pp-input" type="number" style={{ width: 80 }} value={form.prioridad} onChange={(e) => setForm((f) => ({ ...f, prioridad: e.target.value }))} />
          </label>
          <button className="btn btn--brand" disabled={busy || !form.nombre.trim()} onClick={agregar}>Agregar</button>
        </div>

        <div style={{ overflow: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface-muted, #f9fafb)' }}>
                <th style={th}>Nombre</th>
                <th style={th}>Días mín.</th>
                <th style={th}>Desde</th>
                <th style={th}>Condición</th>
                <th style={th}>Prioridad</th>
                <th style={th}>Activa</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {reglas.map((r) => (
                <tr key={r.id}>
                  <td style={td}>{r.nombre}</td>
                  <td style={td}>{r.dias_minimos}</td>
                  <td style={td}>{FECHA_REF_OPCIONES.find((o) => o.value === r.fecha_referencia_campo)?.label || r.fecha_referencia_campo}</td>
                  <td style={td}>{r.campo ? `${r.campo} ${r.operador} ${r.valor}` : <span style={{ color: '#9ca3af' }}>Cualquier portón</span>}</td>
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
                <tr><td style={{ ...td, color: '#6b7280' }} colSpan={7}>No hay reglas cargadas todavía.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

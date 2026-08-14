// src/components/modals/LogisticaCuadrillasModal.jsx
//
// ABM de cuadrillas (ej. "Cuadrilla 1": Pedro, José, Matías), armadas a partir
// de los usuarios QC ya existentes (public.qc_users) en vez de duplicar un
// padrón de empleados nuevo.
import React, { useEffect, useState } from 'react';
import {
  createLogisticaCuadrilla,
  updateLogisticaCuadrilla,
  deleteLogisticaCuadrilla,
  setLogisticaCuadrillaMiembros,
} from '../../api';

const th = { textAlign: 'left', padding: 10, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
const td = { padding: 10, borderBottom: '1px solid var(--border)', verticalAlign: 'top' };

function MiembrosEditor({ cuadrilla, qcUsers, busy, onSave }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(() => new Set((cuadrilla.miembros || []).map((m) => Number(m.qc_user_id))));

  useEffect(() => {
    setSelected(new Set((cuadrilla.miembros || []).map((m) => Number(m.qc_user_id))));
  }, [cuadrilla]);

  if (!open) {
    return (
      <div>
        <div style={{ marginBottom: 4 }}>
          {(cuadrilla.miembros || []).length ? cuadrilla.miembros.map((m) => m.name).join(', ') : <span style={{ color: '#9ca3af' }}>(sin miembros)</span>}
        </div>
        <button className="btn" disabled={busy} onClick={() => setOpen(true)}>Editar miembros</button>
      </div>
    );
  }

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: 340, marginBottom: 8 }}>
        {(qcUsers || []).map((u) => {
          const id = Number(u.id);
          const active = selected.has(id);
          return (
            <label
              key={id}
              className="btn"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, padding: '4px 8px',
                background: active ? 'var(--brand)' : undefined, color: active ? '#fff' : undefined,
              }}
            >
              <input type="checkbox" checked={active} onChange={() => toggle(id)} style={{ margin: 0 }} />
              {u.name}
            </label>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn--brand" disabled={busy} onClick={() => { onSave(Array.from(selected)); setOpen(false); }}>Guardar miembros</button>
        <button className="btn" disabled={busy} onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </div>
  );
}

export default function LogisticaCuadrillasModal({ open, config, onClose, onChanged }) {
  const [nombre, setNombre] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) { setNombre(''); setErr(''); }
  }, [open]);

  if (!open) return null;

  const cuadrillas = config?.cuadrillas || [];
  const qcUsers = config?.qc_users || [];

  const agregar = async () => {
    const nm = nombre.trim();
    if (!nm) return;
    setBusy(true);
    setErr('');
    try {
      await createLogisticaCuadrilla({ nombre: nm });
      setNombre('');
      await onChanged?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleActivo = async (c) => {
    setBusy(true);
    setErr('');
    try {
      await updateLogisticaCuadrilla(c.id, { activo: !c.activo });
      await onChanged?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const borrar = async (c) => {
    if (!window.confirm(`¿Borrar la cuadrilla "${c.nombre}"?`)) return;
    setBusy(true);
    setErr('');
    try {
      await deleteLogisticaCuadrilla(c.id);
      await onChanged?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const guardarMiembros = async (cuadrillaId, qcUserIds) => {
    setBusy(true);
    setErr('');
    try {
      await setLogisticaCuadrillaMiembros(cuadrillaId, qcUserIds);
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
      <div style={{ width: 'min(760px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.18)', padding: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 900 }}>Cuadrillas</div>
          <button className="btn" style={{ marginLeft: 'auto' }} onClick={onClose}>Cerrar</button>
        </div>

        {err ? <div style={{ color: 'crimson', fontWeight: 800, fontSize: 12, marginBottom: 8 }}>{err}</div> : null}

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input className="pp-input" style={{ flex: 1 }} placeholder="Ej: Cuadrilla 1" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <button className="btn btn--brand" disabled={busy || !nombre.trim()} onClick={agregar}>Agregar</button>
        </div>

        <div style={{ overflow: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface-muted, #f9fafb)' }}>
                <th style={th}>Nombre</th>
                <th style={th}>Miembros</th>
                <th style={th}>Activa</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {cuadrillas.map((c) => (
                <tr key={c.id}>
                  <td style={td}>{c.nombre}</td>
                  <td style={td}>
                    <MiembrosEditor cuadrilla={c} qcUsers={qcUsers} busy={busy} onSave={(ids) => guardarMiembros(c.id, ids)} />
                  </td>
                  <td style={td}>
                    <button className="btn" disabled={busy} onClick={() => toggleActivo(c)}>{c.activo ? 'Sí' : 'No'}</button>
                  </td>
                  <td style={td}>
                    <button className="btn" style={{ borderColor: '#ef4444', color: '#991b1b' }} disabled={busy} onClick={() => borrar(c)}>Borrar</button>
                  </td>
                </tr>
              ))}
              {cuadrillas.length === 0 ? (
                <tr><td style={{ ...td, color: '#6b7280' }} colSpan={4}>No hay cuadrillas cargadas todavía.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// src/components/PreproduccionSistemaFechaSalidaRules.jsx
import React, { useEffect, useState } from 'react';

const LS_KEY = 'pp_sistema_fecha_salida_rules_v1';

function ciIncludes(h, n) {
  return String(h || '').toLowerCase().includes(String(n || '').toLowerCase());
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toISODate10(v) {
  if (!v) return '';
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return s;
  return '';
}

function todayISO10() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDaysISO10(baseISO10, days) {
  const b = toISODate10(baseISO10) || todayISO10();
  const dt = new Date(`${b}T00:00:00`);
  dt.setDate(dt.getDate() + Number(days || 0));
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

/**
 * Regla:
 * {
 *   id: string,
 *   match: string,     // substring a buscar en "Sistema"
 *   days: number,      // offset
 *   base: "hoy" | "inicio_prod" | "fecha_medicion"
 * }
 */
export function loadSistemaFechaSalidaRules() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveSistemaFechaSalidaRules(list) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list || []));
  } catch {}
}

/**
 * Resuelve la fecha recomendada de salida para una fila.
 * - Toma el primer match de rules.
 * - Base por default: hoy
 * - Acepta Sistema o Sistemas
 * - Permite base desde inicio_prod_imput o fecha_medicion_imput si existen (ISO10)
 */
export function resolveRecommendedFechaSalidaISO10(rowData, rules) {
  const sistema = String(rowData?.Sistemas ?? rowData?.Sistema ?? rowData?.sistemas ?? rowData?.sistema ?? '').trim();
  if (!sistema) return '';

  const list = Array.isArray(rules) ? rules : [];
  const hit = list.find((r) => r?.match && ciIncludes(sistema, r.match));
  if (!hit) return '';

  let base = todayISO10();
  if (hit.base === 'inicio_prod') base = toISODate10(rowData?.inicio_prod_imput) || base;
  if (hit.base === 'fecha_medicion') base = toISODate10(rowData?.fecha_medicion_imput) || base;

  return addDaysISO10(base, hit.days);
}

export default function PreproduccionSistemaFechaSalidaRules({ open, onClose }) {
  const [items, setItems] = useState(() => loadSistemaFechaSalidaRules());

  useEffect(() => {
    if (!open) return;
    setItems(loadSistemaFechaSalidaRules());
  }, [open]);

  const addRow = () => {
    setItems((prev) => [
      ...prev,
      {
        id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()),
        match: '',
        days: 40,
        base: 'hoy',
      },
    ]);
  };

  const update = (id, patch) => setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const remove = (id) => setItems((prev) => prev.filter((x) => x.id !== id));

  const save = () => {
    saveSistemaFechaSalidaRules(items);
    onClose?.();
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        style={{
          width: 'min(980px, 100%)',
          background: '#fff',
          borderRadius: 14,
          border: '1px solid #e5e7eb',
          boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
          padding: 12,
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 900 }}>Reglas: Sistema → Fecha Salida Recomendada</div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn" onClick={addRow}>
              Agregar
            </button>
            <button className="btn" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn btn--brand" onClick={save}>
              Guardar
            </button>
          </div>
        </div>

        <div style={{ fontSize: 12, color: '#374151', marginBottom: 10 }}>
          Si “Sistema(s)” incluye el texto, se recomienda <b>base + días</b>. El primer match gana.
        </div>

        <div style={{ overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={th}>Match (Sistema contiene)</th>
                <th style={th}>Días</th>
                <th style={th}>Base</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td style={td}>
                    <input className="pp-input" value={it.match || ''} onChange={(e) => update(it.id, { match: e.target.value })} />
                  </td>
                  <td style={td}>
                    <input
                      className="pp-input"
                      type="number"
                      value={Number(it.days ?? 0)}
                      onChange={(e) => update(it.id, { days: Number(e.target.value) })}
                      style={{ width: 120 }}
                    />
                  </td>
                  <td style={td}>
                    <select className="pp-select" value={it.base || 'hoy'} onChange={(e) => update(it.id, { base: e.target.value })}>
                      <option value="hoy">Hoy</option>
                      <option value="inicio_prod">Inicio Prod</option>
                      <option value="fecha_medicion">Fecha Medición</option>
                    </select>
                  </td>
                  <td style={td}>
                    <button
                      className="btn"
                      style={{ borderColor: '#ef4444', color: '#991b1b', background: '#fff5f5' }}
                      onClick={() => remove(it.id)}
                    >
                      Borrar
                    </button>
                  </td>
                </tr>
              ))}

              {items.length === 0 ? (
                <tr>
                  <td style={{ ...td, padding: 12, color: '#6b7280' }} colSpan={4}>
                    No hay reglas cargadas. Tocá “Agregar”.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 8, fontSize: 11, color: '#6b7280' }}>
          Guardado local (este navegador). Si necesitás multiusuario, lo migramos a backend.
        </div>
      </div>
    </div>
  );
}

const th = { textAlign: 'left', padding: 10, borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' };
const td = { padding: 10, borderBottom: '1px solid #f3f4f6', verticalAlign: 'top' };

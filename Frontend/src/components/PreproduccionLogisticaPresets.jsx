// src/components/PreproduccionLogisticaPresets.jsx
import React, { useMemo, useState, useEffect } from 'react';

const LS_KEY = 'pp_logistica_presets_v2';

function normalizeKey(s) {
  return String(s || '').trim().toLowerCase();
}

function todayISO10() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Preset (v2):
 * {
 *   id: string,
 *   distribuidor: string,   // RazSoc exacto (display)
 *   distribuidorKey: string // normalizeKey(distribuidor)
 *   nombreCliente: string,
 *   email: string,
 *   mapsUrl: string,
 *   fechaContactoMode: "hoy" | "vacio"
 * }
 *
 * Nota: Migración v1:
 * - v1 usaba "match". Si existe, lo tomamos como distribuidor y lo migramos.
 */
export function loadLogisticaPresets() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      // compat v1 si existiese
      const rawV1 = localStorage.getItem('pp_logistica_presets_v1');
      if (!rawV1) return [];
      const arrV1 = JSON.parse(rawV1);
      if (!Array.isArray(arrV1)) return [];
      // migrar: match -> distribuidor
      const migrated = arrV1.map((p) => {
        const distribuidor = String(p?.distribuidor || p?.match || '').trim();
        return {
          id: p?.id || (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())),
          distribuidor,
          distribuidorKey: normalizeKey(distribuidor),
          nombreCliente: String(p?.nombreCliente || '').trim(),
          email: String(p?.email || '').trim(),
          mapsUrl: String(p?.mapsUrl || '').trim(),
          fechaContactoMode: p?.fechaContactoMode === 'vacio' ? 'vacio' : 'hoy',
        };
      });
      localStorage.setItem(LS_KEY, JSON.stringify(migrated));
      return migrated;
    }

    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveLogisticaPresets(list) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list || []));
  } catch {}
}

/**
 * Resolver por distribuidor exacto (RazSoc).
 */
export function resolveLogisticaPresetByDistribuidor(razSoc, presets) {
  const key = normalizeKey(razSoc);
  if (!key) return null;
  const list = Array.isArray(presets) ? presets : [];
  return list.find((p) => normalizeKey(p?.distribuidorKey || p?.distribuidor) === key) || null;
}

export function buildLogisticaRecommendationsFromPreset(preset) {
  if (!preset) return null;
  return {
    nombreCliente: String(preset.nombreCliente || '').trim(),
    email: String(preset.email || '').trim(),
    mapsUrl: String(preset.mapsUrl || '').trim(),
    fechaContacto: preset.fechaContactoMode === 'hoy' ? todayISO10() : '',
  };
}

/**
 * UI: administra presets con dropdown de distribuidores.
 * - distributors: array de strings RazSoc (ya deduplicado idealmente)
 */
export default function PreproduccionLogisticaPresets({ open, onClose, distributors }) {
  const [items, setItems] = useState(() => loadLogisticaPresets());

  useEffect(() => {
    if (!open) return;
    setItems(loadLogisticaPresets());
  }, [open]);

  const distributorOptions = useMemo(() => {
    const list = Array.isArray(distributors) ? distributors : [];
    const uniq = new Map();
    for (const d of list) {
      const s = String(d || '').trim();
      if (!s) continue;
      const k = normalizeKey(s);
      if (!uniq.has(k)) uniq.set(k, s);
    }
    return Array.from(uniq.values()).sort((a, b) => a.localeCompare(b));
  }, [distributors]);

  const usedKeys = useMemo(() => {
    const s = new Set();
    for (const it of items) {
      const k = normalizeKey(it?.distribuidorKey || it?.distribuidor);
      if (k) s.add(k);
    }
    return s;
  }, [items]);

  const addRow = () => {
    setItems((prev) => [
      ...prev,
      {
        id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
        distribuidor: '',
        distribuidorKey: '',
        nombreCliente: '',
        email: '',
        mapsUrl: '',
        fechaContactoMode: 'hoy',
      },
    ]);
  };

  const removeRow = (id) => setItems((prev) => prev.filter((x) => x.id !== id));

  const update = (id, patch) => {
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const setDistribuidor = (id, value) => {
    const v = String(value || '').trim();
    update(id, { distribuidor: v, distribuidorKey: normalizeKey(v) });
  };

  const hasDuplicates = useMemo(() => {
    const seen = new Set();
    for (const it of items) {
      const k = normalizeKey(it?.distribuidorKey || it?.distribuidor);
      if (!k) continue;
      if (seen.has(k)) return true;
      seen.add(k);
    }
    return false;
  }, [items]);

  const save = () => {
    // Filtrar filas vacías (sin distribuidor)
    const cleaned = (items || []).filter((it) => normalizeKey(it?.distribuidorKey || it?.distribuidor));
    // Evitar persistir duplicados por seguridad
    const byKey = new Map();
    for (const it of cleaned) {
      const k = normalizeKey(it?.distribuidorKey || it?.distribuidor);
      if (!k) continue;
      if (!byKey.has(k)) byKey.set(k, { ...it, distribuidorKey: k });
    }
    saveLogisticaPresets(Array.from(byKey.values()));
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
          width: 'min(1100px, 100%)',
          background: '#fff',
          borderRadius: 14,
          border: '1px solid #e5e7eb',
          boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
          padding: 12,
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 900 }}>Recomendados Logística por Distribuidor</div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn" onClick={addRow}>
              Agregar
            </button>
            <button className="btn" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn btn--brand" onClick={save} disabled={hasDuplicates}>
              Guardar
            </button>
          </div>
        </div>

        <div style={{ fontSize: 12, color: '#374151', marginBottom: 10 }}>
          Seleccioná el <b>Distribuidor (RazSoc)</b> desde el desplegable. Un distribuidor no puede repetirse.
        </div>

        {hasDuplicates ? (
          <div style={{ background: '#fff5f5', border: '1px solid #fecaca', padding: 10, borderRadius: 12, marginBottom: 10, fontSize: 12 }}>
            Hay distribuidores repetidos. Corregí eso para poder guardar.
          </div>
        ) : null}

        <div style={{ overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={th}>Distribuidor</th>
                <th style={th}>Nombre Cliente</th>
                <th style={th}>Email</th>
                <th style={th}>Maps URL</th>
                <th style={th}>Fecha contacto</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const myKey = normalizeKey(it?.distribuidorKey || it?.distribuidor);
                return (
                  <tr key={it.id}>
                    <td style={td}>
                      <select
                        className="pp-select"
                        value={it.distribuidor || ''}
                        onChange={(e) => setDistribuidor(it.id, e.target.value)}
                        style={{ width: 320 }}
                      >
                        <option value="">(seleccionar)</option>
                        {distributorOptions.map((d) => {
                          const k = normalizeKey(d);
                          const isUsedByOther = usedKeys.has(k) && k !== myKey;
                          return (
                            <option key={k} value={d} disabled={isUsedByOther}>
                              {d}
                            </option>
                          );
                        })}
                      </select>
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                        Si no aparece, es porque aún no hay registros con ese distribuidor (RazSoc) en la tabla.
                      </div>
                    </td>

                    <td style={td}>
                      <input className="pp-input" value={it.nombreCliente || ''} onChange={(e) => update(it.id, { nombreCliente: e.target.value })} />
                    </td>

                    <td style={td}>
                      <input className="pp-input" value={it.email || ''} onChange={(e) => update(it.id, { email: e.target.value })} />
                    </td>

                    <td style={td}>
                      <input className="pp-input" value={it.mapsUrl || ''} onChange={(e) => update(it.id, { mapsUrl: e.target.value })} />
                    </td>

                    <td style={td}>
                      <select
                        className="pp-select"
                        value={it.fechaContactoMode || 'hoy'}
                        onChange={(e) => update(it.id, { fechaContactoMode: e.target.value })}
                      >
                        <option value="hoy">Hoy</option>
                        <option value="vacio">Vacío</option>
                      </select>
                    </td>

                    <td style={td}>
                      <button
                        className="btn"
                        style={{ borderColor: '#ef4444', color: '#991b1b', background: '#fff5f5' }}
                        onClick={() => removeRow(it.id)}
                      >
                        Borrar
                      </button>
                    </td>
                  </tr>
                );
              })}

              {items.length === 0 ? (
                <tr>
                  <td style={{ ...td, padding: 12, color: '#6b7280' }} colSpan={6}>
                    No hay presets cargados. Tocá “Agregar”.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 8, fontSize: 11, color: '#6b7280' }}>
          Guardado local (este navegador). Si necesitás multiusuario, esto lo migramos a backend.
        </div>
      </div>
    </div>
  );
}

const th = { textAlign: 'left', padding: 10, borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' };
const td = { padding: 10, borderBottom: '1px solid #f3f4f6', verticalAlign: 'top' };

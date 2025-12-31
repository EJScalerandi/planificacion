// pages/admin/WorkflowDesignerPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { clearAdminToken, getAdminToken, getWorkflowConfig, saveWorkflowConfig } from '../../src/api';
import { Link, useNavigate } from 'react-router-dom';

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function StageMultiSelect({ options, value, onChange }) {
  const set = new Set(value || []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {options.map(o => {
        const checked = set.has(o.key);
        return (
          <label key={o.key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => {
                const next = new Set(set);
                if (e.target.checked) next.add(o.key);
                else next.delete(o.key);
                onChange(Array.from(next));
              }}
            />
            <span><b>{o.label}</b> <span style={{ opacity: .7 }}>({o.key})</span></span>
          </label>
        );
      })}
    </div>
  );
}

function AnyGroupsEditor({ stageOptions, groups, onChange }) {
  const [local, setLocal] = useState(groups || []);

  useEffect(() => { setLocal(groups || []); }, [JSON.stringify(groups || [])]);

  const update = (next) => {
    setLocal(next);
    onChange(next);
  };

  const addGroup = () => update([...(local || []), []]);
  const removeGroup = (idx) => update((local || []).filter((_, i) => i !== idx));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {(local || []).map((g, idx) => (
        <div key={idx} style={{ border: '1px solid #d1d5db', borderRadius: 12, padding: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ fontWeight: 900 }}>Grupo {idx + 1} (OR)</div>
            <button className="btn" type="button" onClick={() => removeGroup(idx)}>Eliminar grupo</button>
          </div>

          <div style={{ marginTop: 8 }}>
            <StageMultiSelect
              options={stageOptions}
              value={g}
              onChange={(vals) => {
                const next = (local || []).slice();
                next[idx] = vals;
                update(next);
              }}
            />
          </div>
        </div>
      ))}

      <button className="btn" type="button" onClick={addGroup}>
        + Agregar grupo OR
      </button>
      <div style={{ fontSize: 12, opacity: .65 }}>
        Cada grupo debe cumplir al menos una etapa finalizada para habilitar el inicio.
      </div>
    </div>
  );
}

export default function WorkflowDesignerPage() {
  const nav = useNavigate();

  // Guard simple: si no hay token, afuera.
  useEffect(() => {
    const t = getAdminToken();
    if (!t) nav('/admin/login', { replace: true });
  }, [nav]);

  const [line, setLine] = useState('portones');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const [stages, setStages] = useState([]);
  const [edges, setEdges] = useState([]);
  const [requirements, setRequirements] = useState([]);

  const stageOptions = useMemo(() => {
    return (stages || [])
      .filter(s => s.enabled !== false)
      .map(s => ({ key: s.key, label: s.label || s.key }));
  }, [stages]);

  const fromKeys = useMemo(() => stageOptions.map(o => o.key), [stageOptions]);

  const reload = async () => {
    setErr('');
    setLoading(true);
    try {
      const cfg = await getWorkflowConfig(line);
      setStages(cfg.stages || []);
      setEdges(cfg.edges || []);
      setRequirements(cfg.requirements || []);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, [line]);

  const edgesByFrom = useMemo(() => {
    const map = new Map();
    for (const k of fromKeys) map.set(k, []);
    for (const e of edges || []) {
      if (!map.has(e.from_key)) map.set(e.from_key, []);
      map.get(e.from_key).push(e);
    }
    return map;
  }, [edges, fromKeys]);

  const reqByStage = useMemo(() => {
    const map = new Map();
    for (const s of fromKeys) map.set(s, []);
    for (const r of requirements || []) {
      if (!map.has(r.stage_key)) map.set(r.stage_key, []);
      map.get(r.stage_key).push(r);
    }
    return map;
  }, [requirements, fromKeys]);

  const setNextForStage = (stageKey, nextKeys) => {
    const rest = (edges || []).filter(e => e.from_key !== stageKey);
    const newEdges = (nextKeys || []).map((toKey, idx) => ({
      line,
      from_key: stageKey,
      to_key: toKey,
      priority: 100 + idx,
      enabled: true,
      condition_json: null,
    }));
    setEdges([...rest, ...newEdges]);
  };

  const updateEdgeCondition = (fromKey, toKey, jsonText) => {
    const trimmed = (jsonText || '').trim();
    const parsed = trimmed ? safeJsonParse(trimmed) : null;
    setEdges((prev) => (prev || []).map(e => {
      if (e.from_key === fromKey && e.to_key === toKey) {
        return { ...e, condition_json: parsed };
      }
      return e;
    }));
  };

  const setReqAllForStage = (stageKey, reqAllKeys) => {
    const rest = (requirements || []).filter(r => !(r.stage_key === stageKey && r.type === 'ALL'));
    const add = (reqAllKeys || []).map(k => ({
      line,
      stage_key: stageKey,
      type: 'ALL',
      group_id: null,
      required_key: k,
    }));
    setRequirements([...rest, ...add]);
  };

  const setReqAnyGroupsForStage = (stageKey, groups) => {
    const rest = (requirements || []).filter(r => !(r.stage_key === stageKey && r.type === 'ANY_GROUP'));
    const add = [];
    (groups || []).forEach((keys, i) => {
      const gid = i + 1;
      (keys || []).forEach(k => {
        add.push({
          line,
          stage_key: stageKey,
          type: 'ANY_GROUP',
          group_id: gid,
          required_key: k,
        });
      });
    });
    setRequirements([...rest, ...add]);
  };

  const getReqAllKeys = (stageKey) => {
    return (reqByStage.get(stageKey) || []).filter(r => r.type === 'ALL').map(r => r.required_key);
  };

  const getReqAnyGroups = (stageKey) => {
    const rows = (reqByStage.get(stageKey) || []).filter(r => r.type === 'ANY_GROUP');
    const map = new Map();
    for (const r of rows) {
      const gid = r.group_id ?? 0;
      if (!map.has(gid)) map.set(gid, []);
      map.get(gid).push(r.required_key);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(x => x[1]);
  };

  const onSave = async () => {
    setErr('');
    try {
      setSaving(true);
      await saveWorkflowConfig(line, {
        edges,
        requirements,
        stageLabels: stages.map(s => ({ key: s.key, label: s.label })),
      });
      await reload();
      alert('Workflow guardado.');
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const logout = () => {
    clearAdminToken();
    nav('/admin/login', { replace: true });
  };

  if (loading) return <div className="container">Cargando workflow…</div>;

  return (
    <div className="container" style={{ maxWidth: 1100 }}>
      <div className="header-row" style={{ alignItems: 'center' }}>
        <h2 className="h1">Workflow Designer</h2>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn" to="/admin">Volver</Link>
          <Link className="btn" to="/">Inicio</Link>

          <select className="btn" value={line} onChange={(e) => setLine(e.target.value)}>
            <option value="portones">Portones</option>
            <option value="ipanel">iPanels</option>
          </select>

          <button className="btn" onClick={reload} disabled={saving}>Refrescar</button>
          <button className="btn btn--brand" onClick={onSave} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          <button className="btn" onClick={logout}>Salir</button>
        </div>
      </div>

      {err && <div style={{ color: 'crimson', fontWeight: 800, marginTop: 10 }}>{err}</div>}

      <div style={{ marginTop: 12, fontSize: 13, opacity: .75 }}>
        - “Rutas mixtas” = marcás múltiples siguientes. <br />
        - “ALL” = deben estar finalizadas todas las etapas requeridas. <br />
        - “ANY_GROUP” = cada grupo es un OR: debe cumplirse al menos 1 por grupo. <br />
        - Condiciones por flecha (JSON): <code>{`{"all":[{"field":"peso","op":">","value":150}]}`}</code>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
        {(stages || []).filter(s => s.enabled !== false).map((s) => {
          const currentEdges = (edgesByFrom.get(s.key) || []);
          const currentNext = currentEdges.filter(e => e.enabled !== false).map(e => e.to_key);

          const reqAll = getReqAllKeys(s.key);
          const anyGroups = getReqAnyGroups(s.key);

          return (
            <div key={s.key} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>
                    {s.label} <span style={{ opacity: .7 }}>({s.key})</span>
                  </div>
                  <div style={{ fontSize: 12, opacity: .7 }}>
                    Columna status: <code>{s.status_col}</code>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    className="btn"
                    style={{ minWidth: 320 }}
                    value={s.label}
                    onChange={(e) => {
                      const v = e.target.value;
                      setStages(prev => (prev || []).map(x => x.key === s.key ? { ...x, label: v } : x));
                    }}
                    placeholder="Label visible"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 12 }}>
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>Siguientes etapas (rutas mixtas)</div>
                  <StageMultiSelect
                    options={stageOptions.filter(o => o.key !== s.key)}
                    value={currentNext}
                    onChange={(vals) => setNextForStage(s.key, vals)}
                  />

                  {currentEdges.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontWeight: 900, marginBottom: 6 }}>Condiciones por ruta (opcional)</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {currentEdges.map(e => (
                          <div key={`${e.from_key}->${e.to_key}`} style={{ border: '1px dashed #d1d5db', borderRadius: 12, padding: 10 }}>
                            <div style={{ fontWeight: 900, marginBottom: 6 }}>
                              {e.from_key} → {e.to_key}
                            </div>
                            <textarea
                              className="btn"
                              rows={3}
                              style={{ width: '100%', resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
                              defaultValue={e.condition_json ? JSON.stringify(e.condition_json, null, 2) : ''}
                              placeholder='Ej: {"all":[{"field":"peso","op":">","value":150}]}'
                              onBlur={(ev) => updateEdgeCondition(e.from_key, e.to_key, ev.target.value)}
                            />
                            <div style={{ fontSize: 12, opacity: .65, marginTop: 6 }}>
                              Se evalúa al finalizar la etapa para habilitar la/s siguiente/s.
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>Requisitos para poder iniciar esta etapa</div>

                  <div style={{ fontWeight: 800, margin: '8px 0' }}>ALL (obligatorias)</div>
                  <StageMultiSelect
                    options={stageOptions.filter(o => o.key !== s.key)}
                    value={reqAll}
                    onChange={(vals) => setReqAllForStage(s.key, vals)}
                  />

                  <div style={{ fontWeight: 800, margin: '12px 0 8px' }}>ANY_GROUP (grupos OR)</div>
                  <AnyGroupsEditor
                    stageOptions={stageOptions.filter(o => o.key !== s.key)}
                    groups={anyGroups}
                    onChange={(g) => setReqAnyGroupsForStage(s.key, g)}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

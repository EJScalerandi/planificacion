// pages/admin/SchedulingRulesPage.jsx
//
// Fase 0/1 del motor de reglas de tiempo (en sombra): carga de estándares y
// reglas de desvío por etapa, más un preview que compara el tiempo_efectivo
// calculado contra el tiempo real ya registrado. No cambia nada de lo que ve
// el tablero operador — esta página es aditiva y solo la ve quien tenga el
// scope 'scheduling:admin'.
import { useEffect, useMemo, useState } from 'react';
import {
  clearAdminToken,
  getAdminToken,
  getWorkflowConfig,
  getWorkflowConditionFields,
  getSchedulingStandard,
  saveSchedulingStandard,
  getSchedulingRules,
  saveSchedulingRules,
  getSchedulingPreview,
  getSchedulingRegressionPreview,
} from '../../src/api';
import { Link, useNavigate } from 'react-router-dom';

const AR_TZ = 'America/Argentina/Buenos_Aires';
function fmtArDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('es-AR', {
      timeZone: AR_TZ,
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return String(iso);
  }
}

const CATEGORIES = [
  { key: 'intrinseca', label: 'Intrínseca' },
  { key: 'material', label: 'Material' },
  { key: 'humana', label: 'Humana' },
  { key: 'rotativa', label: 'Rotativa' },
  { key: 'tiempo', label: 'Tiempo' },
];
const OPERATORS = ['=', '!=', '>', '>=', '<', '<=', 'in', 'contains'];
const EFFECT_TYPES = [
  { key: 'percent', label: '% del punto de partida' },
  { key: 'fixed_minutes', label: 'Minutos fijos' },
  { key: 'multiplier', label: 'Multiplicador (x)' },
  { key: 'override', label: 'Override (fija el valor)' },
];
const COMBINE_MODES = [
  { key: 'independent', label: 'Independiente (contra el estándar)' },
  { key: 'cascade', label: 'Cascada (sobre el resultado anterior)' },
];

function newRuleRow(stageKey) {
  return {
    _localId: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    stage_key: stageKey || '',
    category: 'intrinseca',
    field: '',
    operator: '=',
    value: '',
    effect_type: 'percent',
    effect_value: 0,
    combine_mode: 'independent',
    sequence_order: null,
    enabled: true,
  };
}

export default function SchedulingRulesPage() {
  const nav = useNavigate();

  // Guard simple: si no hay token, afuera. Mismo patrón que WorkflowDesignerPage.
  useEffect(() => {
    const t = getAdminToken();
    if (!t) nav('/admin/login', { replace: true });
  }, [nav]);

  const [line, setLine] = useState('portones');
  const [loading, setLoading] = useState(true);
  const [savingStandards, setSavingStandards] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [err, setErr] = useState('');

  const [stages, setStages] = useState([]);
  const [conditionFields, setConditionFields] = useState([]);
  const [standards, setStandards] = useState([]); // [{stage_key, standard_minutes, notes}]
  const [rules, setRules] = useState([]);

  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewErr, setPreviewErr] = useState('');

  const [portonIdInput, setPortonIdInput] = useState('');
  const [fleetMode, setFleetMode] = useState('fleet'); // 'fleet' | 'isolated' — solo aplica sin porton_id
  const [regression, setRegression] = useState(null);
  const [regressionLoading, setRegressionLoading] = useState(false);
  const [regressionErr, setRegressionErr] = useState('');

  const regressionPortones = useMemo(() => {
    if (!regression) return [];
    if (Array.isArray(regression.portones)) return regression.portones;
    if (regression.id != null) return [regression];
    return [];
  }, [regression]);

  const stageOptions = useMemo(
    () => (stages || []).filter((s) => s.enabled !== false).map((s) => ({ key: s.status_col || s.key, label: s.label || s.key })),
    [stages]
  );

  const reload = async () => {
    setErr('');
    setLoading(true);
    try {
      const [wf, std, rl, fields] = await Promise.all([
        getWorkflowConfig(line),
        getSchedulingStandard(line),
        getSchedulingRules(line),
        getWorkflowConditionFields(line).catch(() => ({ fields: [] })),
      ]);
      setStages(wf.stages || []);
      setConditionFields(Array.isArray(fields?.fields) ? fields.fields : []);

      const stageKeys = (wf.stages || []).filter((s) => s.enabled !== false).map((s) => s.status_col || s.key);
      const byKey = new Map((std.standards || []).map((s) => [s.stage_key, s]));
      setStandards(stageKeys.map((k) => byKey.get(k) || { stage_key: k, standard_minutes: 0, notes: '' }));

      setRules((rl.rules || []).map((r) => ({ ...r, _localId: `db-${r.id}` })));
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    setPreview(null);
  }, [line]);

  const updateStandard = (stageKey, patch) => {
    setStandards((prev) => prev.map((s) => (s.stage_key === stageKey ? { ...s, ...patch } : s)));
  };

  const onSaveStandards = async () => {
    setErr('');
    try {
      setSavingStandards(true);
      await saveSchedulingStandard(
        line,
        standards.map((s) => ({
          stage_key: s.stage_key,
          standard_minutes: Number(s.standard_minutes) || 0,
          notes: s.notes || null,
        }))
      );
      alert('Estándares guardados.');
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setSavingStandards(false);
    }
  };

  const addRule = () => setRules((prev) => [...prev, newRuleRow(stageOptions[0]?.key)]);
  const removeRule = (localId) => setRules((prev) => prev.filter((r) => r._localId !== localId));
  const updateRule = (localId, patch) =>
    setRules((prev) => prev.map((r) => (r._localId === localId ? { ...r, ...patch } : r)));

  const onSaveRules = async () => {
    setErr('');
    try {
      setSavingRules(true);
      await saveSchedulingRules(
        line,
        rules.map((r) => ({
          stage_key: r.stage_key,
          category: r.category,
          field: r.field,
          operator: r.operator,
          value: r.operator === 'in' ? String(r.value || '').split(',').map((v) => v.trim()).filter(Boolean) : r.value,
          effect_type: r.effect_type,
          effect_value: Number(r.effect_value) || 0,
          combine_mode: r.combine_mode,
          sequence_order: r.combine_mode === 'cascade' ? Number(r.sequence_order) || 0 : null,
          enabled: r.enabled !== false,
        }))
      );
      await reload();
      alert('Reglas guardadas.');
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setSavingRules(false);
    }
  };

  const runPreview = async () => {
    setPreviewErr('');
    setPreviewLoading(true);
    try {
      const data = await getSchedulingPreview(line, 30);
      setPreview(data);
    } catch (e) {
      setPreviewErr(e?.response?.data?.error || e.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const runRegression = async () => {
    setRegressionErr('');
    setRegressionLoading(true);
    try {
      const id = portonIdInput.trim();
      const data = await getSchedulingRegressionPreview(line, id ? { porton_id: id } : { limit: 20, mode: fleetMode });
      setRegression(data);
    } catch (e) {
      setRegressionErr(e?.response?.data?.error || e.message);
    } finally {
      setRegressionLoading(false);
    }
  };

  const logout = () => {
    clearAdminToken();
    nav('/admin/login', { replace: true });
  };

  if (loading) return <div className="container">Cargando motor de reglas de tiempo…</div>;

  return (
    <div className="container" style={{ maxWidth: 1200 }}>
      <div className="header-row" style={{ alignItems: 'center' }}>
        <h2 className="h1">Motor de Reglas de Tiempo (Beta)</h2>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn" to="/admin">Volver</Link>
          <Link className="btn" to="/">Inicio</Link>

          <select className="btn" value={line} onChange={(e) => setLine(e.target.value)}>
            <option value="portones">Portones</option>
            <option value="ipanel">iPanels</option>
          </select>

          <button className="btn" onClick={reload}>Refrescar</button>
          <button className="btn" onClick={logout}>Salir</button>
        </div>
      </div>

      <div style={{ marginTop: 12, fontSize: 13, opacity: 0.75 }}>
        Modo sombra: nada de acá cambia lo que ve el tablero (<code>/board</code>) todavía — es solo
        cálculo y comparación. El tiempo efectivo de cada etapa sale de dos fases: primero se suman las
        reglas <b>independientes</b> contra el estándar puro, y ese resultado es el punto de partida para
        encadenar las reglas de <b>cascada</b>, en orden.
      </div>

      {err && <div style={{ color: 'crimson', fontWeight: 800, marginTop: 10 }}>{err}</div>}

      {/* ===== Estándares por etapa ===== */}
      <section style={{ marginTop: 20, border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Tiempo estándar por etapa</div>
          <button className="btn btn--brand" onClick={onSaveStandards} disabled={savingStandards}>
            {savingStandards ? 'Guardando…' : 'Guardar estándares'}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {standards.map((s) => (
            <div
              key={s.stage_key}
              style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr 2fr', gap: 8, alignItems: 'center' }}
            >
              <div>
                <b>{s.stage_key}</b>
              </div>
              <input
                className="btn"
                type="number"
                min="0"
                value={s.standard_minutes}
                onChange={(e) => updateStandard(s.stage_key, { standard_minutes: e.target.value })}
                placeholder="minutos"
              />
              <input
                className="btn"
                value={s.notes || ''}
                onChange={(e) => updateStandard(s.stage_key, { notes: e.target.value })}
                placeholder="Notas del perfil de referencia (ej. Coplanar, chapa lisa, 2000x2200mm)"
              />
            </div>
          ))}
        </div>
      </section>

      {/* ===== Reglas de desvío ===== */}
      <section style={{ marginTop: 20, border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Reglas de desvío</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={addRule}>+ Agregar regla</button>
            <button className="btn btn--brand" onClick={onSaveRules} disabled={savingRules}>
              {savingRules ? 'Guardando…' : 'Guardar reglas'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          {rules.length === 0 && <div style={{ fontSize: 13, opacity: 0.7 }}>Sin reglas todavía.</div>}

          {rules.map((r) => (
            <div key={r._localId} style={{ border: '1px dashed #d1d5db', borderRadius: 12, padding: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'center' }}>
                <select className="btn" value={r.stage_key} onChange={(e) => updateRule(r._localId, { stage_key: e.target.value })}>
                  <option value="">(etapa)</option>
                  {stageOptions.map((s) => (
                    <option key={s.key} value={s.key}>{s.label} ({s.key})</option>
                  ))}
                </select>

                <select className="btn" value={r.category} onChange={(e) => updateRule(r._localId, { category: e.target.value })}>
                  {CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>

                <select className="btn" value={r.combine_mode} onChange={(e) => updateRule(r._localId, { combine_mode: e.target.value })}>
                  {COMBINE_MODES.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>

                {r.combine_mode === 'cascade' ? (
                  <input
                    className="btn"
                    type="number"
                    value={r.sequence_order ?? ''}
                    onChange={(e) => updateRule(r._localId, { sequence_order: e.target.value })}
                    placeholder="orden"
                    title="Orden dentro de la cascada"
                  />
                ) : (
                  <div style={{ fontSize: 12, opacity: 0.6, alignSelf: 'center' }}>sin orden (independiente)</div>
                )}

                <button className="btn" type="button" onClick={() => removeRule(r._localId)}>Quitar</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.3fr .7fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'center', marginTop: 8 }}>
                <select className="btn" value={r.field} onChange={(e) => updateRule(r._localId, { field: e.target.value })}>
                  <option value="">(campo)</option>
                  {conditionFields.map((f) => (
                    <option key={f.key} value={f.key}>{f.label} ({f.key})</option>
                  ))}
                </select>

                <select className="btn" value={r.operator} onChange={(e) => updateRule(r._localId, { operator: e.target.value })}>
                  {OPERATORS.map((op) => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </select>

                <input
                  className="btn"
                  value={r.value ?? ''}
                  onChange={(e) => updateRule(r._localId, { value: e.target.value })}
                  placeholder={r.operator === 'in' ? 'valor1, valor2' : 'valor'}
                />

                <select className="btn" value={r.effect_type} onChange={(e) => updateRule(r._localId, { effect_type: e.target.value })}>
                  {EFFECT_TYPES.map((t) => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>

                <input
                  className="btn"
                  type="number"
                  value={r.effect_value}
                  onChange={(e) => updateRule(r._localId, { effect_value: e.target.value })}
                  placeholder="efecto"
                />

                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={r.enabled !== false}
                    onChange={(e) => updateRule(r._localId, { enabled: e.target.checked })}
                  />
                  Activa
                </label>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Preview: calculado vs. real ===== */}
      <section style={{ marginTop: 20, border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Preview: calculado vs. real</div>
          <button className="btn btn--brand" onClick={runPreview} disabled={previewLoading || line !== 'portones'}>
            {previewLoading ? 'Calculando…' : 'Correr preview (últimos 30 portones)'}
          </button>
        </div>

        {line !== 'portones' && (
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
            El preview de esta fase solo soporta la línea Portones.
          </div>
        )}
        {previewErr && <div style={{ color: 'crimson', marginTop: 8 }}>{previewErr}</div>}
        {preview?.warning && <div style={{ opacity: 0.7, marginTop: 8 }}>{preview.warning}</div>}

        {preview?.portones?.length > 0 && (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: 6 }}>NV</th>
                  <th style={{ textAlign: 'left', padding: 6 }}>Etapa</th>
                  <th style={{ textAlign: 'right', padding: 6 }}>Estándar</th>
                  <th style={{ textAlign: 'right', padding: 6 }}>Efectivo (calc.)</th>
                  <th style={{ textAlign: 'right', padding: 6 }}>Real</th>
                  <th style={{ textAlign: 'right', padding: 6 }}>Delta</th>
                </tr>
              </thead>
              <tbody>
                {preview.portones.flatMap((p) =>
                  p.stages.map((s) => (
                    <tr key={`${p.id}-${s.stage_key}`} style={{ borderTop: '1px solid #eee' }}>
                      <td style={{ padding: 6 }}>{p.nv}</td>
                      <td style={{ padding: 6 }}>{s.stage_key}</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>{s.standard_minutes}</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>{s.effective_minutes}</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>{s.real_minutes ?? '—'}</td>
                      <td style={{ padding: 6, textAlign: 'right', fontWeight: s.delta_vs_real != null && Math.abs(s.delta_vs_real) > 30 ? 800 : 400 }}>
                        {s.delta_vs_real ?? '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ===== Regresión: backward-pass desde fecha_plan_entrega (Fase 2a) ===== */}
      <section style={{ marginTop: 20, border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Regresión (calcular hacia atrás desde la fecha de despacho)</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              className="btn"
              style={{ width: 140 }}
              value={portonIdInput}
              onChange={(e) => setPortonIdInput(e.target.value)}
              placeholder="ID de portón (vacío = últimos 20 con fecha)"
            />
            {!portonIdInput.trim() && (
              <select className="btn" value={fleetMode} onChange={(e) => setFleetMode(e.target.value)} title="Cómo se reparte el cupo entre portones">
                <option value="fleet">Flota (cupo compartido)</option>
                <option value="isolated">Aislado (capacidad infinita, depuración)</option>
              </select>
            )}
            <button className="btn btn--brand" onClick={runRegression} disabled={regressionLoading || line !== 'portones'}>
              {regressionLoading ? 'Calculando…' : 'Calcular'}
            </button>
          </div>
        </div>

        {line !== 'portones' && (
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
            La regresión de esta fase solo soporta la línea Portones.
          </div>
        )}
        {regression?.mode === 'fleet' && (
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
            Modo flota: los portones compiten por el cupo diario real de cada recurso. Dos portones pueden mostrar
            horarios que se superponen dentro del mismo día — lo garantizado es que la suma de minutos por día no
            supera el cupo, no un orden de cola exacto dentro del día.
          </div>
        )}
        {regressionErr && <div style={{ color: 'crimson', marginTop: 8 }}>{regressionErr}</div>}

        {regressionPortones.map((p) => {
          const stages = p.stages ? Object.values(p.stages).sort((a, b) => new Date(a.latest_start) - new Date(b.latest_start)) : [];
          return (
            <div key={p.id} style={{ marginTop: 16, borderTop: '1px dashed #d1d5db', paddingTop: 12 }}>
              <div style={{ fontWeight: 800 }}>
                Portón {p.nv ?? p.id} <span style={{ opacity: 0.7, fontWeight: 400 }}>({p.sistema || 'sin sistema'})</span>
              </div>
              {p.warning && <div style={{ opacity: 0.7, fontSize: 13, marginTop: 4 }}>{p.warning}</div>}
              {p.error && <div style={{ color: 'crimson', fontSize: 13, marginTop: 4 }}>{p.error}</div>}
              {!!p.warnings?.length && (
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                  {p.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
                </div>
              )}
              {!!stages.length && (
                <div style={{ overflowX: 'auto', marginTop: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: 6 }}>Etapa</th>
                        <th style={{ textAlign: 'left', padding: 6 }}>Debe entrar</th>
                        <th style={{ textAlign: 'left', padding: 6 }}>Debe salir</th>
                        <th style={{ textAlign: 'right', padding: 6 }}>Min.</th>
                        <th style={{ textAlign: 'left', padding: 6 }}>Recurso</th>
                        <th style={{ textAlign: 'left', padding: 6 }}>Predecesores</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stages.map((s) => {
                        const atRisk = new Date(s.latest_start).getTime() < Date.now();
                        return (
                          <tr key={s.stage_key} style={{ borderTop: '1px solid #eee' }}>
                            <td style={{ padding: 6 }}>{s.stage_key}</td>
                            <td style={{ padding: 6, fontWeight: atRisk ? 800 : 400, color: atRisk ? 'crimson' : 'inherit' }}>
                              {fmtArDateTime(s.latest_start)} {atRisk ? '⚠' : ''}
                            </td>
                            <td style={{ padding: 6 }}>{fmtArDateTime(s.latest_finish)}</td>
                            <td style={{ padding: 6, textAlign: 'right' }}>{s.effective_minutes}</td>
                            <td style={{ padding: 6 }}>
                              {s.resource_key}
                              {s.resource_constrained && (
                                <span title="Se corrió por falta de cupo compartido con otro portón" style={{ marginLeft: 6, color: '#b45309' }}>
                                  ⏳
                                </span>
                              )}
                            </td>
                            <td style={{ padding: 6, opacity: 0.7 }}>{(s.predecessors || []).join(', ') || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}

        {!!regression?.ledger_summary?.length && (
          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>
              Cupo por recurso y día ({regression.ledger_summary.length})
            </summary>
            <div style={{ overflowX: 'auto', marginTop: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: 6 }}>Recurso</th>
                    <th style={{ textAlign: 'left', padding: 6 }}>Fecha</th>
                    <th style={{ textAlign: 'right', padding: 6 }}>Capacidad</th>
                    <th style={{ textAlign: 'right', padding: 6 }}>Consumido</th>
                    <th style={{ textAlign: 'right', padding: 6 }}>Restante</th>
                  </tr>
                </thead>
                <tbody>
                  {regression.ledger_summary.map((row) => (
                    <tr key={`${row.resource_key}-${row.date_key}`} style={{ borderTop: '1px solid #eee' }}>
                      <td style={{ padding: 6 }}>{row.resource_key}</td>
                      <td style={{ padding: 6 }}>{row.date_key}</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>{row.capacity_minutes}</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>{row.consumed_minutes}</td>
                      <td style={{ padding: 6, textAlign: 'right', fontWeight: row.remaining_minutes <= 0 ? 800 : 400 }}>{row.remaining_minutes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>
    </div>
  );
}

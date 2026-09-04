// pages/admin/SchedulingRulesNavPage.jsx
//
// Navegación de reglas de desvío (scheduling_time_rule) en dos sentidos,
// sobre exactamente los mismos datos que antes vivían en la lista plana de
// SchedulingRulesPage.jsx (que ahora solo linkea acá):
//   - Por sección: elegís una etapa (ej. Diseño) y ves sus reglas agrupadas
//     por las 5 categorías (intrínseca/material/humana/rotativa/tiempo).
//   - Por tipo de variante: elegís una categoría (ej. Humana) y ves TODAS
//     sus reglas de todas las secciones, cada una identificada con su etapa.
//
// Sin endpoints nuevos: se sigue usando GET/PUT /admin/scheduling/rules
// (trae/guarda la lista completa de la línea) — esto es pura reorganización
// de navegación sobre el mismo arreglo en memoria.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  clearAdminToken, getAdminToken,
  getWorkflowConfig, getWorkflowConditionFields,
  getSchedulingRules, saveSchedulingRules,
  getSchedulingResourceVariables,
} from '../../src/api';

const CATEGORIES = [
  { key: 'intrinseca', label: 'Intrínseca', hint: 'Propia del portón (medidas, sistema, doble inyección).' },
  { key: 'material', label: 'Material', hint: 'El insumo usado (símil madera vs. aluminio, cambio de rollo).' },
  { key: 'humana', label: 'Humana', hint: 'Disponibilidad o cantidad de personal en el sector.' },
  { key: 'rotativa', label: 'Rotativa', hint: 'Compara contra el portón anterior/siguiente en la cola.' },
  { key: 'tiempo', label: 'Tiempo', hint: 'Calendario de trabajo del recurso.' },
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

function newRuleRow({ stageKey = '', category = 'intrinseca' } = {}) {
  return {
    _localId: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    stage_key: stageKey, category, field: '', operator: '=', value: '',
    effect_type: 'percent', effect_value: 0, combine_mode: 'independent',
    sequence_order: null, enabled: true,
  };
}

export default function SchedulingRulesNavPage() {
  const nav = useNavigate();
  const line = 'portones'; // Fase 1 del preview también está acotada a esta línea

  useEffect(() => {
    const t = getAdminToken();
    if (!t) nav('/admin/login', { replace: true });
  }, [nav]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [stages, setStages] = useState([]);
  const [conditionFields, setConditionFields] = useState([]);
  const [resourceVariableFields, setResourceVariableFields] = useState([]); // [{key, resources: [resource_key,...]}]
  const [rules, setRules] = useState([]);

  // view: 'home' | 'sections' | 'section' | 'categories' | 'category'
  const [view, setView] = useState('home');
  const [activeStageKey, setActiveStageKey] = useState('');
  const [activeCategory, setActiveCategory] = useState('');

  const reload = async () => {
    setErr('');
    setLoading(true);
    try {
      const [wf, fields, rl, resVars] = await Promise.all([
        getWorkflowConfig(line),
        getWorkflowConditionFields(line).catch(() => ({ fields: [] })),
        getSchedulingRules(line),
        getSchedulingResourceVariables().catch(() => ({ variables: [] })),
      ]);
      setStages((wf.stages || []).filter((s) => s.enabled !== false).map((s) => ({ key: s.status_col || s.key, label: s.label || s.key })));
      setConditionFields(Array.isArray(fields?.fields) ? fields.fields : []);
      setRules((rl.rules || []).map((r) => ({ ...r, _localId: `db-${r.id}` })));

      // Une variables con el mismo key de distintos recursos en una sola
      // opción del selector (ej. "nivel_personal" puede existir en varios
      // recursos) — solo importa que el key exista en ALGÚN recurso.
      const byKey = new Map();
      for (const v of resVars.variables || []) {
        if (!byKey.has(v.key)) byKey.set(v.key, new Set());
        byKey.get(v.key).add(v.resource_key);
      }
      setResourceVariableFields([...byKey.entries()].map(([key, resources]) => ({ key, resources: [...resources] })).sort((a, b) => a.key.localeCompare(b.key)));
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); }, []);

  const stageLabel = (key) => stages.find((s) => s.key === key)?.label || key || '(sin etapa)';
  const categoryLabel = (key) => CATEGORIES.find((c) => c.key === key)?.label || key;

  const rulesByStage = useMemo(() => {
    const m = new Map();
    for (const r of rules) { if (!m.has(r.stage_key)) m.set(r.stage_key, []); m.get(r.stage_key).push(r); }
    return m;
  }, [rules]);
  const rulesByCategory = useMemo(() => {
    const m = new Map();
    for (const r of rules) { if (!m.has(r.category)) m.set(r.category, []); m.get(r.category).push(r); }
    return m;
  }, [rules]);

  const addRule = (overrides) => setRules((prev) => [...prev, newRuleRow(overrides)]);
  const removeRule = (localId) => setRules((prev) => prev.filter((r) => r._localId !== localId));
  const updateRule = (localId, patch) => setRules((prev) => prev.map((r) => (r._localId === localId ? { ...r, ...patch } : r)));

  const onSave = async () => {
    setErr('');
    setSaving(true);
    try {
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
      setSaving(false);
    }
  };

  const logout = () => { clearAdminToken(); nav('/admin/login', { replace: true }); };

  const goHome = () => { setView('home'); setActiveStageKey(''); setActiveCategory(''); };

  if (loading) return <div className="container">Cargando reglas…</div>;

  return (
    <div className="container" style={{ maxWidth: 1200 }}>
      <div className="header-row" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h2 className="h1">Reglas de Desvío</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn" to="/admin/scheduling">Motor de Reglas de Tiempo</Link>
          <Link className="btn" to="/admin/scheduling/gantt">Gantt</Link>
          <Link className="btn" to="/">Inicio</Link>
          <button className="btn btn--brand" onClick={onSave} disabled={saving}>{saving ? 'Guardando…' : 'Guardar todo'}</button>
          <button className="btn" onClick={logout}>Salir</button>
        </div>
      </div>

      {err && <div style={{ color: 'crimson', fontWeight: 700, marginTop: 10 }}>{err}</div>}

      {/* ---- Breadcrumb ---- */}
      {view !== 'home' && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, marginTop: 14, opacity: 0.8 }}>
          <button className="btn" onClick={goHome}>← Menú</button>
          {(view === 'section' || view === 'sections') && (
            <button className="btn" onClick={() => setView('sections')}>Por sección</button>
          )}
          {(view === 'category' || view === 'categories') && (
            <button className="btn" onClick={() => setView('categories')}>Por tipo de variante</button>
          )}
          {view === 'section' && <span>→ {stageLabel(activeStageKey)}</span>}
          {view === 'category' && <span>→ {categoryLabel(activeCategory)}</span>}
        </div>
      )}

      {/* ---- Home: menú de dos cards ---- */}
      {view === 'home' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 20 }}>
          <NavCard
            title="Reglas por sección"
            desc="Elegí una etapa (ej. Diseño) y mirá sus reglas agrupadas por tipo de variante."
            onClick={() => setView('sections')}
          />
          <NavCard
            title="Listado por tipo de variante"
            desc="Elegí un tipo (ej. Humana) y mirá todas sus reglas de todas las secciones, identificadas."
            onClick={() => setView('categories')}
          />
        </div>
      )}

      {/* ---- Lista de secciones ---- */}
      {view === 'sections' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginTop: 20 }}>
          {stages.map((s) => (
            <ListCard key={s.key} title={s.label} sub={s.key} count={(rulesByStage.get(s.key) || []).length} onClick={() => { setActiveStageKey(s.key); setView('section'); }} />
          ))}
        </div>
      )}

      {/* ---- Detalle de una sección: sus reglas agrupadas por categoría ---- */}
      {view === 'section' && (
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {CATEGORIES.map((cat) => {
            const rowsHere = (rulesByStage.get(activeStageKey) || []).filter((r) => r.category === cat.key);
            return (
              <section key={cat.key} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 15 }}>{cat.label}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{cat.hint}</div>
                  </div>
                  <button className="btn" onClick={() => addRule({ stageKey: activeStageKey, category: cat.key })}>+ Agregar regla</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                  {!rowsHere.length && <div style={{ fontSize: 13, opacity: 0.6 }}>Sin reglas {cat.label.toLowerCase()} para esta sección.</div>}
                  {rowsHere.map((r) => (
                    <RuleRow key={r._localId} rule={r} stages={stages} conditionFields={conditionFields} resourceVariableFields={resourceVariableFields} onUpdate={(patch) => updateRule(r._localId, patch)} onRemove={() => removeRule(r._localId)} lockCategory lockStage />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* ---- Lista de tipos de variante ---- */}
      {view === 'categories' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginTop: 20 }}>
          {CATEGORIES.map((c) => (
            <ListCard key={c.key} title={c.label} sub={c.hint} count={(rulesByCategory.get(c.key) || []).length} onClick={() => { setActiveCategory(c.key); setView('category'); }} />
          ))}
        </div>
      )}

      {/* ---- Detalle de un tipo de variante: todas sus reglas, identificadas por sección ---- */}
      {view === 'category' && (
        <section style={{ marginTop: 20, border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>{categoryLabel(activeCategory)} — todas las secciones</div>
            <button className="btn" onClick={() => addRule({ stageKey: stages[0]?.key, category: activeCategory })}>+ Agregar regla</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {!(rulesByCategory.get(activeCategory) || []).length && <div style={{ fontSize: 13, opacity: 0.7 }}>Sin reglas de este tipo todavía.</div>}
            {(rulesByCategory.get(activeCategory) || []).map((r) => (
              <RuleRow key={r._localId} rule={r} stages={stages} conditionFields={conditionFields} resourceVariableFields={resourceVariableFields} onUpdate={(patch) => updateRule(r._localId, patch)} onRemove={() => removeRule(r._localId)} lockCategory />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function NavCard({ title, desc, onClick }) {
  return (
    <button
      type="button" onClick={onClick}
      style={{
        textAlign: 'left', cursor: 'pointer', border: '2px solid var(--brand)', background: 'var(--surface)',
        borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 18, color: 'var(--brand-700)' }}>{title}</div>
      <div style={{ fontSize: 13.5, opacity: 0.75 }}>{desc}</div>
    </button>
  );
}

function ListCard({ title, sub, count, onClick }) {
  return (
    <button
      type="button" onClick={onClick}
      style={{
        textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface)',
        borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 4,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 14.5 }}>{title}</div>
        <span style={{ fontSize: 11.5, opacity: 0.6, whiteSpace: 'nowrap' }}>{count} regla{count === 1 ? '' : 's'}</span>
      </div>
      <div style={{ fontSize: 12, opacity: 0.65, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
    </button>
  );
}

// Fila de edición de una regla — misma forma de siempre (SchedulingRulesPage),
// con lockStage/lockCategory para ocultar el selector correspondiente cuando
// el contexto de navegación ya lo fija (sección o categoría activa).
function RuleRow({ rule: r, stages, conditionFields, resourceVariableFields, onUpdate, onRemove, lockStage, lockCategory }) {
  return (
    <div style={{ border: '1px dashed #d1d5db', borderRadius: 12, padding: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: `${lockStage ? '' : '1fr '}${lockCategory ? '' : '1fr '}1fr 1fr auto`, gap: 8, alignItems: 'center' }}>
        {!lockStage && (
          <select className="btn" value={r.stage_key} onChange={(e) => onUpdate({ stage_key: e.target.value })}>
            <option value="">(sección)</option>
            {stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        )}
        {!lockCategory && (
          <select className="btn" value={r.category} onChange={(e) => onUpdate({ category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        )}
        <select className="btn" value={r.combine_mode} onChange={(e) => onUpdate({ combine_mode: e.target.value })}>
          {COMBINE_MODES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        {r.combine_mode === 'cascade' ? (
          <input className="btn" type="number" value={r.sequence_order ?? ''} onChange={(e) => onUpdate({ sequence_order: e.target.value })} placeholder="orden" title="Orden dentro de la cascada" />
        ) : (
          <div style={{ fontSize: 12, opacity: 0.6, alignSelf: 'center' }}>sin orden (independiente)</div>
        )}
        <button className="btn" type="button" onClick={onRemove}>Quitar</button>
      </div>

      {lockStage && (
        <div style={{ fontSize: 11.5, opacity: 0.6, marginTop: 4 }}>Sección: {stages.find((s) => s.key === r.stage_key)?.label || r.stage_key}</div>
      )}
      {lockCategory && !lockStage && (
        <div style={{ fontSize: 11.5, opacity: 0.6, marginTop: 4 }}>Tipo: {CATEGORIES.find((c) => c.key === r.category)?.label || r.category}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr .7fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'center', marginTop: 8 }}>
        <select className="btn" value={r.field} onChange={(e) => onUpdate({ field: e.target.value })}>
          <option value="">(campo)</option>
          <optgroup label="Propiedad del portón">
            {conditionFields.map((f) => <option key={f.key} value={f.key}>{f.label} ({f.key})</option>)}
          </optgroup>
          {!!resourceVariableFields?.length && (
            <optgroup label="Variable del recurso">
              {resourceVariableFields.map((f) => <option key={f.key} value={f.key}>{f.key} — {f.resources.join(', ')}</option>)}
            </optgroup>
          )}
        </select>
        <select className="btn" value={r.operator} onChange={(e) => onUpdate({ operator: e.target.value })}>
          {OPERATORS.map((op) => <option key={op} value={op}>{op}</option>)}
        </select>
        <input className="btn" value={r.value ?? ''} onChange={(e) => onUpdate({ value: e.target.value })} placeholder={r.operator === 'in' ? 'valor1, valor2' : 'valor'} />
        <select className="btn" value={r.effect_type} onChange={(e) => onUpdate({ effect_type: e.target.value })}>
          {EFFECT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <input className="btn" type="number" value={r.effect_value} onChange={(e) => onUpdate({ effect_value: e.target.value })} placeholder="efecto" />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={r.enabled !== false} onChange={(e) => onUpdate({ enabled: e.target.checked })} />
          Activa
        </label>
      </div>
    </div>
  );
}

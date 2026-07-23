import { SECTION_KEYS, sectionLabel } from '../constants/sections';

// Arma un text[] ordenado de claves de sección (workflow_stages).
// El primer elemento es, por definición, la sección inicial.
export default function OrderedStagePicker({ value = [], onChange }) {
  const selected = Array.isArray(value) ? value : [];
  const available = SECTION_KEYS.filter((k) => !selected.includes(k));

  const add = (key) => onChange?.([...selected, key]);
  const remove = (idx) => onChange?.(selected.filter((_, i) => i !== idx));
  const move = (idx, dir) => {
    const next = selected.slice();
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange?.(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>Secciones disponibles (click para agregar)</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {available.map((k) => (
            <button key={k} type="button" className="btn" onClick={() => add(k)} style={{ fontSize: 12 }}>
              + {sectionLabel(k)}
            </button>
          ))}
          {available.length === 0 ? <span style={{ opacity: 0.6, fontSize: 12 }}>No quedan secciones por agregar.</span> : null}
        </div>
      </div>
      <div>
        <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>
          Workflow (orden de ejecución{selected.length ? ' · la 1ª es la sección inicial' : ''})
        </div>
        {selected.length === 0 ? (
          <div style={{ opacity: 0.7, fontSize: 13 }}>Todavía no agregaste ninguna sección.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {selected.map((k, idx) => (
              <div key={`${k}-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px' }}>
                <span style={{ fontWeight: 900, minWidth: 22 }}>{idx + 1}.</span>
                <span style={{ flex: 1 }}>{sectionLabel(k)}</span>
                <button type="button" className="btn" onClick={() => move(idx, -1)} disabled={idx === 0} title="Subir">↑</button>
                <button type="button" className="btn" onClick={() => move(idx, 1)} disabled={idx === selected.length - 1} title="Bajar">↓</button>
                <button type="button" className="btn" onClick={() => remove(idx)} title="Quitar" style={{ color: '#b91c1c' }}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

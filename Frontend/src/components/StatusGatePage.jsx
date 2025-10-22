import { useMemo, useState } from 'react';
import usePortones from '../hooks/usePortones';

const STAGES = [
  { key: 'diseno',          label: 'Diseño' },
  { key: 'armado_primario', label: 'Armado Primario' },
  { key: 'revestimiento',   label: 'Revestimiento' },
  { key: 'pintura',         label: 'Pintura' },
  { key: 'armado_final',    label: 'Armado Final' },
  { key: 'despacho',        label: 'Despacho' },
];

const COLORS = {
  'finalizado': '#32a852',
  'en proceso': '#e6c229',
  'pendiente':  '#f7b1b1',
  'default':    '#eee'
};

const NV_COL_W   = 150;
const GRID_GAP   = 6;
const CELL_PAD   = 8;
const CELL_MIN_H = 60;

function fmt(dt) {
  if (!dt) return '';
  try { return new Date(dt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return ''; }
}
function cellBg(status) {
  const s = (status || '').toLowerCase();
  return COLORS[s] || COLORS.default;
}

// 👉 helper: ¿todas las etapas en Finalizado?
const STAGE_KEYS = STAGES.map(s => s.key);
function isAllDone(p) {
  return STAGE_KEYS.every(k => (p[k] || '').toLowerCase() === 'finalizado');
}

export default function StatusGatePage() {
  const { data, loading, err, refresh, refreshing } = usePortones({ pollMs: 300000 });
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(null);

  const bordo = '#82000f';
  const cols = `${NV_COL_W}px repeat(${STAGES.length}, 1fr)`;

  const cellBase   = { border: `2px solid ${bordo}`, padding: CELL_PAD, boxSizing: 'border-box' };
  const headerCell = { ...cellBase, background: '#fafafa', fontWeight: 700, textAlign: 'center' };
  const nvCell     = { ...cellBase, background: '#fff', minHeight: CELL_MIN_H, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 2 };

  // 👉 Si NO hay filtro, oculto los "todo finalizado". Si HAY filtro, muestro todo y luego aplico la búsqueda.
  const list = useMemo(() => {
    const src = Array.isArray(data)
      ? ((filter === null || filter === '') ? data.filter(p => !isAllDone(p)) : data)
      : [];
    if (filter === null || filter === '') return src;
    const n = Number(filter);
    if (Number.isNaN(n)) return src;
    return src.filter(p => p.nv === n || p.nlista === n);
  }, [data, filter]);

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
        <h2 style={{ color: bordo, border: `3px solid ${bordo}`, padding: 8, margin: 0 }}>
          STATUS GATE
        </h2>
        <button onClick={refresh} disabled={refreshing} style={{ padding:'6px 10px', borderRadius:8 }}>
          {refreshing ? 'Actualizando…' : 'Refrescar'}
        </button>
      </div>

      {/* Buscador */}
      <form
        onSubmit={(e) => { e.preventDefault(); setFilter(q.trim()); }}
        style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0', flexWrap: 'wrap' }}
      >
        <input
          type="text"
          placeholder="Buscar por NV o NLista (número)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ padding: '8px 10px', border: `1px solid ${bordo}`, borderRadius: 8, minWidth: 260 }}
          inputMode="numeric"
        />
        <button type="submit" style={{ padding: '8px 12px' }}>Buscar</button>
        <button type="button" onClick={() => { setQ(''); setFilter(null); }} style={{ padding: '8px 12px' }}>
          Limpiar
        </button>
      </form>

      {loading && <div>Cargando…</div>}
      {err && <div style={{ color: 'crimson' }}>Error: {err}</div>}

      {/* Grid */}
      <div style={{ overflowX: 'auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: cols,
            columnGap: GRID_GAP,
            rowGap: GRID_GAP,
            alignItems: 'stretch',
            width: 'max-content'
          }}
        >
          {/* Header */}
          <div style={headerCell}>NV / Lista</div>
          {STAGES.map(s => (
            <div key={`h-${s.key}`} style={headerCell}>{s.label}</div>
          ))}

          {/* Filas */}
          {list.map(p => ([
            <div key={`nv-${p.id}`} style={nvCell}>
              <strong>NV {p.nv}</strong>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Lista {p.nlista}</div>
            </div>,
            ...STAGES.map(s => {
              const st  = p[s.key];
              const ini = p[`${s.key}_inicio`];
              const fin = p[`${s.key}_fin`];
              return (
                <div
                  key={`${p.id}-${s.key}`}
                  style={{
                    ...cellBase,
                    background: cellBg(st),
                    minHeight: CELL_MIN_H,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center'
                  }}
                  title={[
                    st ? `Estado: ${st}` : null,
                    ini ? `Inicio: ${fmt(ini)}` : null,
                    fin ? `Fin: ${fmt(fin)}` : null
                  ].filter(Boolean).join('\n')}
                >
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{st || ''}</div>
                  <div style={{ fontSize: 11 }}>{ini ? `Inicio: ${fmt(ini)}` : ''}</div>
                  <div style={{ fontSize: 11 }}>{fin ? `Fin: ${fmt(fin)}` : ''}</div>
                </div>
              );
            })
          ]))}

          {!loading && list.length === 0 && (
            <div style={{ gridColumn: `1 / span ${STAGES.length + 1}`, marginTop: 12, opacity: 0.7 }}>
              Sin resultados.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

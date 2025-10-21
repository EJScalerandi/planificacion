import { useMemo, useState } from 'react';
import usePortones from '../hooks/usePortones';

const STAGES = [
  { key: 'diseno',          label: 'Diseño' },
  { key: 'laser',           label: 'Laser' },
  { key: 'guillotina',      label: 'Corte' },
  { key: 'plegadora',       label: 'Plegado' },
  { key: 'armado_piernas',  label: 'Armado Piernas' },
  { key: 'armado_primario', label: 'Armado Primario' },
  { key: 'armado_hojas',    label: 'Armado Hojas' },
  { key: 'inyeccion',       label: 'Inyección' },
  { key: 'revestimiento',   label: 'Revestimiento' },
  { key: 'pintura',         label: 'Pintura' },
  { key: 'armado_final',    label: 'Armado Final' },
  { key: 'despacho',        label: 'Despacho' },
];

const COLORS = {
  'finalizado': '#32a852',  // verde
  'en proceso': '#e6c229',  // amarillo
  'pendiente':  '#f7b1b1',  // rojo suave
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

export default function StatusGatePage() {
  const { data, loading, err } = usePortones();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(null);

  const list = useMemo(() => {
    if (!Array.isArray(data)) return [];
    if (filter === null || filter === '') return data;
    const n = Number(filter);
    if (Number.isNaN(n)) return data;
    return data.filter(p => p.nv === n || p.nlista === n);
  }, [data, filter]);

  const bordo = '#82000f';
  const cols = `${NV_COL_W}px repeat(${STAGES.length}, 1fr)`;

  const cellBase   = { border: `2px solid ${bordo}`, padding: CELL_PAD, boxSizing: 'border-box' };
  const headerCell = { ...cellBase, background: '#fafafa', fontWeight: 700, textAlign: 'center' };
  const nvCell     = { ...cellBase, background: '#fff', minHeight: CELL_MIN_H, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 2 };

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ color: bordo, border: `3px solid ${bordo}`, padding: 8, maxWidth: 1100 }}>STATUS GATE</h2>

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

      {/* UN SOLO GRID: header + filas */}
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
            <div style={{ gridColumn: `1 / span ${STAGES.length + 1}`, marginTop: 12, opacity: 0.7 }}>Sin resultados.</div>
          )}
        </div>
      </div>
    </div>
  );
}

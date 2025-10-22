import { useMemo, useState } from 'react';
import usePortones from '../src/hooks/usePortones';

const STAGES = [
  { key: 'diseno',               label: 'Diseño' },
  { key: 'laser',                label: 'Laser' },
  { key: 'guillotina',           label: 'Corte' },
  { key: 'plegadora',            label: 'Plegado' },
  { key: 'armado_piernas',       label: 'Armado Piernas' },
  { key: 'armado_marco_piernas', label: 'Armado Marco Piernas' },
  { key: 'armado_hojas',         label: 'Armado Hojas' },
  { key: 'armado_primario',      label: 'Armado Primario' },
  { key: 'inyeccion',            label: 'Inyección' },
  { key: 'revestimiento',        label: 'Revestimiento' },
  { key: 'pintura',              label: 'Pintura' },
  { key: 'armado_final',         label: 'Armado Final' },
  { key: 'despacho',             label: 'Despacho' },
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
const bordo      = '#008241ff';

function fmt(dt) {
  if (!dt) return '';
  try { return new Date(dt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return ''; }
}
function cellBg(status) {
  const s = (status || '').toLowerCase();
  return COLORS[s] || COLORS.default;
}
function isSistema(porton) {
  return (porton.inyeccion || '').toLowerCase() === 'finalizado' &&
         (porton.revestimiento || '').toLowerCase() === 'finalizado';
}

// 👉 helper: todas las etapas finalizadas (incluye despacho)
const STAGE_KEYS = STAGES.map(s => s.key);
function isAllDone(p) {
  return STAGE_KEYS.every(k => (p[k] || '').toLowerCase() === 'finalizado');
}

export default function PlantaReadOnlyPage() {
  const { data, loading, err, refresh, refreshing } = usePortones({ pollMs: 300000 });

  // Métricas
  const terminadosEnPlanta = useMemo(() => {
    if (!Array.isArray(data)) return 0;
    return data.filter(p =>
      (p.armado_final || '').toLowerCase() === 'finalizado' &&
      (p.despacho     || '').toLowerCase() === 'pendiente'
    ).length;
  }, [data]);

  const FAB_KEYS = useMemo(
    () => STAGES.filter(s => s.key !== 'despacho').map(s => s.key),
    []
  );
  const enProcesoFabricacion = useMemo(() => {
    if (!Array.isArray(data)) return 0;
    return data.filter(p =>
      FAB_KEYS.some(k => (p[k] || '').toLowerCase() === 'en proceso')
    ).length;
  }, [data, FAB_KEYS]);

  // Buscador
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(null);

  // 👉 Si NO hay filtro, oculto los completamente finalizados; si HAY filtro, muestro todo y filtro por NV/NLista.
  const list = useMemo(() => {
    const src = Array.isArray(data)
      ? ((filter === null || filter === '') ? data.filter(p => !isAllDone(p)) : data)
      : [];
    if (filter === null || filter === '') return src;
    const n = Number(filter);
    if (Number.isNaN(n)) return src;
    return src.filter(p => p.nv === n || p.nlista === n);
  }, [data, filter]);

  const cols        = `${NV_COL_W}px repeat(${STAGES.length}, 1fr)`;
  const cellBase    = { border: `2px solid ${bordo}`, padding: CELL_PAD, boxSizing: 'border-box' };
  const headerCell  = { ...cellBase, background: '#fafafa', fontWeight: 700, textAlign: 'center' };
  const nvCell      = { ...cellBase, background: '#fff', minHeight: CELL_MIN_H, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexDirection: 'column' };

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      {/* Contadores a la izquierda + botón refrescar */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 360 }}>
          <div
            style={{ border: `3px solid ${bordo}`, padding: '14px 16px', borderRadius: 12, fontWeight: 900, fontSize: 22, background: '#fff8f8', textAlign: 'center' }}
            title="Armado Final = Finalizado y Despacho = Pendiente"
          >
            Portones terminados en planta: {terminadosEnPlanta}
          </div>
          <div
            style={{ border: `3px solid ${bordo}`, padding: '14px 16px', borderRadius: 12, fontWeight: 900, fontSize: 22, background: '#f7fff3', textAlign: 'center' }}
            title="Al menos una etapa en 'En Proceso' (excepto Despacho)"
          >
            Portones en proceso de fabricación: {enProcesoFabricacion}
          </div>
          <button onClick={refresh} disabled={refreshing} style={{ padding:'6px 10px', borderRadius:8 }}>
            {refreshing ? 'Actualizando…' : 'Refrescar'}
          </button>
        </div>

        <h2 style={{ color: bordo, border: `3px solid ${bordo}`, padding: 8, margin: 0 }}>
          PLANTA (Solo lectura)
        </h2>
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

      {/* Grilla solo lectura */}
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
          <div style={{ ...headerCell, textAlign: 'center' }}>NV / Lista</div>
          {STAGES.map(s => (
            <div key={`h-${s.key}`} style={{ ...headerCell, textAlign: 'center' }}>
              {s.label}
            </div>
          ))}

          {/* Filas */}
          {list.map(p => ([
            <div key={`nv-${p.id}`} style={nvCell}>
              <strong>NV {p.nv}</strong>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Lista {p.nlista}</div>
              {isSistema(p) && (
                <div style={{ fontSize: 11, background: '#eee', padding: '2px 8px', borderRadius: 999, border: '1px solid #ddd' }}>
                  Sistema
                </div>
              )}
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
                    justifyContent: 'center',
                    cursor: 'default'
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

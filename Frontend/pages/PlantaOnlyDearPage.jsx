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

const NV_COL_W   = 150;
const GRID_GAP   = 6;
const CELL_MIN_H = 60;
const bordo      = '#008241ff';

const fmt = dt => (dt ? new Date(dt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const cellBg = st => {
  const s = (st || '').toLowerCase();
  if (s === 'finalizado') return '#c9f2d7';
  if (s === 'en proceso') return '#ffe58a';
  if (s === 'pendiente')  return '#f7b1b1';
  return '#eee';
};

const isFullyFinished = p =>
  STAGES.every(s => (p[s.key] || '').toLowerCase() === 'finalizado');

export default function PlantaReadOnlyPage() {
  // datos (auto-refresh cada 5 min)
  const { data, loading, err, refresh, refreshing } = usePortones({ pollMs: 300000 });

  // métricas globales
  const terminadosEnPlanta = useMemo(() => {
    if (!Array.isArray(data)) return 0;
    return data.filter(p =>
      (p.armado_final || '').toLowerCase() === 'finalizado' &&
      (p.despacho     || '').toLowerCase() === 'pendiente'
    ).length;
  }, [data]);

  const fabKeys = useMemo(
    () => STAGES.filter(s => s.key !== 'despacho').map(s => s.key),
    []
  );
  const enProcesoFabricacion = useMemo(() => {
    if (!Array.isArray(data)) return 0;
    return data.filter(p => fabKeys.some(k => (p[k] || '').toLowerCase() === 'en proceso')).length;
  }, [data, fabKeys]);

  // buscador
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(null);

  // filtrar / ocultar totalmente finalizados si no hay filtro
  const baseList = useMemo(() => {
    if (!Array.isArray(data)) return [];
    const hasFilter = filter !== null && filter !== '';
    if (hasFilter) {
      const n = Number(filter);
      if (!Number.isNaN(n)) {
        return data.filter(p => p.nv === n || p.nlista === n);
      }
    }
    return data.filter(p => !isFullyFinished(p));
  }, [data, filter]);

  // ordenar por nlista -> nv
  const list = useMemo(() => {
    const arr = [...baseList];
    arr.sort((a, b) =>
      (a.nlista || 0) - (b.nlista || 0) ||
      (a.nv     || 0) - (b.nv     || 0)
    );
    return arr;
  }, [baseList]);

  // contadores por etapa (para los encabezados)
  const stageStats = useMemo(() => {
    const stats = {};
    STAGES.forEach(s => (stats[s.key] = { pend: 0, proc: 0 }));
    for (const p of list) {
      for (const s of STAGES) {
        const st = (p[s.key] || '').toLowerCase();
        if (st === 'pendiente')  stats[s.key].pend++;
        else if (st === 'en proceso') stats[s.key].proc++;
      }
    }
    return stats;
  }, [list]);

  // estilos base
  const cellBase   = { border: `2px solid ${bordo}`, padding: 8, borderRadius: 12, boxSizing: 'border-box' };
  const headerCell = { ...cellBase, background:'#fafafa', fontWeight:700, textAlign:'center' };
  const nvCell     = { ...cellBase, background:'#fff', minHeight:CELL_MIN_H, display:'flex', alignItems:'center', justifyContent:'center', gap:4, flexDirection:'column' };

  return (
    <div style={{ padding:16, fontFamily:'system-ui,sans-serif' }}>
      {/* header + refrescar */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16, flexWrap:'wrap' }}>
        <h2 className="h1" style={{ border:`3px solid ${bordo}` }}>PLANTA (Solo lectura)</h2>
        <button onClick={refresh} disabled={refreshing} className="btn">
          {refreshing ? 'Actualizando…' : 'Refrescar'}
        </button>

        {/* métricas globales */}
        <div style={{ display:'flex', flexDirection:'column', gap:8, minWidth:280 }}>
          <div className="metric metric--warn">Portones terminados en planta: {terminadosEnPlanta}</div>
          <div className="metric metric--ok">Portones en proceso de fabricación: {enProcesoFabricacion}</div>
        </div>
      </div>

      {/* buscador */}
      <form
        onSubmit={(e)=>{ e.preventDefault(); setFilter(q.trim()); }}
        style={{ display:'flex', gap:8, alignItems:'center', margin:'12px 0', flexWrap:'wrap' }}
      >
        <input
          type="text"
          placeholder="Buscar por NV o NLista (número)"
          value={q}
          onChange={(e)=>setQ(e.target.value)}
          className="btn"
          style={{ minWidth:260 }}
          inputMode="numeric"
        />
        <button type="submit" className="btn">Buscar</button>
        <button type="button" className="btn" onClick={()=>{ setQ(''); setFilter(null); }}>
          Limpiar
        </button>
      </form>

      {loading && <div>Cargando…</div>}
      {err && <div style={{ color:'crimson' }}>Error: {err}</div>}

      {/* grilla SOLO LECTURA */}
      <div style={{ overflowX:'auto' }}>
        <div
          style={{
            display:'grid',
            gridTemplateColumns: `${NV_COL_W}px repeat(${STAGES.length}, 1fr)`,
            columnGap: GRID_GAP,
            rowGap: GRID_GAP,
            alignItems:'stretch',
            width:'max-content'
          }}
        >
          {/* encabezado */}
          <div style={{ ...headerCell, textAlign:'center' }}>NV / Lista</div>
          {STAGES.map(s => (
            <div key={`h-${s.key}`} style={{ ...headerCell, textAlign:'center' }}>
              <div>{s.label}</div>
              <div style={{ fontSize:12, opacity:.75 }}>
                Pendientes: {stageStats[s.key].pend} · En Proceso: {stageStats[s.key].proc}
              </div>
            </div>
          ))}

          {/* filas */}
          {list.map(p => ([
            <div key={`nv-${p.id}`} style={nvCell}>
              <strong>N° Portón {p.nlista}</strong>
              <strong>NV {p.nv}</strong>
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
                    display:'flex',
                    flexDirection:'column',
                    justifyContent:'center',
                    cursor:'default'        // ← sin edición
                  }}
                  title={[
                    st ? `Estado: ${st}` : null,
                    ini ? `Inicio: ${fmt(ini)}` : null,
                    fin ? `Fin: ${fmt(fin)}` : null
                  ].filter(Boolean).join('\n')}
                >
                  <div style={{ fontSize:12, fontWeight:700 }}>{st || ''}</div>
                  <div style={{ fontSize:11 }}>{ini ? `Inicio: ${fmt(ini)}` : ''}</div>
                  <div style={{ fontSize:11 }}>{fin ? `Fin: ${fmt(fin)}` : ''}</div>
                </div>
              );
            })
          ]))}

          {!loading && list.length === 0 && (
            <div style={{ gridColumn:`1 / span ${STAGES.length + 1}`, marginTop:12, opacity:.7 }}>
              Sin resultados.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

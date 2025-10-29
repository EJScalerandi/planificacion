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
  if (s === 'finalizado') return 'var(--state-done)';
  if (s === 'en proceso') return 'var(--state-process)';
  if (s === 'pendiente')  return 'var(--state-pending)';
  return 'var(--surface-muted)';
};
const cellInk = st => {
  const s = (st || '').toLowerCase();
  if (s === 'finalizado') return 'var(--state-done-ink)';
  if (s === 'en proceso') return 'var(--state-process-ink)';
  if (s === 'pendiente')  return 'var(--state-pending-ink)';
  return 'var(--ink)';
};

const isFullyFinished = p =>
  STAGES.every(s => (p[s.key] || '').toLowerCase() === 'finalizado');

export default function PlantaReadOnlyPage() {
  const { data, loading, err, refresh, refreshing } = usePortones({ pollMs: 300000 });

  // claves de fabricación (excluye despacho)
  const fabKeys = useMemo(() => STAGES.filter(s => s.key !== 'despacho').map(s => s.key), []);

  // métricas
  const terminadosEnPlanta = useMemo(() => {
    if (!Array.isArray(data)) return 0;
    return data.filter(p =>
      (p.armado_final || '').toLowerCase() === 'finalizado' &&
      (p.despacho     || '').toLowerCase() === 'pendiente'
    ).length;
  }, [data]);

  // en cola de fabricación (ninguna etapa en proceso ni finalizada)
  const enColaFabricacion = useMemo(() => {
    if (!Array.isArray(data)) return 0;
    return data.filter(p =>
      fabKeys.every(k => {
        const st = (p[k] || '').toLowerCase();
        return st === '' || st === 'pendiente';
      })
    ).length;
  }, [data, fabKeys]);

  // en proceso = total cargados − terminados en planta − en cola
  const enProcesoFabricacion = useMemo(() => {
    if (!Array.isArray(data)) return 0;
    const total = data.length;
    return Math.max(0, total - terminadosEnPlanta - enColaFabricacion);
  }, [data, terminadosEnPlanta, enColaFabricacion]);

  // Partidas con al menos una etapa "En Proceso"
  const partidasEnProceso = useMemo(() => {
    if (!Array.isArray(data)) return [];
    const set = new Set();
    for (const p of data) {
      const anyProc = fabKeys.some(k => (p[k] || '').toLowerCase() === 'en proceso');
      if (anyProc && p.partida != null) set.add(p.partida);
    }
    return Array.from(set).sort((a,b) => Number(a) - Number(b));
  }, [data, fabKeys]);

  // buscador
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(null);

  // base (oculta totalmente finalizados si no hay filtro)
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

  // contadores por etapa (encabezados)
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

  // ---- Sticky helpers ----
  const stickyTop    = { position: 'sticky', top: 0, zIndex: 5, background: 'var(--surface)' };
  const stickyLeft   = { position: 'sticky', left: 0, zIndex: 4, background: 'var(--surface)', boxShadow: '1px 0 0 rgba(0,0,0,.08)' };
  const stickyCorner = { position: 'sticky', top: 0, left: 0, zIndex: 6, background: 'var(--surface)' };

  // estilos base
  const cellBase   = { border: `2px solid ${bordo}`, padding: 8, borderRadius: 12, boxSizing: 'border-box' };
  const headerCell = { ...cellBase, background:'#fafafa', fontWeight:700, textAlign:'center' };
  const nvCell     = { ...cellBase, background:'#fff', minHeight:CELL_MIN_H, display:'flex', alignItems:'center', justifyContent:'center', gap:4, flexDirection:'column' };

  // chips estilos
  const chip = {
    display:'inline-flex', alignItems:'center', gap:6,
    padding:'6px 10px', borderRadius:999,
    background:'var(--surface-muted)', color:'var(--ink)',
    border:'1px solid #e5e7eb', fontWeight:800, fontSize:40
  };

  return (
    <div className="screen page" style={{ fontFamily:'system-ui,sans-serif' }}>
      <div className="page__header" style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16, flexWrap:'wrap' }}>
        {/* Título + visor de partidas */}
        <div style={{ display:'flex', flexDirection:'column', gap:8, minWidth:280 }}>
          <h2 className="h1" style={{ border:`3px solid ${bordo}` }}>PLANTA (Solo lectura)</h2>

          {/* ===== Visor Partidas en Proceso ===== */}
          <div style={{
            display:'flex', alignItems:'center', gap:8, flexWrap:'wrap',
            padding:'6px 8px', background:'var(--surface)', border:'1px dashed #e5e7eb', borderRadius:10
          }}>
            <span style={{ fontWeight:800 }}>Partidas en proceso:</span>
            {partidasEnProceso.length === 0 ? (
              <span style={{ ...chip, opacity:.7 }}>—</span>
            ) : (
              partidasEnProceso.map(n => (
                <span key={n} style={chip}>{n}</span>
              ))
            )}
          </div>
        </div>

        <button onClick={refresh} disabled={refreshing} className="btn">
          {refreshing ? 'Actualizando…' : 'Refrescar'}
        </button>

        <div style={{ display:'flex', flexDirection:'column', gap:8, minWidth:280 }}>
          <div className="metric metric--warn">Portones terminados en planta: {terminadosEnPlanta}</div>
          <div className="metric metric--ok">Portones en proceso de fabricación: {enProcesoFabricacion}</div>
          <div className="metric" style={{ background: 'rgba(239,68,68,0.15)' /* rojo suave */ }}>
            Portones en cola de fabricación: {enColaFabricacion}
          </div>
        </div>
      </div>

      <form
        onSubmit={(e)=>{ e.preventDefault(); setFilter(q.trim()); }}
        className="page__header" style={{ display:'flex', gap:8, alignItems:'center', marginTop:-8, flexWrap:'wrap', paddingTop:0 }}
      >
        <input type="text" placeholder="Buscar por NV o NLista (número)" value={q} onChange={(e)=>setQ(e.target.value)} className="btn" style={{ minWidth:260 }} inputMode="numeric" />
        <button type="submit" className="btn">Buscar</button>
        <button type="button" className="btn" onClick={()=>{ setQ(''); setFilter(null); }}>Limpiar</button>
      </form>

      {loading && <div className="page__header">Cargando…</div>}
      {err && <div className="page__header" style={{ color:'crimson' }}>Error: {err}</div>}

      <div className="grid-scroll">
        <div
          style={{
            display:'grid',
            gridTemplateColumns: `${NV_COL_W}px repeat(${STAGES.length}, 1fr)`,
            columnGap: GRID_GAP,
            rowGap: GRID_GAP,
            alignItems:'stretch',
            width:'max-content',
            padding:16
          }}
        >
          <div style={{ ...headerCell, ...stickyCorner, textAlign:'center' }}>NV / Lista / Partida</div>
          {STAGES.map(s => (
            <div key={`h-${s.key}`} style={{ ...headerCell, ...stickyTop, textAlign:'center' }}>
              <div>{s.label}</div>
              <div style={{ fontSize:12, opacity:.75 }}>
                Pendientes: {stageStats[s.key].pend} · En Proceso: {stageStats[s.key].proc}
              </div>
            </div>
          ))}

          {list.map(p => ([
            <div key={`nv-${p.id}`} style={{ ...nvCell, ...stickyLeft }}>
              <strong>N° Portón {p.nlista}</strong>
              <strong>N° Partida {p.partida}</strong>
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
                    color: cellInk(st),
                    minHeight: CELL_MIN_H,
                    display:'flex',
                    flexDirection:'column',
                    justifyContent:'center',
                    cursor:'default'
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

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

const ABBR = {
  diseno: 'Di', laser: 'La', guillotina: 'Co', plegadora: 'Pl',
  armado_piernas: 'AP', armado_marco_piernas: 'AMP', armado_hojas: 'AH',
  armado_primario: 'APr', inyeccion: 'In', revestimiento: 'Rv',
  pintura: 'Pi', armado_final: 'AF', despacho: 'De',
};

const NV_COL_W     = 120;
const FECHA_COL_W  = 120;
const GRID_GAP     = 3;
const CELL_MIN_H   = 24;
// ⬇️ Indicadores: un poco más largos y responsivos (ajustan con el ancho de pantalla)
const RECT_W       = 'clamp(18px, 2.6vw, 36px)';
const RECT_H       = 'clamp(14px, 1.6vw, 20px)';
const bordo        = '#008241ff';

const dateOnly = v => (v ? String(v).slice(0, 10) : '');
const isFullyFinished = p => STAGES.every(s => (p[s.key] || '').toLowerCase() === 'finalizado');

const startOfToday = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const daysUntil = (ymd) => {
  if (!ymd) return null;
  const target = new Date(`${dateOnly(ymd)}T00:00:00`);
  const diffMs = target.getTime() - startOfToday().getTime();
  return Math.ceil(diffMs / 86400000);
};
function getPlanIndicator(p) {
  const fecha = dateOnly(p.fecha_plan);
  if (!fecha) return { color: '#d1d5db', label: 'Sin fecha', days: null, title: 'Sin fecha planificada' };
  const apFinished = (p.armado_primario || '').toLowerCase() === 'finalizado';
  const d = daysUntil(fecha);
  if (apFinished) return { color: '#16a34a', label: 'OK', days: d, title: `Entrega planificada ${fecha} · Armado Primario finalizado` };
  if (d !== null && d <= 7) return { color: '#ef4444', label: 'Urgente', days: d, title: `Faltan ${d} día(s) · Armado Primario no finalizado` };
  if (d !== null && d <= 10 && d >= 8) return { color: '#eab308', label: 'Atento', days: d, title: `Faltan ${d} día(s) · Armado Primario no finalizado` };
  return { color: '#16a34a', label: 'OK', days: d, title: `Faltan ${d} día(s) para ${fecha}` };
}

const stageBgColor = st => {
  const s = (st || '').toLowerCase();
  if (s === 'pendiente')  return '#ef4444';
  if (s === 'en proceso') return '#eab308';
  if (s === 'finalizado') return '#16a34a';
  return 'var(--surface-muted)';
};

export default function PlantaReadOnlySimplePage() {
  const { data, loading, err, refresh, refreshing } = usePortones({ pollMs: 300000 });

  const fabKeys = useMemo(() => STAGES.filter(s => s.key !== 'despacho').map(s => s.key), []);

  const terminadosEnPlanta = useMemo(() => {
    if (!Array.isArray(data)) return 0;
    return data.filter(p =>
      (p.armado_final || '').toLowerCase() === 'finalizado' &&
      (p.despacho     || '').toLowerCase() === 'pendiente'
    ).length;
  }, [data]);

  const enColaFabricacion = useMemo(() => {
    if (!Array.isArray(data)) return 0;
    return data.filter(p =>
      fabKeys.every(k => {
        const st = (p[k] || '').toLowerCase();
        return st === '' || st === 'pendiente';
      })
    ).length;
  }, [data, fabKeys]);

  const enProcesoFabricacion = useMemo(() => {
    if (!Array.isArray(data)) return 0;
    const low = (v) => (v || '').toLowerCase();
    return data.filter(p => {
      const af   = low(p.armado_final);
      const dis  = low(p.diseno);
      const afOk  = af === 'pendiente' || af === 'en proceso';
      const disOk = dis === 'en proceso' || dis === 'finalizado';
      return afOk && disOk;
    }).length;
  }, [data]);

  const partidasEnProceso = useMemo(() => {
    if (!Array.isArray(data)) return [];
    const set = new Set();
    for (const p of data) {
      const anyProc = fabKeys.some(k => (p[k] || '').toLowerCase() === 'en proceso');
      if (anyProc && p.partida != null) set.add(p.partida);
    }
    return Array.from(set).sort((a,b) => Number(a) - Number(b));
  }, [data, fabKeys]);

  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(null);

  const baseList = useMemo(() => {
    if (!Array.isArray(data)) return [];
    const hasFilter = filter !== null && filter !== '';
    if (hasFilter) {
      const n = Number(filter);
      if (!Number.isNaN(n)) return data.filter(p => p.nv === n || p.nlista === n);
    }
    return data.filter(p => !isFullyFinished(p));
  }, [data, filter]);

  // ordenar: con fecha primero (más urgentes arriba), luego nlista -> nv
  const list = useMemo(() => {
    const arr = [...baseList];
    arr.sort((a, b) => {
      const aHas = !!dateOnly(a.fecha_plan);
      const bHas = !!dateOnly(b.fecha_plan);
      if (aHas !== bHas) return aHas ? -1 : 1;
      if (aHas && bHas) {
        const da = daysUntil(dateOnly(a.fecha_plan));
        const db = daysUntil(dateOnly(b.fecha_plan));
        const na = da === null ? Number.POSITIVE_INFINITY : da;
        const nb = db === null ? Number.POSITIVE_INFINITY : db;
        if (na !== nb) return na - nb;
      }
      return ((a.nlista || 0) - (b.nlista || 0)) || ((a.nv || 0) - (b.nv || 0));
    });
    return arr;
  }, [baseList]);

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

  const stickyTop    = { position: 'sticky', top: 0, zIndex: 5, background: 'var(--surface)' };
  const stickyLeft   = { position: 'sticky', left: 0, zIndex: 4, background: 'var(--surface)', boxShadow: '1px 0 0 rgba(0,0,0,.08)' };
  const stickyCorner = { position: 'sticky', top: 0, left: 0, zIndex: 6, background: 'var(--surface)' };

  const cellBase   = { border: `1px solid ${bordo}`, borderRadius: 8, boxSizing: 'border-box' };
  const headerCell = { ...cellBase, background:'#fafafa', fontWeight:800, textAlign:'center', padding: 4, lineHeight: 1.05 };
  const headerAbbr = { fontSize: 12, letterSpacing: .2 };
  const headerMini = { fontSize: 10, opacity:.8, marginTop: 2 };

  const nvCell     = { ...cellBase, background:'#fff', minHeight:CELL_MIN_H, display:'flex', alignItems:'center', justifyContent:'center', gap:2, flexDirection:'column', padding: 4, lineHeight: 1.05 };

  const stageCell  = { ...cellBase, minHeight: CELL_MIN_H, height: CELL_MIN_H, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent' };
  const stageRect = (bg) => ({
    width: RECT_W,
    height: RECT_H,
    background: bg,
    borderRadius: 6,
    boxShadow: '0 0 0 1px rgba(0,0,0,.10) inset',
    flex: '0 0 auto'
  });

  const chipSmall = {
    display:'inline-flex', alignItems:'center', justifyContent:'center',
    padding:'2px 6px', borderRadius:999, background:'var(--surface-muted)',
    border:'1px solid #e5e7eb', fontWeight:800, fontSize:11, lineHeight:1
  };

  return (
    <div className="screen page" style={{ fontFamily:'system-ui,sans-serif' }}>
      <div className="page__header" style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8, flexWrap:'wrap' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:6, minWidth:260 }}>
          <h2 className="h1" style={{ border:`2px solid ${bordo}`, padding:'4px 6px', fontSize:18, lineHeight:1 }}>PLANTA (Simple)</h2>

          <div style={{ padding:'4px 6px', background:'var(--surface)', border:'1px dashed #e5e7eb', borderRadius:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
              <span style={{ fontWeight:800, fontSize:12 }}>Partidas en proceso:</span>
              <span style={{ display:'inline-flex', alignItems:'center', padding:'2px 6px', borderRadius:999, background:'var(--surface-muted)', border:'1px solid #e5e7eb', fontWeight:800, fontSize:12 }}>
                {partidasEnProceso.length}
              </span>
            </div>
            <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:4, maxWidth:520 }}>
              {partidasEnProceso.length
                ? partidasEnProceso.map(n => <span key={n} style={chipSmall}>{n}</span>)
                : <span style={{ opacity:.6, fontSize:11 }}>—</span>}
            </div>
          </div>
        </div>

        <button onClick={refresh} disabled={refreshing} className="btn" style={{ height:28 }}>
          {refreshing ? 'Actualizando…' : 'Refrescar'}
        </button>

        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          <div className="metric metric--warn" style={{ fontSize:12 }}>Term. en planta: {terminadosEnPlanta}</div>
          <div className="metric metric--ok"   style={{ fontSize:12 }}>En proceso: {enProcesoFabricacion}</div>
          <div className="metric" style={{ background: 'rgba(239,68,68,0.15)', fontSize:12 }}>
            En cola: {enColaFabricacion}
          </div>
        </div>
      </div>

      <form
        onSubmit={(e)=>{ e.preventDefault(); setFilter(q.trim()); }}
        className="page__header" style={{ display:'flex', gap:6, alignItems:'center', marginTop:-6, flexWrap:'wrap', paddingTop:0 }}
      >
        <input
          type="text"
          placeholder="Buscar por NV o NLista"
          value={q}
          onChange={(e)=>setQ(e.target.value)}
          className="btn"
          style={{ minWidth:180, height:26, fontSize:12 }}
          inputMode="numeric"
        />
        <button type="submit" className="btn" style={{ height:26, fontSize:12 }}>Buscar</button>
        <button type="button" className="btn" style={{ height:26, fontSize:12 }} onClick={()=>{ setQ(''); setFilter(null); }}>Limpiar</button>
      </form>

      {loading && <div className="page__header">Cargando…</div>}
      {err && <div className="page__header" style={{ color:'crimson' }}>Error: {err}</div>}

      <div className="grid-scroll">
        <div
          style={{
            display:'grid',
            // ⬇️ 100% de ancho + columnas de etapas que se estiran suavemente
            gridTemplateColumns: `${NV_COL_W}px ${FECHA_COL_W}px repeat(${STAGES.length}, minmax(54px, 1fr))`,
            columnGap: GRID_GAP, rowGap: GRID_GAP, alignItems:'stretch',
            width:'100%', padding:8
          }}
        >
          {/* Headers */}
          <div style={{ ...headerCell, ...stickyCorner, textAlign:'center' }}>NV / Lista / Partida</div>
          <div style={{ ...headerCell, ...stickyTop, textAlign:'center' }}>
            <div style={headerAbbr}>Plan</div><div style={headerMini}>fecha</div>
          </div>
          {STAGES.map(s => (
            <div key={`h-${s.key}`} style={{ ...headerCell, ...stickyTop, textAlign:'center' }}>
              <div style={headerAbbr}>{ABBR[s.key] || s.label}</div>
              <div style={{ fontSize:10, opacity:.8 }}>proc. {stageStats[s.key].proc}</div>
            </div>
          ))}

          {/* Filas */}
          {list.map(p => {
            const plan = getPlanIndicator(p);
            const fechaTxt = dateOnly(p.fecha_plan)
              ? new Date(`${dateOnly(p.fecha_plan)}T00:00:00`).toLocaleDateString('es-AR')
              : '—';

            return ([
              <div key={`nv-${p.id}`} style={{ ...nvCell, ...stickyLeft, fontSize:12 }}>
                <strong>Portón {p.nlista}</strong>
                <span style={{ opacity:.9 }}>Partida {p.partida}</span>
                <span style={{ opacity:.8 }}>NV {p.nv}</span>
              </div>,

              <div
                key={`fecha-${p.id}`}
                style={{ ...cellBase, minHeight: CELL_MIN_H, height: CELL_MIN_H, padding: 2, display:'flex', alignItems:'center', justifyContent:'center' }}
                title={plan.title}
              >
                <div style={{ display:'grid', gridAutoFlow:'row', placeItems:'center', lineHeight:1, gap:2 }}>
                  <div style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                    <span
                      aria-label={`Indicador ${plan.label}`}
                      style={{ width:12, height:12, minWidth:12, borderRadius:999, background: plan.color, boxShadow:'0 0 0 1px rgba(0,0,0,.08) inset' }}
                    />
                    <strong style={{ fontSize:11 }}>{fechaTxt}</strong>
                  </div>
                  {plan.days !== null && (
                    <div style={{ fontSize:9, opacity:.7 }}>
                      {plan.days >= 0 ? `Faltan ${plan.days}d` : `${Math.abs(plan.days)}d venc.`}
                    </div>
                  )}
                </div>
              </div>,

              ...STAGES.map(s => {
                const st = p[s.key];
                return (
                  <div key={`${p.id}-${s.key}`} style={stageCell}>
                    <div style={stageRect(stageBgColor(st))} />
                  </div>
                );
              })
            ]);
          })}

          {!loading && list.length === 0 && (
            <div style={{ gridColumn:`1 / span ${STAGES.length + 2}`, marginTop:6, opacity:.7 }}>
              Sin resultados.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

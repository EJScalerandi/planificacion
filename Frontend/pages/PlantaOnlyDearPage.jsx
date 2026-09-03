import { useMemo, useState } from 'react';
import usePortones from '../src/hooks/usePortones';

const STAGES = [
  { key: 'diseno',               label: 'Diseño' },
  { key: 'laser_dintel',         label: 'Laser tubos Dintel' },
  { key: 'laser_hojas',          label: 'Laser tubos Hojas' },
  { key: 'laser_brazos_espada',  label: 'Laser tubos Brazos y Espada' },

  // Corte
  { key: 'guillotina',           label: 'Corte (Piernas)' },
  { key: 'corte_revest',         label: 'Corte (Revestimiento)' },

  // Plegado
  { key: 'plegadora',            label: 'Plegado (Piernas)' },
  { key: 'plegado_revest',       label: 'Plegado (Revestimiento)' },

  // Armados
  { key: 'armado_piernas',       label: 'Armado Piernas' },
  { key: 'armado_marco_piernas', label: 'Armado Marco Piernas' },
  { key: 'armado_hojas',         label: 'Armado Hojas' },
  { key: 'armado_primario',      label: 'Armado Primario' },

  // Sistema / pintura
  { key: 'inyeccion',            label: 'Inyección' },
  { key: 'revestimiento',        label: 'Revestimiento' },
  { key: 'pintura',              label: 'Pintura' },

  { key: 'armado_final',         label: 'Armado Final' },
  { key: 'despacho',             label: 'Despacho' },
];

const NV_COL_W     = 150;
const FECHA_COL_W  = 190;     // ⬅️ nueva columna “Entrega planificada”
const GRID_GAP     = 6;
const CELL_MIN_H   = 60;
const bordo        = '#008241ff';

const fmt = dt => (dt ? new Date(dt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const dateOnly = v => (v ? String(v).slice(0, 10) : '');

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

// ===== Helpers semáforo =====
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const daysUntil = (ymd) => {
  if (!ymd) return null;
  const target = new Date(`${dateOnly(ymd)}T00:00:00`);
  const today0 = startOfToday();
  const diffMs = target.getTime() - today0.getTime();
  return Math.ceil(diffMs / 86400000); // días que faltan (negativo si vencido)
};

function getPlanIndicator(p) {
  const fecha = dateOnly(p.fecha_plan);
  if (!fecha) {
    return { color: '#d1d5db', label: 'Sin fecha', days: null, title: 'Sin fecha planificada' }; // gris
  }

  const apFinished = (p.armado_primario || '').toLowerCase() === 'finalizado';
  const d = daysUntil(fecha);

  // Si Armado Primario está finalizado -> siempre verde
  if (apFinished) {
    return { color: '#16a34a', label: 'OK', days: d, title: `Entrega planificada ${fecha} · Armado Primario finalizado` };
  }

  // ✅ ROJO: 7 días o menos (incluye vencidos)
  if (d !== null && d <= 7) {
    return { color: '#ef4444', label: 'Urgente', days: d, title: `Faltan ${d} día(s) · Armado Primario no finalizado` };
  }

  // ✅ AMARILLO: entre 15 y 8 días (inclusive)
  if (d !== null && d <= 15 && d >= 8) {
    return { color: '#eab308', label: 'Atento', days: d, title: `Faltan ${d} día(s) · Armado Primario no finalizado` };
  }

  // VERDE: resto de los casos (fecha asignada y >15 días)
  return { color: '#16a34a', label: 'OK', days: d, title: `Faltan ${d} día(s) para ${fecha}` };
}

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

  // en proceso (según lógica original)
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

  // ordenar: primero con fecha (más urgentes arriba), luego nlista -> nv
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

      return (
        (a.nlista || 0) - (b.nlista || 0) ||
        (a.nv     || 0) - (b.nv     || 0)
      );
    });

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
          <div className="metric" style={{ background: 'rgba(239,68,68,0.15)' }}>
            Portones en cola de fabricación: {enColaFabricacion}
          </div>
        </div>
      </div>
            <br></br>
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
            // ⬇️ agregamos la nueva columna de fecha antes de todas las etapas
            gridTemplateColumns: `${NV_COL_W}px ${FECHA_COL_W}px repeat(${STAGES.length}, 1fr)`,
            columnGap: GRID_GAP,
            rowGap: GRID_GAP,
            alignItems:'stretch',
            width:'max-content',
            padding:16
          }}
        >
          {/* Encabezados */}
          <div style={{ ...headerCell, ...stickyCorner, textAlign:'center' }}>
            NV / Lista / Partida
          </div>

          <div style={{ ...headerCell, ...stickyTop, textAlign:'center' }}>
            Entrega planificada
          </div>

          {STAGES.map(s => (
            <div key={`h-${s.key}`} style={{ ...headerCell, ...stickyTop, textAlign:'center' }}>
              <div>{s.label}</div>
              <div style={{ fontSize:12, opacity:.75 }}>
                Pendientes: {stageStats[s.key].pend} · En Proceso: {stageStats[s.key].proc}
              </div>
            </div>
          ))}

          {/* Filas */}
          {list.map(p => {
            const plan = getPlanIndicator(p);
            const fechaTxt = dateOnly(p.fecha_plan)
              ? new Date(`${dateOnly(p.fecha_plan)}T00:00:00`).toLocaleDateString('es-AR')
              : '—';

            return ([
              <div key={`nv-${p.id}`} style={{ ...nvCell, ...stickyLeft }}>
                <strong>N° Portón {p.nlista}</strong>
                <strong>N° Partida {p.partida}</strong>
                <strong>NV {p.nv}</strong>
              </div>,

              // Celda: fecha + semáforo
              <div key={`fecha-${p.id}`} style={{ ...cellBase, minHeight: CELL_MIN_H, display:'flex', alignItems:'center', justifyContent:'space-between', gap:10 }}>
                <div title={plan.title} style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span
                    aria-label={`Indicador ${plan.label}`}
                    title={plan.title}
                    style={{
                      width:18, height:18, minWidth:18,
                      borderRadius:999,
                      background: plan.color,
                      boxShadow:'0 0 0 2px rgba(0,0,0,.08) inset'
                    }}
                  />
                  <strong>{fechaTxt}</strong>
                </div>
                {/* opcional: muestra días restantes si hay fecha */}
                {plan.days !== null && (
                  <span style={{ fontSize:12, opacity:.75 }}>
                    {plan.days >= 0 ? `Faltan ${plan.days} días` : `${Math.abs(plan.days)} d vencido`}
                  </span>
                )}
              </div>,

              // Celdas de etapas (solo lectura)
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
            ]);
          })}

          {!loading && list.length === 0 && (
            <div style={{ gridColumn:`1 / span ${STAGES.length + 2}`, marginTop:12, opacity:.7 }}>
              Sin resultados.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

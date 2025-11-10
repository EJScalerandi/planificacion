// src/pages/IpanelReadOnlyPage.jsx
import { useMemo, useState } from 'react';
import useIpanels from '../src/hooks/useIpanels';

const STAGES = [
  { key: 'guillotina', label: 'Corte' },
  { key: 'plegado',    label: 'Plegado' },
  { key: 'pintura',    label: 'Pintura' },
  { key: 'inyeccion',  label: 'Inyección' },
  { key: "despacho", label: "despacho"},
];

const NV_COL_W        = 150;
const FECHA_PROD_W   = 170;   // ⬅️ nueva columna “Producción”
const FECHA_PLAN_W   = 190;   // ⬅️ nueva columna “Entrega planificada”
const GRID_GAP       = 6;
const CELL_MIN_H     = 60;
const bordo          = '#008241ff';

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

const isFullyFinished = row =>
  STAGES.every(s => (row[s.key] || '').toLowerCase() === 'finalizado');

// ===== Helpers de fechas para “Entrega planificada” (sin semáforo) =====
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

export default function IpanelReadOnlyPage() {
  const { data, loading, err, refresh, refreshing } = useIpanels({ pollMs: 300000 });

  // Métricas
  const terminados = useMemo(() => {
    if (!Array.isArray(data)) return 0;
    return data.filter(isFullyFinished).length;
  }, [data]);

  // “En cola” = todos los estados vacíos o "Pendiente"
  const enCola = useMemo(() => {
    if (!Array.isArray(data)) return 0;
    return data.filter(p =>
      STAGES.every(k => {
        const st = (p[k.key] || '').toLowerCase();
        return st === '' || st === 'pendiente';
      })
    ).length;
  }, [data]);

  // “En proceso” = total − terminados − en cola
  const enProceso = useMemo(() => {
    if (!Array.isArray(data)) return 0;
    return Math.max(0, data.length - terminados - enCola);
  }, [data, terminados, enCola]);

  // Partidas con al menos una etapa “En Proceso”
  const partidasEnProceso = useMemo(() => {
    if (!Array.isArray(data)) return [];
    const set = new Set();
    for (const p of data) {
      const anyProc = STAGES.some(k => (p[k.key] || '').toLowerCase() === 'en proceso');
      if (anyProc && p.partida != null) set.add(p.partida);
    }
    return Array.from(set).sort((a,b) => Number(a) - Number(b));
  }, [data]);

  // Buscador
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(null);

  // Base: ocultar totalmente finalizados si no hay filtro
  const baseList = useMemo(() => {
    if (!Array.isArray(data)) return [];
    const hasFilter = filter !== null && filter !== '';
    if (hasFilter) {
      const n = Number(filter);
      if (!Number.isNaN(n)) {
        // Buscar por NV o Partida
        return data.filter(p => (p.nv ?? 0) === n || (p.partida ?? 0) === n);
      }
    }
    return data.filter(p => !isFullyFinished(p));
  }, [data, filter]);

  // Ordenar por Partida -> NV -> id
  const list = useMemo(() => {
    const arr = [...baseList];
    arr.sort((a, b) =>
      (a.partida || 0) - (b.partida || 0) ||
      (a.nv      || 0) - (b.nv      || 0) ||
      String(a.id).localeCompare(String(b.id))
    );
    return arr;
  }, [baseList]);

  // Contadores por etapa (para encabezados)
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

  // Sticky helpers
  const stickyTop    = { position: 'sticky', top: 0, zIndex: 5, background: 'var(--surface)' };
  const stickyLeft   = { position: 'sticky', left: 0, zIndex: 4, background: 'var(--surface)', boxShadow: '1px 0 0 rgba(0,0,0,.08)' };
  const stickyCorner = { position: 'sticky', top: 0, left: 0, zIndex: 6, background: 'var(--surface)' };

  // estilos base
  const cellBase   = { border: `2px solid ${bordo}`, padding: 8, borderRadius: 12, boxSizing: 'border-box' };
  const headerCell = { ...cellBase, background:'#fafafa', fontWeight:700, textAlign:'center' };
  const nvCell     = { ...cellBase, background:'#fff', minHeight:CELL_MIN_H, display:'flex', alignItems:'center', justifyContent:'center', gap:4, flexDirection:'column' };

  // chips (visor partidas)
  const chip = {
    display:'inline-flex', alignItems:'center', gap:8,
    padding:'10px 14px', borderRadius:999,
    background:'var(--surface-muted)', color:'var(--ink)',
    border:'1px solid #e5e7eb', fontWeight:900, fontSize:40
  };

  return (
    <div className="screen page" style={{ fontFamily:'system-ui,sans-serif' }}>
      <div className="page__header" style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16, flexWrap:'wrap' }}>
        {/* Título + visor de partidas */}
        <div style={{ display:'flex', flexDirection:'column', gap:8, minWidth:280 }}>
          <h2 className="h1" style={{ border:`3px solid ${bordo}` }}>IPANEL (Solo lectura)</h2>

          <div style={{
            display:'flex', alignItems:'center', gap:10, flexWrap:'wrap',
            padding:'8px 10px', background:'var(--surface)', border:'1px dashed #e5e7eb', borderRadius:10
          }}>
            <span style={{ fontWeight:900, fontSize:18 }}>Partidas en proceso:</span>
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
          <div className="metric metric--warn">Ipanels terminados en planta: {terminados}</div>
          <div className="metric metric--ok">Ipanels en proceso de fabricación: {enProceso}</div>
          <div className="metric" style={{ background: 'rgba(239,68,68,0.15)' }}>
            Ipanels en cola de fabricación: {enCola}
          </div>
        </div>
      </div>

      {/* Buscar por NV o Partida */}
      <form
        onSubmit={(e)=>{ e.preventDefault(); setFilter(q.trim()); }}
        className="page__header" style={{ display:'flex', gap:8, alignItems:'center', marginTop:-8, flexWrap:'wrap', paddingTop:0 }}
      >
        <input
          type="text"
          placeholder="Buscar por NV o Partida (número)"
          value={q}
          onChange={(e)=>setQ(e.target.value)}
          className="btn"
          style={{ minWidth:260 }}
          inputMode="numeric"
        />
        <button type="submit" className="btn">Buscar</button>
        <button type="button" className="btn" onClick={()=>{ setQ(''); setFilter(null); }}>Limpiar</button>
      </form>

      {loading && <div className="page__header">Cargando…</div>}
      {err && <div className="page__header" style={{ color:'crimson' }}>Error: {err}</div>}

      <div className="grid-scroll">
        <div
          style={{
            display:'grid',
            // ⬇️ agregamos 2 columnas: Producción y Entrega planificada
            gridTemplateColumns: `${NV_COL_W}px ${FECHA_PROD_W}px ${FECHA_PLAN_W}px repeat(${STAGES.length}, 1fr)`,
            columnGap: GRID_GAP,
            rowGap: GRID_GAP,
            alignItems:'stretch',
            width:'max-content',
            padding:16
          }}
        >
          {/* Encabezado */}
          <div style={{ ...headerCell, ...stickyCorner, textAlign:'center' }}>NV / Partida</div>

          <div style={{ ...headerCell, ...stickyTop, textAlign:'center' }}>
            Producción
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
            const prodYmd  = dateOnly(p.fecha_prod);
            const planYmd  = dateOnly(p.fecha_plan); // puede no existir en iPanel → muestra “—”
            const prodTxt  = prodYmd ? new Date(`${prodYmd}T00:00:00`).toLocaleDateString('es-AR') : '—';
            const planTxt  = planYmd ? new Date(`${planYmd}T00:00:00`).toLocaleDateString('es-AR') : '—';
            const planDays = daysUntil(planYmd); // null si no hay fecha

            return ([
              <div key={`nv-${p.id}`} style={{ ...nvCell, ...stickyLeft }}>
                <strong>NV {p.nv ?? '—'}</strong>
                <strong>N° Partida {p.partida ?? '—'}</strong>
              </div>,

              // Celda Producción (fecha_prod)
              <div key={`prod-${p.id}`} style={{ ...cellBase, minHeight: CELL_MIN_H, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:4 }}>
                <strong>{prodTxt}</strong>
                <div style={{ fontSize:11, opacity:.7 }}>
                  {prodYmd ? `(${prodYmd})` : 'Sin fecha de producción'}
                </div>
              </div>,

              // Celda Entrega planificada (fecha_plan) + cálculo de días (sin semáforo)
              <div key={`plan-${p.id}`} style={{ ...cellBase, minHeight: CELL_MIN_H, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:4 }}>
                <strong>{planTxt}</strong>
                <div style={{ fontSize:11, opacity:.7 }}>
                  {planYmd
                    ? (planDays >= 0
                        ? `Faltan ${planDays} día${planDays === 1 ? '' : 's'}`
                        : `Vencido hace ${Math.abs(planDays)} día${Math.abs(planDays) === 1 ? '' : 's'}`)
                    : 'Sin fecha planificada'}
                </div>
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
            <div style={{ gridColumn:`1 / span ${STAGES.length + 3}`, marginTop:12, opacity:.7 }}>
              Sin resultados.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

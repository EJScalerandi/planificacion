import { useMemo, useState } from 'react';
import usePortones from '../src/hooks/usePortones';
import useIpanels from '../src/hooks/useIpanels';
import {
  createPorton, startStage, stopStage,
  createIpanel, startIpanelStage, stopIpanelStage
} from '../src/api';
import { isAuthed, login, logout } from '../src/auth/createGateAuth';

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

const IPANEL_STAGE_KEYS = ['guillotina', 'plegado', 'pintura', 'inyeccion'];

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
  return 'var(--surface)';
};
const cellInk = st => {
  const s = (st || '').toLowerCase();
  if (s === 'finalizado') return 'var(--state-done-ink)';
  if (s === 'en proceso') return 'var(--state-process-ink)';
  if (s === 'pendiente')  return 'var(--state-pending-ink)';
  return 'var(--ink)';
};

const isPortonFullyFinished = p =>
  STAGES.every(s => (p[s.key] || '').toLowerCase() === 'finalizado');

const isIpanelFullyFinished = ip =>
  IPANEL_STAGE_KEYS.every(k => (ip[k] || '').toLowerCase() === 'finalizado');

const isSistema = p =>
  (p.inyeccion || '').toLowerCase() === 'finalizado' &&
  (p.revestimiento || '').toLowerCase() === 'finalizado';

export default function CreateGatePage() {
  // ---- Login simple ----
  const [authed, setAuthed] = useState(isAuthed());
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [authErr, setAuthErr] = useState('');

  if (!authed) {
    return (
      <div className="screen page" style={{ display:'grid', placeItems:'center', background:'#f7fff3', fontFamily:'system-ui,sans-serif' }}>
        <form
          onSubmit={(e) => { e.preventDefault(); if (login(user.trim(), pass)) { setAuthed(true); setAuthErr(''); setPass(''); } else setAuthErr('Usuario o contraseña inválidos'); }}
          style={{ width:340, display:'flex', flexDirection:'column', gap:10, border:`3px solid ${bordo}`, borderRadius:12, padding:18, background:'var(--surface)' }}
        >
          <h3 style={{ margin:0, color:bordo, textAlign:'center' }}>Acceso CreateGate</h3>
          <input placeholder="Usuario" value={user} onChange={e=>setUser(e.target.value)} autoFocus className="btn" />
          <input type="password" placeholder="Contraseña" value={pass} onChange={e=>setPass(e.target.value)} className="btn" />
          {authErr && <div style={{ color:'crimson', fontSize:13 }}>{authErr}</div>}
          <button type="submit" className="btn btn--brand" style={{ fontWeight:700, borderRadius:8 }}>Entrar</button>
        </form>
      </div>
    );
  }

  // ---- Data ----
  const { data: portones, loading, err, replaceItem, refresh, refreshing } = usePortones({ pollMs: 300000 });
  const { data: ipanels,  loading: loadingI, err: errI, refresh: refreshI, refreshing: refreshingI, replaceItem: replaceI } = useIpanels({ pollMs: 300000 });

  // Filtro de tipo (Todos | Portones | iPanel)
  const [kindFilter, setKindFilter] = useState('all'); // 'all' | 'porton' | 'ipanel'

  // Claves de fabricación (excluye despacho) para métricas de portones
  const fabKeys = useMemo(() => STAGES.filter(s => s.key !== 'despacho').map(s => s.key), []);

  // ===== Métricas PORTONES =====
  const terminadosEnPlanta = useMemo(() => {
    if (!Array.isArray(portones)) return 0;
    return portones.filter(p =>
      (p.armado_final || '').toLowerCase() === 'finalizado' &&
      (p.despacho     || '').toLowerCase() === 'pendiente'
    ).length;
  }, [portones]);

  const enColaFabricacion = useMemo(() => {
    if (!Array.isArray(portones)) return 0;
    return portones.filter(p =>
      fabKeys.every(k => {
        const st = (p[k] || '').toLowerCase();
        return st === '' || st === 'pendiente';
      })
    ).length;
  }, [portones, fabKeys]);

  const enProcesoFabricacion = useMemo(() => {
    if (!Array.isArray(portones)) return 0;
    const total = portones.length;
    return Math.max(0, total - terminadosEnPlanta - enColaFabricacion);
  }, [portones, terminadosEnPlanta, enColaFabricacion]);

  // ===== Métricas iPANELS =====
  const ipFabKeys = IPANEL_STAGE_KEYS;

  const ipTerm = useMemo(() => {
    if (!Array.isArray(ipanels)) return 0;
    return ipanels.filter(isIpanelFullyFinished).length;
  }, [ipanels]);

  const ipCola = useMemo(() => {
    if (!Array.isArray(ipanels)) return 0;
    return ipanels.filter(ip =>
      ipFabKeys.every(k => {
        const st = (ip[k] || '').toLowerCase();
        return st === '' || st === 'pendiente';
      })
    ).length;
  }, [ipanels]);

  const ipProc = useMemo(() => {
    if (!Array.isArray(ipanels)) return 0;
    const total = ipanels.length;
    return Math.max(0, total - ipTerm - ipCola);
  }, [ipanels, ipTerm, ipCola]);

  const ipPartidasEnProceso = useMemo(() => {
    if (!Array.isArray(ipanels)) return [];
    const set = new Set();
    for (const ip of ipanels) {
      const anyProc = ipFabKeys.some(k => (ip[k] || '').toLowerCase() === 'en proceso');
      if (anyProc && ip.partida != null) set.add(ip.partida);
    }
    return Array.from(set).sort((a,b) => Number(a) - Number(b));
  }, [ipanels]);

  // ---- Crear ----
  const [nv, setNv] = useState('');
  const [nlista, setNlista] = useState('');
  const [partida, setPartida] = useState('');
  const [sistemaOnCreate, setSistemaOnCreate] = useState(false);
  const [requiresInjection, setRequiresInjection] = useState(false);

  // Crear PORTÓN
  async function handleCreate(e) {
    e.preventDefault();
    const nNv = Number(nv), nNl = Number(nlista), nPa = Number(partida);
    if (![nNv, nNl].every(Number.isInteger)) { alert('Ingresá NV y NLista como enteros.'); return; }
    if (!Number.isInteger(nPa)) { alert('Ingresá NPartida como entero.'); return; }
    try {
      const { data: created } = await createPorton({ nv: nNv, nlista: nNl, partida: nPa });

      if (!requiresInjection) {
        await stopStage(created.id, 'inyeccion');
      }
      if (sistemaOnCreate) {
        await stopStage(created.id, 'inyeccion');
        await stopStage(created.id, 'revestimiento');
      }

      setNv(''); setNlista(''); setPartida(''); setSistemaOnCreate(false); setRequiresInjection(false);
      await Promise.all([refresh(), refreshI()]);
    } catch (e) { alert(e?.response?.data?.error || e.message); }
  }

  // Crear IPANEL (sólo NV; partida opcional)
  async function handleCreateIpanel() {
    const nNv = Number(nv);
    const nPa = partida !== '' ? Number(partida) : null;
    if (!Number.isInteger(nNv)) { alert('Ingresá NV como entero.'); return; }
    try {
      const payload = nPa === null ? { nv: nNv } : { nv: nNv, partida: nPa };
      await createIpanel(payload);
      setNv(''); setNlista(''); setPartida('');
      await refreshI();
    } catch (e) { alert(e?.response?.data?.error || e.message); }
  }

  // ---- Buscar ----
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(null);

  // Combinar portones + ipanels con marca de tipo
  const combined = useMemo(() => {
    const P = (Array.isArray(portones) ? portones : []).map(p => ({ ...p, kind: 'porton' }));
    const I = (Array.isArray(ipanels)  ? ipanels  : []).map(i => ({ ...i, kind: 'ipanel' }));
    return [...P, ...I];
  }, [portones, ipanels]);

  // Filtro por tipo (kindFilter)
  const byKind = useMemo(() => {
    if (kindFilter === 'porton') return combined.filter(x => x.kind === 'porton');
    if (kindFilter === 'ipanel') return combined.filter(x => x.kind === 'ipanel');
    return combined;
  }, [combined, kindFilter]);

  // Filtrado por buscador + ocultar totalmente finalizados (sin filtro numérico)
  const baseList = useMemo(() => {
    const src = byKind;
    if (!Array.isArray(src)) return [];
    const hasFilter = filter !== null && filter !== '';
    if (hasFilter) {
      const n = Number(filter);
      if (!Number.isNaN(n)) {
        return src.filter(p => {
          if (p.kind === 'porton') return p.nv === n || p.nlista === n;
          return p.nv === n; // iPanel: sólo NV
        });
      }
    }
    return src.filter(p => {
      if (p.kind === 'porton') return !isPortonFullyFinished(p);
      return !isIpanelFullyFinished(p);
    });
  }, [byKind, filter]);

  // Orden: Portones por nlista->nv; iPanels por partida->nv (y si mezclamos, portones primero)
  const list = useMemo(() => {
    const arr = [...baseList];
    arr.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'porton' ? -1 : 1;
      if (a.kind === 'porton') {
        return (a.nlista || 0) - (b.nlista || 0) || (a.nv || 0) - (b.nv || 0);
      }
      return (a.partida ?? Number.MAX_SAFE_INTEGER) - (b.partida ?? Number.MAX_SAFE_INTEGER)
           || (a.nv || 0) - (b.nv || 0);
    });
    return arr;
  }, [baseList]);

  // Contadores por etapa (encabezados) sobre lo visible
  const stageStats = useMemo(() => {
    const stats = {};
    STAGES.forEach(s => (stats[s.key] = { pend: 0, proc: 0 }));
    for (const p of list) {
      for (const s of STAGES) {
        const st = (p[s.key] || '').toLowerCase();
        if (!st) continue; // iPanel no tiene todas las etapas
        if (st === 'pendiente')  stats[s.key].pend++;
        else if (st === 'en proceso') stats[s.key].proc++;
      }
    }
    return stats;
  }, [list]);

  // Clicks por celda
  async function handleCellClick(p, s) {
    const status = (p[s.key] || '').toLowerCase();
    const clickable = status === 'pendiente' || status === 'en proceso';
    if (p.kind === 'ipanel' && !IPANEL_STAGE_KEYS.includes(s.key)) return;
    if (!clickable) return;

    try {
      if (p.kind === 'porton') {
        if (status === 'pendiente') {
          if (confirm(`¿Iniciar "${s.label}" para NV ${p.nv}?`)) {
            const { data: upd } = await startStage(p.id, s.key); replaceItem(upd);
          }
        } else if (status === 'en proceso') {
          if (confirm(`¿Finalizar "${s.label}" para NV ${p.nv}?`)) {
            const { data: upd } = await stopStage(p.id, s.key); replaceItem(upd);
          }
        }
      } else {
        if (status === 'pendiente') {
          if (confirm(`¿Iniciar "${s.label}" (iPanel) para NV ${p.nv}?`)) {
            const { data: upd } = await startIpanelStage(p.id, s.key); replaceI(upd);
          }
        } else if (status === 'en proceso') {
          if (confirm(`¿Finalizar "${s.label}" (iPanel) para NV ${p.nv}?`)) {
            const { data: upd } = await stopIpanelStage(p.id, s.key); replaceI(upd);
          }
        }
      }
    } catch (e) { alert(e?.response?.data?.error || e.message); }
  }

  // ---- Exportar a XLSX (sobre lo visible) ----
  async function handleExportXlsx() {
    const xlsxMod = await import('xlsx');
    const XLSX = xlsxMod.default || xlsxMod;

    const header = [
      'Tipo', 'NV', 'Lista', 'Partida',
      ...STAGES.flatMap(s => [`${s.label} - Estado`, `${s.label} - Inicio`, `${s.label} - Fin`])
    ];

    const rows = list.map(p => {
      const fila = [
        p.kind === 'ipanel' ? 'iPanel' : 'Portón',
        p.nv ?? '',
        p.kind === 'porton' ? (p.nlista ?? '') : '',
        p.partida ?? ''
      ];
      for (const s of STAGES) {
        const st  = p[s.key] || '';
        const ini = p[`${s.key}_inicio`] ? fmt(p[`${s.key}_inicio`]) : '';
        const fin = p[`${s.key}_fin`]    ? fmt(p[`${s.key}_fin`])    : '';
        fila.push(st, ini, fin);
      }
      return fila;
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws['!cols'] = [
      { wch: 8 },  // Tipo
      { wch: 8 },  // NV
      { wch: 10 }, // Lista
      { wch: 10 }, // Partida
      ...STAGES.flatMap(() => [{ wch: 16 }, { wch: 20 }, { wch: 20 }])
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Producción');

    const pad = n => String(n).padStart(2, '0');
    const now = new Date();
    const fname = `produccion_${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.xlsx`;
    XLSX.writeFile(wb, fname);
  }

  // Sticky helpers
  const stickyTop    = { position: 'sticky', top: 0, zIndex: 5, background: 'var(--surface)' };
  const stickyLeft   = { position: 'sticky', left: 0, zIndex: 4, background: 'var(--surface)', boxShadow: '1px 0 0 rgba(0,0,0,.08)' };
  const stickyCorner = { position: 'sticky', top: 0, left: 0, zIndex: 6, background: 'var(--surface)' };

  // Render styles
  const cellBase   = { border: `2px solid ${bordo}`, padding: 8, borderRadius: 12, boxSizing: 'border-box' };
  const headerCell = { ...cellBase, background:'var(--surface)', fontWeight:700, textAlign:'center' };
  const nvCell     = { ...cellBase, background:'var(--surface)', minHeight:CELL_MIN_H, display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, paddingLeft:10, paddingRight:10 };

  const loadingAny = loading || loadingI;
  const errorAny = err || errI;

  // Chip grande para partidas iPanel
  const chip = {
    display:'inline-flex', alignItems:'center', gap:6,
    padding:'6px 10px', borderRadius:999,
    background:'var(--surface-muted)', color:'var(--ink)',
    border:'1px solid #e5e7eb', fontWeight:800, fontSize:40
  };

  return (
    <div className="screen page" style={{ fontFamily:'system-ui,sans-serif' }}>
      {/* Header */}
      <div className="page__header" style={{ display:'flex', justifyContent:'space-between', alignItems:'stretch', gap:16, flexWrap:'wrap' }}>
        {/* Controles */}
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button onClick={() => { refresh(); refreshI(); }} disabled={refreshing || refreshingI} className="btn">
              {refreshing || refreshingI ? 'Actualizando…' : 'Refrescar'}
            </button>
            <button
              onClick={handleExportXlsx}
              disabled={loadingAny || (list?.length ?? 0) === 0}
              className="btn"
              title="Exporta lo visible en la grilla"
            >
              Exportar XLSX
            </button>
          </div>
          <h2 className="h1" style={{ border:`3px solid ${bordo}`, width:'max-content' }}>PORTONES / iPANELS</h2>
          <button onClick={()=>{ logout(); setAuthed(false); }} className="btn" style={{ width:'max-content' }}>Salir</button>
        </div>

        {/* Métricas Portones e iPanels LADO A LADO */}
        <div style={{ display:'flex', gap:16, flexWrap:'wrap', alignItems:'stretch', flex: '1 1 480px' }}>
          {/* Card Portones */}
          <div style={{
            flex:'1 1 320px', minWidth:280, border:'1px solid #e5e7eb', borderRadius:12, padding:12, background:'var(--surface)'
          }}>
            <div className="metric metric--warn">Portones terminados en planta: {terminadosEnPlanta}</div>
            <div className="metric metric--ok">Portones en proceso de fabricación: {enProcesoFabricacion}</div>
            <div className="metric" style={{ background: 'rgba(239,68,68,0.15)' }}>
              Portones en cola de fabricación: {enColaFabricacion}
            </div>
          </div>

          {/* Card iPanels */}
          <div style={{
            flex:'1 1 320px', minWidth:280, border:'1px solid #e5e7eb', borderRadius:12, padding:12, background:'var(--surface)'
          }}>
            <div className="metric metric--warn">iPanels terminados en planta: {ipTerm}</div>
            <div className="metric metric--ok">iPanels en proceso de fabricación: {ipProc}</div>
            <div className="metric" style={{ background: 'rgba(239,68,68,0.15)' }}>
              iPanels en cola de fabricación: {ipCola}
            </div>

            {/* Visor Partidas iPanel en Proceso */}
            <div style={{
              display:'flex', alignItems:'center', gap:8, flexWrap:'wrap',
              padding:'6px 8px', background:'var(--surface)', border:'1px dashed #e5e7eb', borderRadius:10, marginTop:8
            }}>
              <span style={{ fontWeight:800 }}>Partidas en proceso (iPanel):</span>
              {ipPartidasEnProceso.length === 0 ? (
                <span style={{ ...chip, opacity:.7 }}>—</span>
              ) : (
                ipPartidasEnProceso.map(n => (
                  <span key={n} style={chip}>{n}</span>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Crear */}
      <form
        onSubmit={handleCreate}
        className="page__header"
        style={{ display:'flex', gap:8, alignItems:'center', marginTop:-8, flexWrap:'wrap', paddingTop:0 }}
      >
        <input
          type="number"
          placeholder="NV"
          value={nv}
          onChange={e=>setNv(e.target.value)}
          className={`btn input-num ${nv ? 'input-num--filled' : ''}`}
          style={{ width:140, textAlign:'center' }}
        />
        <input
          type="number"
          placeholder="NLista"
          value={nlista}
          onChange={e=>setNlista(e.target.value)}
          className={`btn input-num ${nlista ? 'input-num--filled' : ''}`}
          style={{ width:140, textAlign:'center' }}
        />
        <input
          type="number"
          placeholder="NPartida"
          value={partida}
          onChange={e=>setPartida(e.target.value)}
          className={`btn input-num ${partida ? 'input-num--filled' : ''}`}
          style={{ width:140, textAlign:'center' }}
        />

        <label style={{ display:'flex', gap:6, alignItems:'center', marginLeft:8 }}>
          <input
            type="checkbox"
            checked={sistemaOnCreate}
            onChange={(e)=>setSistemaOnCreate(e.target.checked)}
          />
          Sistema (finaliza Inyección y Revestimiento)
        </label>

        <label style={{ display:'flex', gap:6, alignItems:'center' }}>
          <input
            type="checkbox"
            checked={requiresInjection}
            onChange={(e)=>setRequiresInjection(e.target.checked)}
          />
          Inyección (requiere inyección)
        </label>

        <button type="submit" className="btn btn--brand">Crear portón</button>

        {/* Botón rápido para crear iPanel */}
        <button
          type="button"
          className="btn"
          onClick={handleCreateIpanel}
          title="Crea un iPanel con el NV indicado (Partida opcional)"
        >
          Crear iPanel
        </button>
      </form>

      {/* Buscar + FILTRO TIPO */}
      <form
        onSubmit={(e)=>{ e.preventDefault(); setFilter(q.trim()); }}
        className="page__header"
        style={{ display:'flex', gap:8, alignItems:'center', marginTop:-8, flexWrap:'wrap', paddingTop:0 }}
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
        <button type="button" className="btn" onClick={()=>{ setQ(''); setFilter(null); }}>Limpiar</button>

        {/* Filtro por tipo */}
        <div style={{ display:'inline-flex', gap:6, alignItems:'center', marginLeft:8 }}>
          <span style={{ fontSize:13, opacity:.8 }}>Mostrar:</span>
          {[
            { key:'all', label:'Todos' },
            { key:'porton', label:'Portones' },
            { key:'ipanel', label:'iPanel' },
          ].map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={()=>setKindFilter(opt.key)}
              className="btn"
              style={{
                padding: '6px 10px',
                borderColor: kindFilter === opt.key ? bordo : '#e5e7eb',
                background: kindFilter === opt.key ? 'color-mix(in srgb, var(--brand) 12%, #fff)' : '#f9fafb',
                fontWeight: kindFilter === opt.key ? 800 : 600
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </form>

      {loadingAny && <div className="page__header">Cargando…</div>}
      {errorAny && <div className="page__header" style={{ color:'crimson' }}>Error: {errorAny}</div>}

      {/* GRILLA */}
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
          {/* Header */}
          <div style={{ ...headerCell, position:'sticky', top:0, left:0, zIndex:6, background:'var(--surface)', textAlign:'center' }}>
            NV / Lista / Partida
          </div>
          {STAGES.map(s => (
            <div key={`h-${s.key}`} style={{ ...headerCell, position:'sticky', top:0, zIndex:5, background:'var(--surface)', textAlign:'center' }}>
              <div>{s.label}</div>
              <div style={{ fontSize:12, opacity:.75 }}>
                Pendientes: {stageStats[s.key].pend} · En Proceso: {stageStats[s.key].proc}
              </div>
            </div>
          ))}

          {/* Filas */}
          {list.map(p => ([
            <div key={`nv-${p.kind}-${p.id}`} style={{ ...nvCell, position:'sticky', left:0, zIndex:4, background:'var(--surface)', boxShadow:'1px 0 0 rgba(0,0,0,.08)' }}>
              <div style={{ display:'flex', flexDirection:'column', lineHeight:1.15 }}>
                <strong>{p.kind === 'ipanel' ? 'iPanel' : 'Portón'} · NV {p.nv}</strong>
                {p.kind === 'porton' && <span style={{ fontSize:12, opacity:.8 }}>Lista {p.nlista}</span>}
                <span style={{ fontSize:12, opacity:.9 }}>Partida {p.partida ?? '—'}</span>
              </div>
            </div>,
            ...STAGES.map(s => {
              const st  = p[s.key];
              const ini = p[`${s.key}_inicio`];
              const fin = p[`${s.key}_fin`];

              const lower = (st || '').toLowerCase();
              let clickable = lower === 'pendiente' || lower === 'en proceso';
              if (p.kind === 'ipanel' && !IPANEL_STAGE_KEYS.includes(s.key)) clickable = false;

              return (
                <div
                  key={`${p.kind}-${p.id}-${s.key}`}
                  onClick={() => clickable && handleCellClick(p, s)}
                  style={{
                    ...cellBase,
                    background: cellBg(st),
                    color: cellInk(st),
                    minHeight: CELL_MIN_H,
                    display:'flex',
                    flexDirection:'column',
                    justifyContent:'center',
                    cursor: clickable ? 'pointer' : 'default',
                    outline: clickable ? '2px dashed rgba(0,0,0,.12)' : 'none'
                  }}
                  title={[
                    `Estado: ${st || ''}`,
                    ini ? `Inicio: ${fmt(ini)}` : null,
                    fin ? `Fin: ${fmt(fin)}` : null,
                    clickable ? (lower === 'pendiente' ? 'Click: Iniciar' : 'Click: Finalizar') : (st ? ' ' : '')
                  ].filter(Boolean).join('\n')}
                >
                  <div style={{ fontSize:12, fontWeight:700 }}>{st || ''}</div>
                  <div style={{ fontSize:11 }}>{ini ? `Inicio: ${fmt(ini)}` : ''}</div>
                  <div style={{ fontSize:11 }}>{fin ? `Fin: ${fmt(fin)}` : ''}</div>
                </div>
              );
            })
          ]))}

          {!loadingAny && list.length === 0 && (
            <div style={{ gridColumn:`1 / span ${STAGES.length + 1}`, marginTop:12, opacity:.7 }}>
              Sin resultados.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

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

const IP_STAGES = [
  { key: 'guillotina', label: 'Corte' },
  { key: 'plegado',    label: 'Plegado' },
  { key: 'pintura',    label: 'Pintura' },
  { key: 'inyeccion',  label: 'Inyección' },
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
  return 'var(--surface)';
};
const cellInk = st => {
  const s = (st || '').toLowerCase();
  if (s === 'finalizado') return 'var(--state-done-ink)';
  if (s === 'en proceso') return 'var(--state-process-ink)';
  if (s === 'pendiente')  return 'var(--state-pending-ink)';
  return 'var(--ink)';
};

const isSistema = p =>
  (p.inyeccion || '').toLowerCase() === 'finalizado' &&
  (p.revestimiento || '').toLowerCase() === 'finalizado';

const isFullyFinishedPorton = p =>
  STAGES.every(s => (p[s.key] || '').toLowerCase() === 'finalizado');

const isFullyFinishedIpanel = i =>
  IP_STAGES.every(s => (i[s.key] || '').toLowerCase() === 'finalizado');

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
  const {
    data: dataP, loading, err, replaceItem, refresh, refreshing
  } = usePortones({ pollMs: 300000 });

  const {
    data: dataI, loading: loadingI, err: errI, replaceItem: replaceI,
    refresh: refreshI, refreshing: refreshingI
  } = useIpanels({ pollMs: 300000 });

  // ---- Métricas Portones ----
  const fabKeysPorton = useMemo(() => STAGES.filter(s => s.key !== 'despacho').map(s => s.key), []);
  const terminadosEnPlanta = useMemo(() => {
    if (!Array.isArray(dataP)) return 0;
    return dataP.filter(p =>
      (p.armado_final || '').toLowerCase() === 'finalizado' &&
      (p.despacho     || '').toLowerCase() === 'pendiente'
    ).length;
  }, [dataP]);

  // cola: ninguna etapa en proceso ni finalizada
  const enColaFabricacion = useMemo(() => {
    if (!Array.isArray(dataP)) return 0;
    return dataP.filter(p =>
      fabKeysPorton.every(k => {
        const st = (p[k] || '').toLowerCase();
        return st === '' || st === 'pendiente';
      })
    ).length;
  }, [dataP, fabKeysPorton]);

  const enProcesoFabricacion = useMemo(() => {
    if (!Array.isArray(dataP)) return 0;
    const total = dataP.length;
    return Math.max(0, total - terminadosEnPlanta - enColaFabricacion);
  }, [dataP, terminadosEnPlanta, enColaFabricacion]);

  // Partidas en proceso (Portones)
  const partidasEnProcesoP = useMemo(() => {
    if (!Array.isArray(dataP)) return [];
    const set = new Set();
    for (const p of dataP) {
      const anyProc = fabKeysPorton.some(k => (p[k] || '').toLowerCase() === 'en proceso');
      if (anyProc && p.partida != null) set.add(p.partida);
    }
    return Array.from(set).sort((a,b) => Number(a) - Number(b));
  }, [dataP, fabKeysPorton]);

  // ---- Métricas iPanels ----
  const ipTerm = useMemo(() => {
    if (!Array.isArray(dataI)) return 0;
    return dataI.filter(isFullyFinishedIpanel).length;
  }, [dataI]);

  const ipCola = useMemo(() => {
    if (!Array.isArray(dataI)) return 0;
    return dataI.filter(i =>
      IP_STAGES.every(s => {
        const st = (i[s.key] || '').toLowerCase();
        return st === '' || st === 'pendiente';
      })
    ).length;
  }, [dataI]);

  const ipProc = useMemo(() => {
    if (!Array.isArray(dataI)) return 0;
    const total = dataI.length;
    return Math.max(0, total - ipTerm - ipCola);
  }, [dataI, ipTerm, ipCola]);

  const ipPartidasEnProceso = useMemo(() => {
    if (!Array.isArray(dataI)) return [];
    const set = new Set();
    for (const it of dataI) {
      const anyProc = IP_STAGES.some(s => (it[s.key] || '').toLowerCase() === 'en proceso');
      if (anyProc && it.partida != null) set.add(it.partida);
    }
    return Array.from(set).sort((a,b) => Number(a) - Number(b));
  }, [dataI]);

  // ---- Form crear (modo) ----
  const [createModeIpanel, setCreateModeIpanel] = useState(false); // false = Portón, true = iPanel
  const [nv, setNv] = useState('');
  const [nlista, setNlista] = useState('');
  const [partida, setPartida] = useState('');
  const [sistemaOnCreate, setSistemaOnCreate] = useState(false);
  const [requiresInjection, setRequiresInjection] = useState(false);

  // ---- Filtro “ver solo iPanels” ----
  const [onlyIpanels, setOnlyIpanels] = useState(false);

  // ---- Buscar (Portones) ----
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(null);

  // ---- Listas (Portones) ----
  const baseListPortones = useMemo(() => {
    if (!Array.isArray(dataP)) return [];
    const hasFilter = filter !== null && filter !== '';
    if (hasFilter) {
      const n = Number(filter);
      if (!Number.isNaN(n)) return dataP.filter(p => p.nv === n || p.nlista === n);
    }
    return dataP.filter(p => !isFullyFinishedPorton(p));
  }, [dataP, filter]);

  const listPortones = useMemo(() => {
    const arr = [...baseListPortones];
    arr.sort((a, b) =>
      (a.nlista || 0) - (b.nlista || 0) ||
      (a.nv     || 0) - (b.nv     || 0)
    );
    return arr;
  }, [baseListPortones]);

  const stageStats = useMemo(() => {
    const stats = {};
    STAGES.forEach(s => (stats[s.key] = { pend: 0, proc: 0 }));
    for (const p of listPortones) {
      for (const s of STAGES) {
        const st = (p[s.key] || '').toLowerCase();
        if (st === 'pendiente') stats[s.key].pend++;
        else if (st === 'en proceso') stats[s.key].proc++;
      }
    }
    return stats;
  }, [listPortones]);

  // ---- Listas (iPanels) ----
  const listIpanels = useMemo(() => {
    if (!Array.isArray(dataI)) return [];
    // Mostramos todos los que no estén completamente finalizados (igual criterio)
    const base = dataI.filter(i => !isFullyFinishedIpanel(i));
    // orden: por partida -> nv
    base.sort((a, b) =>
      (Number(a.partida) || 0) - (Number(b.partida) || 0) ||
      (a.nv || 0) - (b.nv || 0)
    );
    return base;
  }, [dataI]);

  const stageStatsI = useMemo(() => {
    const st = {};
    IP_STAGES.forEach(s => (st[s.key] = { pend: 0, proc: 0 }));
    for (const i of listIpanels) {
      for (const s of IP_STAGES) {
        const val = (i[s.key] || '').toLowerCase();
        if (val === 'pendiente') st[s.key].pend++;
        else if (val === 'en proceso') st[s.key].proc++;
      }
    }
    return st;
  }, [listIpanels]);

  // ---- Acciones Portones ----
  async function finalizeSistema(id) {
    let updated = null;
    for (const st of ['inyeccion', 'revestimiento']) {
      const { data } = await stopStage(id, st);
      updated = data;
    }
    return updated;
  }

  async function handleCreatePorton() {
    const nNv = Number(nv), nNl = Number(nlista);
    const nPa = partida === '' ? null : Number(partida);
    if (!Number.isInteger(nNv) || !Number.isInteger(nNl)) {
      alert('Ingresá NV y NLista como enteros.');
      return;
    }
    if (nPa !== null && !Number.isInteger(nPa)) {
      alert('NPartida debe ser entero (o dejalo vacío).');
      return;
    }
    const payload = { nv: nNv, nlista: nNl };
    if (nPa !== null) payload.partida = nPa;

    const { data: created } = await createPorton(payload);

    // Si NO requiere inyección → finalizar inyección inmediatamente (con timestamps)
    if (!requiresInjection) {
      await stopStage(created.id, 'inyeccion');
    }
    // Si se marcó "Sistema" → finalizar inyección y revestimiento
    if (sistemaOnCreate) {
      await finalizeSistema(created.id);
    }

    setNv(''); setNlista(''); setPartida(''); setSistemaOnCreate(false); setRequiresInjection(false);
    await refresh();
  }

  // ---- Acciones iPanels ----
  async function handleCreateIpanel() {
    const nNv = Number(nv);
    const nPa = partida === '' ? null : Number(partida);
    if (!Number.isInteger(nNv)) {
      alert('Ingresá NV como entero.');
      return;
    }
    if (nPa !== null && !Number.isInteger(nPa)) {
      alert('NPartida debe ser entero (o dejalo vacío).');
      return;
    }
    const payload = { nv: nNv };
    if (nPa !== null) payload.partida = nPa;

    await createIpanel(payload);
    setNv(''); setNlista(''); setPartida('');
    await refreshI();
  }

  async function handleCreate(e) {
    e.preventDefault();
    try {
      if (createModeIpanel) await handleCreateIpanel();
      else await handleCreatePorton();
    } catch (e2) {
      alert(e2?.response?.data?.error || e2.message);
    }
  }

  async function handleCellClickPorton(p, s) {
    const status = (p[s.key] || '').toLowerCase();
    try {
      if (status === 'pendiente') {
        if (confirm(`¿Iniciar "${s.label}" para NV ${p.nv}?`)) {
          const { data: upd } = await startStage(p.id, s.key); replaceItem(upd);
        }
      } else if (status === 'en proceso') {
        if (confirm(`¿Finalizar "${s.label}" para NV ${p.nv}?`)) {
          const { data: upd } = await stopStage(p.id, s.key); replaceItem(upd);
        }
      }
    } catch (e) { alert(e?.response?.data?.error || e.message); }
  }

  async function handleCellClickIpanel(i, s) {
    const status = (i[s.key] || '').toLowerCase();
    try {
      if (status === 'pendiente') {
        if (confirm(`¿Iniciar "${s.label}" para NV ${i.nv}?`)) {
          const { data: upd } = await startIpanelStage(i.id, s.key); replaceI(upd);
        }
      } else if (status === 'en proceso') {
        if (confirm(`¿Finalizar "${s.label}" para NV ${i.nv}?`)) {
          const { data: upd } = await stopIpanelStage(i.id, s.key); replaceI(upd);
        }
      }
    } catch (e) { alert(e?.response?.data?.error || e.message); }
  }

  // ---- Exportar a XLSX (solo Portones visibles) ----
  async function handleExportXlsx() {
    const xlsxMod = await import('xlsx');
    const XLSX = xlsxMod.default || xlsxMod;

    const header = [
      'NV', 'Lista', 'Partida',
      ...STAGES.flatMap(s => [
        `${s.label} - Estado`, `${s.label} - Inicio`, `${s.label} - Fin`
      ])
    ];

    const rows = listPortones.map(p => {
      const fila = [p.nv ?? '', p.nlista ?? '', p.partida ?? ''];
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
      { wch: 8 },  // NV
      { wch: 10 }, // Lista
      { wch: 10 }, // Partida
      ...STAGES.flatMap(() => [{ wch: 16 }, { wch: 20 }, { wch: 20 }])
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Portones');

    const pad = n => String(n).padStart(2, '0');
    const now = new Date();
    const fname = `portones_${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.xlsx`;
    XLSX.writeFile(wb, fname);
  }

  // ---- Sticky helpers ----
  const stickyTop    = { position: 'sticky', top: 0, zIndex: 5, background: 'var(--surface)' };
  const stickyLeft   = { position: 'sticky', left: 0, zIndex: 4, background: 'var(--surface)', boxShadow: '1px 0 0 rgba(0,0,0,.08)' };
  const stickyCorner = { position: 'sticky', top: 0, left: 0, zIndex: 6, background: 'var(--surface)' };

  // ---- Render ----
  const cellBase   = { border: `2px solid ${bordo}`, padding: 8, borderRadius: 12, boxSizing: 'border-box' };
  const headerCell = { ...cellBase, background:'var(--surface)', fontWeight:700, textAlign:'center' };
  const nvCell     = { ...cellBase, background:'var(--surface)', minHeight:CELL_MIN_H, display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, paddingLeft:10, paddingRight:10 };

  // chips
  const chip = {
    display:'inline-flex', alignItems:'center', gap:6,
    padding:'6px 10px', borderRadius:999,
    background:'var(--surface-muted)', color:'var(--ink)',
    border:'1px solid #e5e7eb', fontWeight:800
  };

  return (
    <div className="screen page" style={{ fontFamily:'system-ui,sans-serif' }}>
      {/* ===== Header: controles izquierda + tarjetas (Portones | iPanels) lado a lado ===== */}
      <div className="page__header page__header--split">
        {/* Izquierda */}
        <div className="left-stack">
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button
              onClick={() => { refresh(); refreshI(); }}
              disabled={refreshing || refreshingI}
              className="btn"
            >
              {(refreshing || refreshingI) ? 'Actualizando…' : 'Refrescar'}
            </button>
            <button
              onClick={handleExportXlsx}
              disabled={loading || (listPortones?.length ?? 0) === 0}
              className="btn"
              title="Exporta Portones visibles en la grilla"
            >
              Exportar XLSX
            </button>
          </div>

          <h2 className="h1" style={{ border:`3px solid ${bordo}`, width:'max-content' }}>
            PORTONES / iPANELS
          </h2>

          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <label style={{ display:'flex', alignItems:'center', gap:6 }}>
              <input
                type="checkbox"
                checked={onlyIpanels}
                onChange={e => setOnlyIpanels(e.target.checked)}
              />
              Ver solo iPanels
            </label>
            <button onClick={()=>{ logout(); setAuthed(false); }} className="btn">
              Salir
            </button>
          </div>
        </div>

        {/* Derecha: tarjetas en grid 2 columnas */}
        <div className="duo-cards">
          {/* Card Portones */}
          <div className="card">
            <div className="metric metric--warn">Portones terminados en planta: {terminadosEnPlanta}</div>
            <div className="metric metric--ok">Portones en proceso de fabricación: {enProcesoFabricacion}</div>
            <div className="metric" style={{ background: 'rgba(239,68,68,0.15)' }}>
              Portones en cola de fabricación: {enColaFabricacion}
            </div>

            {/* Visor Partidas en Proceso (Portones) */}
            <div style={{
              display:'flex', alignItems:'center', gap:8, flexWrap:'wrap',
              padding:'6px 8px', background:'var(--surface)', border:'1px dashed #e5e7eb', borderRadius:10, marginTop:8
            }}>
              <span style={{ fontWeight:800 }}>Partidas en proceso:</span>
              {partidasEnProcesoP.length === 0
                ? <span style={{ ...chip, opacity:.7 }}>—</span>
                : partidasEnProcesoP.map(n => <span key={n} style={chip}>{n}</span>)
              }
            </div>
          </div>

          {/* Card iPanels */}
          <div className="card">
            <div className="metric metric--warn">iPanels terminados en planta: {ipTerm}</div>
            <div className="metric metric--ok">iPanels en proceso de fabricación: {ipProc}</div>
            <div className="metric" style={{ background: 'rgba(239,68,68,0.15)' }}>
              iPanels en cola de fabricación: {ipCola}
            </div>

            {/* Visor Partidas en Proceso (iPanels) */}
            <div style={{
              display:'flex', alignItems:'center', gap:8, flexWrap:'wrap',
              padding:'6px 8px', background:'var(--surface)', border:'1px dashed #e5e7eb', borderRadius:10, marginTop:8
            }}>
              <span style={{ fontWeight:800 }}>Partidas en proceso (iPanel):</span>
              {ipPartidasEnProceso.length === 0
                ? <span style={{ ...chip, opacity:.7 }}>—</span>
                : ipPartidasEnProceso.map(n => <span key={n} style={chip}>{n}</span>)
              }
            </div>
          </div>
        </div>
      </div>

      {/* ===== Crear ===== */}
      <form
        onSubmit={handleCreate}
        className="page__header"
        style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', paddingTop:0 }}
      >
        {/* Modo de creación */}
        <label style={{ display:'flex', gap:6, alignItems:'center', marginRight:12 }}>
          <input
            type="checkbox"
            checked={createModeIpanel}
            onChange={e => setCreateModeIpanel(e.target.checked)}
          />
          Crear iPanel
        </label>

        <input
          type="number"
          placeholder="NV"
          value={nv}
          onChange={e=>setNv(e.target.value)}
          className={`btn input-num ${nv ? 'input-num--filled' : ''}`}
          style={{ width:140, textAlign:'center' }}
        />

        {!createModeIpanel && (
          <input
            type="number"
            placeholder="NLista"
            value={nlista}
            onChange={e=>setNlista(e.target.value)}
            className={`btn input-num ${nlista ? 'input-num--filled' : ''}`}
            style={{ width:140, textAlign:'center' }}
          />
        )}

        <input
          type="number"
          placeholder="NPartida (opcional)"
          value={partida}
          onChange={e=>setPartida(e.target.value)}
          className={`btn input-num ${partida ? 'input-num--filled' : ''}`}
          style={{ width:180, textAlign:'center' }}
        />

        {!createModeIpanel && (
          <>
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
          </>
        )}

        <button type="submit" className="btn btn--brand">
          {createModeIpanel ? 'Crear iPanel' : 'Crear portón'}
        </button>
      </form>

      {/* ===== Buscar (Portones) ===== */}
      {!onlyIpanels && (
        <form
          onSubmit={(e)=>{ e.preventDefault(); setFilter(q.trim()); }}
          className="page__header"
          style={{ display:'flex', gap:8, alignItems:'center', marginTop:-8, flexWrap:'wrap', paddingTop:0 }}
        >
          <input type="text" placeholder="Buscar por NV o NLista (número)" value={q} onChange={(e)=>setQ(e.target.value)} className="btn" style={{ minWidth:260 }} inputMode="numeric" />
          <button type="submit" className="btn">Buscar</button>
          <button type="button" className="btn" onClick={()=>{ setQ(''); setFilter(null); }}>Limpiar</button>
        </form>
      )}

      {(loading || loadingI) && <div className="page__header">Cargando…</div>}
      {(err || errI) && <div className="page__header" style={{ color:'crimson' }}>Error: {err || errI}</div>}

      {/* ===== GRILLAS ===== */}
      <div className="grid-scroll">
        {/* --- Portones Grid --- */}
        {!onlyIpanels && (
          <div style={{ marginBottom:24 }}>
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
              <div style={{ ...headerCell, ...stickyCorner, textAlign:'center' }}>NV / Lista / Partida</div>
              {STAGES.map(s => (
                <div key={`h-${s.key}`} style={{ ...headerCell, ...stickyTop, textAlign:'center' }}>
                  <div>{s.label}</div>
                  <div style={{ fontSize:12, opacity:.75 }}>
                    Pendientes: {stageStats[s.key].pend} · En Proceso: {stageStats[s.key].proc}
                  </div>
                </div>
              ))}

              {/* Filas */}
              {listPortones.map(p => ([
                <div key={`nv-${p.id}`} style={{ ...nvCell, ...stickyLeft }}>
                  <div style={{ display:'flex', flexDirection:'column', lineHeight:1.15 }}>
                    <strong>NV {p.nv}</strong>
                    <strong>N° Partida {p.partida ?? ''}</strong>
                    <span style={{ fontSize:12, opacity:.8 }}>Lista {p.nlista}</span>
                  </div>
                </div>,
                ...STAGES.map(s => {
                  const st  = p[s.key];
                  const ini = p[`${s.key}_inicio`];
                  const fin = p[`${s.key}_fin`];
                  const lower = (st || '').toLowerCase();
                  const clickable = lower === 'pendiente' || lower === 'en proceso';
                  return (
                    <div
                      key={`${p.id}-${s.key}`}
                      onClick={() => clickable && handleCellClickPorton(p, s)}
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
                        clickable ? (lower === 'pendiente' ? 'Click: Iniciar' : 'Click: Finalizar') : 'Finalizado'
                      ].filter(Boolean).join('\n')}
                    >
                      <div style={{ fontSize:12, fontWeight:700 }}>{st || ''}</div>
                      <div style={{ fontSize:11 }}>{ini ? `Inicio: ${fmt(ini)}` : ''}</div>
                      <div style={{ fontSize:11 }}>{fin ? `Fin: ${fmt(fin)}` : ''}</div>
                    </div>
                  );
                })
              ]))}

              {listPortones.length === 0 && (
                <div style={{ gridColumn:`1 / span ${STAGES.length + 1}`, marginTop:12, opacity:.7 }}>
                  Sin resultados.
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- iPanels Grid --- */}
        {onlyIpanels && (
          <div>
            <div
              style={{
                display:'grid',
                gridTemplateColumns: `${NV_COL_W}px repeat(${IP_STAGES.length}, 1fr)`,
                columnGap: GRID_GAP,
                rowGap: GRID_GAP,
                alignItems:'stretch',
                width:'max-content',
                padding:16
              }}
            >
              {/* Header iPanels */}
              <div style={{ ...headerCell, ...stickyCorner, textAlign:'center' }}>NV / Partida</div>
              {IP_STAGES.map(s => (
                <div key={`ip-h-${s.key}`} style={{ ...headerCell, ...stickyTop, textAlign:'center' }}>
                  <div>{s.label}</div>
                  <div style={{ fontSize:12, opacity:.75 }}>
                    Pendientes: {stageStatsI[s.key]?.pend ?? 0} · En Proceso: {stageStatsI[s.key]?.proc ?? 0}
                  </div>
                </div>
              ))}

              {/* Filas iPanels */}
              {listIpanels.map(i => ([
                <div key={`ip-nv-${i.id}`} style={{ ...nvCell, ...stickyLeft }}>
                  <div style={{ display:'flex', flexDirection:'column', lineHeight:1.15 }}>
                    <strong>NV {i.nv}</strong>
                    <strong>N° Partida {i.partida ?? ''}</strong>
                  </div>
                </div>,
                ...IP_STAGES.map(s => {
                  const st  = i[s.key];
                  const ini = i[`${s.key}_inicio`];
                  const fin = i[`${s.key}_fin`];
                  const lower = (st || '').toLowerCase();
                  const clickable = lower === 'pendiente' || lower === 'en proceso';
                  return (
                    <div
                      key={`ip-${i.id}-${s.key}`}
                      onClick={() => clickable && handleCellClickIpanel(i, s)}
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
                        clickable ? (lower === 'pendiente' ? 'Click: Iniciar' : 'Click: Finalizar') : 'Finalizado'
                      ].filter(Boolean).join('\n')}
                    >
                      <div style={{ fontSize:12, fontWeight:700 }}>{st || ''}</div>
                      <div style={{ fontSize:11 }}>{ini ? `Inicio: ${fmt(ini)}` : ''}</div>
                      <div style={{ fontSize:11 }}>{fin ? `Fin: ${fmt(fin)}` : ''}</div>
                    </div>
                  );
                })
              ]))}

              {listIpanels.length === 0 && (
                <div style={{ gridColumn:`1 / span ${IP_STAGES.length + 1}`, marginTop:12, opacity:.7 }}>
                  Sin resultados.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

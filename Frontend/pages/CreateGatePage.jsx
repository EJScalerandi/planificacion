import { useMemo, useState } from 'react';
import usePortones from '../src/hooks/usePortones';
import { createPorton, startStage, stopStage } from '../src/api';
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

const isFullyFinished = p =>
  STAGES.every(s => (p[s.key] || '').toLowerCase() === 'finalizado');

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
  const { data, loading, err, replaceItem, refresh, refreshing } = usePortones({ pollMs: 300000 });

  // Claves de fabricación (excluye despacho)
  const fabKeys = useMemo(() => STAGES.filter(s => s.key !== 'despacho').map(s => s.key), []);

  // Métricas
  const terminadosEnPlanta = useMemo(() => {
    if (!Array.isArray(data)) return 0;
    return data.filter(p =>
      (p.armado_final || '').toLowerCase() === 'finalizado' &&
      (p.despacho     || '').toLowerCase() === 'pendiente'
    ).length;
  }, [data]);

  const enProcesoFabricacion = useMemo(() => {
    if (!Array.isArray(data)) return 0;
    return data.filter(p => fabKeys.some(k => (p[k] || '').toLowerCase() === 'en proceso')).length;
  }, [data, fabKeys]);

  const enColaFabricacion = useMemo(() => {
    if (!Array.isArray(data)) return 0;
    return data.filter(p =>
      fabKeys.every(k => {
        const st = (p[k] || '').toLowerCase();
        return st === '' || st === 'pendiente';
      })
    ).length;
  }, [data, fabKeys]);

  // Form crear
  const [nv, setNv] = useState('');
  const [nlista, setNlista] = useState('');
  const [partida, setPartida] = useState('');
  const [sistemaOnCreate, setSistemaOnCreate] = useState(false);
  const [requiresInjection, setRequiresInjection] = useState(false); // ← NUEVO

  // Buscar
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(null);

  // Filtrado + ocultar totalmente finalizados (si no hay filtro)
  const baseList = useMemo(() => {
    if (!Array.isArray(data)) return [];
    const hasFilter = filter !== null && filter !== '';
    if (hasFilter) {
      const n = Number(filter);
      if (!Number.isNaN(n)) return data.filter(p => p.nv === n || p.nlista === n);
    }
    return data.filter(p => !isFullyFinished(p));
  }, [data, filter]);

  // Orden por lista -> nv
  const list = useMemo(() => {
    const arr = [...baseList];
    arr.sort((a, b) =>
      (a.nlista || 0) - (b.nlista || 0) ||
      (a.nv     || 0) - (b.nv     || 0)
    );
    return arr;
  }, [baseList]);

  // Contadores por etapa
  const stageStats = useMemo(() => {
    const stats = {};
    STAGES.forEach(s => (stats[s.key] = { pend: 0, proc: 0 }));
    for (const p of list) {
      for (const s of STAGES) {
        const st = (p[s.key] || '').toLowerCase();
        if (st === 'pendiente') stats[s.key].pend++;
        else if (st === 'en proceso') stats[s.key].proc++;
      }
    }
    return stats;
  }, [list]);

  // Acciones
  async function finalizeSistema(id) {
    let updated = null;
    for (const st of ['inyeccion', 'revestimiento']) {
      const { data } = await stopStage(id, st);
      updated = data;
    }
    return updated;
  }

  async function handleCreate(e) {
    e.preventDefault();
    const nNv = Number(nv), nNl = Number(nlista), nPa = Number(partida);
    if (![nNv, nNl, nPa].every(Number.isInteger)) { alert('Ingresá NV, NLista y NPartida como enteros.'); return; }
    try {
      // Enviamos partida al servidor
      const { data: created } = await createPorton({ nv: nNv, nlista: nNl, partida: nPa });

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
    } catch (e) { alert(e?.response?.data?.error || e.message); }
  }

  async function handleCellClick(p, s) {
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

  async function handleSetSistema(p) {
    if (isSistema(p)) return;
    if (!confirm(`Marcar NV ${p.nv} como "Sistema"?`)) return;
    try { const upd = await finalizeSistema(p.id); replaceItem(upd); }
    catch (e) { alert(e?.response?.data?.error || e.message); }
  }

  // ---- Exportar a XLSX ----
  async function handleExportXlsx() {
    const xlsxMod = await import('xlsx');
    const XLSX = xlsxMod.default || xlsxMod;

    const header = [
      'NV', 'Lista', 'Partida',
      ...STAGES.flatMap(s => [
        `${s.label} - Estado`, `${s.label} - Inicio`, `${s.label} - Fin`
      ])
    ];

    const rows = list.map(p => {
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

  return (
    <div className="screen page" style={{ fontFamily:'system-ui,sans-serif' }}>
      {/* Header + métricas + refresh */}
      <div className="page__header" style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16, flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button onClick={refresh} disabled={refreshing} className="btn">
            {refreshing ? 'Actualizando…' : 'Refrescar'}
          </button>
          <button
            onClick={handleExportXlsx}
            disabled={loading || (list?.length ?? 0) === 0}
            className="btn"
            title="Exporta lo visible en la grilla"
          >
            Exportar XLSX
          </button>
        </div>
        <h2 className="h1" style={{ border:`3px solid ${bordo}` }}>PORTONES</h2>
        <div style={{ display:'flex', flexDirection:'column', gap:8, minWidth:280 }}>
          <div className="metric metric--warn">Portones terminados en planta: {terminadosEnPlanta}</div>
          <div className="metric metric--ok">Portones en proceso de fabricación: {enProcesoFabricacion}</div>
          <div className="metric" style={{ background: 'rgba(239,68,68,0.15)' }}>
            Portones en cola de fabricación: {enColaFabricacion}
          </div>
          <button onClick={()=>{ logout(); setAuthed(false); }} className="btn">Salir</button>
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
      </form>

      {/* Buscar */}
      <form
        onSubmit={(e)=>{ e.preventDefault(); setFilter(q.trim()); }}
        className="page__header"
        style={{ display:'flex', gap:8, alignItems:'center', marginTop:-8, flexWrap:'wrap', paddingTop:0 }}
      >
        <input type="text" placeholder="Buscar por NV o NLista (número)" value={q} onChange={(e)=>setQ(e.target.value)} className="btn" style={{ minWidth:260 }} inputMode="numeric" />
        <button type="submit" className="btn">Buscar</button>
        <button type="button" className="btn" onClick={()=>{ setQ(''); setFilter(null); }}>Limpiar</button>
      </form>

      {loading && <div className="page__header">Cargando…</div>}
      {err && <div className="page__header" style={{ color:'crimson' }}>Error: {err}</div>}

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
          {list.map(p => ([
            <div key={`nv-${p.id}`} style={{ ...nvCell, ...stickyLeft }}>
              <div style={{ display:'flex', flexDirection:'column', lineHeight:1.15 }}>
                <strong>NV {p.nv}</strong>
                <strong>N° Partida {p.partida}</strong>
                <span style={{ fontSize:12, opacity:.8 }}>Lista {p.nlista}</span>
              </div>
              <span style={{ display:'none' }}>
                <input type="checkbox" checked={isSistema(p)} readOnly /> Sistema
              </span>
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

          {!loading && list.length === 0 && (
            <div style={{ gridColumn:`1 / span ${STAGES.length + 1}`, marginTop:12, opacity:.7 }}>Sin resultados.</div>
          )}
        </div>
      </div>
    </div>
  );
}

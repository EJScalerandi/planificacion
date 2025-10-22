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
  if (s === 'finalizado') return '#c9f2d7';
  if (s === 'en proceso') return '#ffe58a';
  if (s === 'pendiente')  return '#f7b1b1';
  return '#eee';
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
      <div style={{ height:'100vh', display:'grid', placeItems:'center', background:'#f7fff3', fontFamily:'system-ui,sans-serif' }}>
        <form
          onSubmit={(e) => { e.preventDefault(); if (login(user.trim(), pass)) { setAuthed(true); setAuthErr(''); setPass(''); } else setAuthErr('Usuario o contraseña inválidos'); }}
          style={{ width:340, display:'flex', flexDirection:'column', gap:10, border:`3px solid ${bordo}`, borderRadius:12, padding:18, background:'white' }}
        >
          <h3 style={{ margin:0, color:bordo, textAlign:'center' }}>Acceso CreateGate</h3>
          <input placeholder="Usuario" value={user} onChange={e=>setUser(e.target.value)} autoFocus style={{ padding:'10px 12px', border:'1px solid #ccc', borderRadius:8 }} />
          <input type="password" placeholder="Contraseña" value={pass} onChange={e=>setPass(e.target.value)} style={{ padding:'10px 12px', border:'1px solid #ccc', borderRadius:8 }} />
          {authErr && <div style={{ color:'crimson', fontSize:13 }}>{authErr}</div>}
          <button type="submit" className="btn btn--brand" style={{ fontWeight:700, borderRadius:8 }}>Entrar</button>
        </form>
      </div>
    );
  }

  // ---- Data ----
  const { data, loading, err, replaceItem, refresh, refreshing } = usePortones({ pollMs: 300000 });

  // Métricas
  const terminadosEnPlanta = useMemo(() => {
    if (!Array.isArray(data)) return 0;
    return data.filter(p =>
      (p.armado_final || '').toLowerCase() === 'finalizado' &&
      (p.despacho     || '').toLowerCase() === 'pendiente'
    ).length;
  }, [data]);

  const fabKeys = useMemo(() => STAGES.filter(s => s.key !== 'despacho').map(s => s.key), []);
  const enProcesoFabricacion = useMemo(() => {
    if (!Array.isArray(data)) return 0;
    return data.filter(p => fabKeys.some(k => (p[k] || '').toLowerCase() === 'en proceso')).length;
  }, [data, fabKeys]);

  // Form crear
  const [nv, setNv] = useState('');
  const [nlista, setNlista] = useState('');
  const [partida, setPartida] = useState('');
  const [sistemaOnCreate, setSistemaOnCreate] = useState(false);

  // Buscar
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(null);

  // Filtrado + ocultar totalmente finalizados (si no hay filtro)
  const baseList = useMemo(() => {
    if (!Array.isArray(data)) return [];
    const hasFilter = filter !== null && filter !== '';
    if (hasFilter) {
      const n = Number(filter);
      if (!Number.isNaN(n)) return data.filter(p => p.nv === n || p.nlista === n /* o p.partida === n si querés seguir buscándolo */);
    }
    return data.filter(p => !isFullyFinished(p));
  }, [data, filter]);

  // Orden por lista -> nv (seguimos sin mostrar partida)
  const list = useMemo(() => {
    const arr = [...baseList];
    arr.sort((a, b) =>
      (a.nlista || 0) - (b.nlista || 0) ||
      (a.nv     || 0) - (b.nv     || 0)
    );
    return arr;
  }, [baseList]);

  // Contadores por etapa (sobre lo que se muestra)
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
    if (![nNv, nNl, nPa].every(Number.isInteger)) { alert('Ingresá NV, NLista y Partida como enteros.'); return; }
    try {
      const { data: created } = await createPorton({ nv: nNv, nlista: nNl, partida: nPa });
      if (sistemaOnCreate) await finalizeSistema(created.id);
      setNv(''); setNlista(''); setPartida(''); setSistemaOnCreate(false);
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

  // ---- Render ----
  const cellBase   = { border: `2px solid ${bordo}`, padding: 8, borderRadius: 12, boxSizing: 'border-box' };
  const headerCell = { ...cellBase, background:'#fafafa', fontWeight:700, textAlign:'center' };
  const nvCell     = { ...cellBase, background:'#fff', minHeight:CELL_MIN_H, display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, paddingLeft:10, paddingRight:10 };

  return (
    <div style={{ padding:16, fontFamily:'system-ui,sans-serif' }}>
      {/* Header + métricas + refresh */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16, flexWrap:'wrap' }}>
        <button onClick={refresh} disabled={refreshing} className="btn">
          {refreshing ? 'Actualizando…' : 'Refrescar'}
        </button>
        <h2 className="h1" style={{ border:`3px solid ${bordo}` }}>PORTONES</h2>
        <div style={{ display:'flex', flexDirection:'column', gap:8, minWidth:280 }}>
          <div className="metric metric--warn">Portones terminados en planta: {terminadosEnPlanta}</div>
          <div className="metric metric--ok">Portones en proceso de fabricación: {enProcesoFabricacion}</div>
          <button onClick={()=>{ logout(); setAuthed(false); }} className="btn">Salir</button>
        </div>
      </div>

      {/* Crear */}
      <form onSubmit={handleCreate} style={{ display:'flex', gap:8, alignItems:'center', margin:'12px 0', flexWrap:'wrap' }}>
        <input type="number" placeholder="NV" value={nv} onChange={e=>setNv(e.target.value)} className="btn" style={{ width:120 }} />
        <input type="number" placeholder="NLista" value={nlista} onChange={e=>setNlista(e.target.value)} className="btn" style={{ width:120 }} />
        <input type="number" placeholder="Partida" value={partida} onChange={e=>setPartida(e.target.value)} className="btn" style={{ width:120 }} />
        <label style={{ display:'flex', gap:6, alignItems:'center', marginLeft:8 }}>
          <input type="checkbox" checked={sistemaOnCreate} onChange={(e)=>setSistemaOnCreate(e.target.checked)} />
          Sistema (finaliza Inyección y Revestimiento)
        </label>
        <button type="submit" className="btn btn--brand">Crear portón</button>
      </form>

      {/* Buscar */}
      <form onSubmit={(e)=>{ e.preventDefault(); setFilter(q.trim()); }} style={{ display:'flex', gap:8, alignItems:'center', margin:'6px 0 16px', flexWrap:'wrap' }}>
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
      </form>

      {loading && <div>Cargando…</div>}
      {err && <div style={{ color:'crimson' }}>Error: {err}</div>}

      {/* GRILLA */}
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
          {/* Header */}
          <div style={{ ...headerCell, textAlign:'center' }}>NV / Lista</div>
          {STAGES.map(s => (
            <div key={`h-${s.key}`} style={{ ...headerCell, textAlign:'center' }}>
              <div>{s.label}</div>
              <div style={{ fontSize:12, opacity:.75 }}>
                Pendientes: {stageStats[s.key].pend} · En Proceso: {stageStats[s.key].proc}
              </div>
            </div>
          ))}

          {/* Filas */}
          {list.map(p => ([
            <div key={`nv-${p.id}`} style={nvCell}>
              <div style={{ display:'flex', flexDirection:'column', lineHeight:1.15 }}>
                <strong>NV {p.nv}</strong>
                <span style={{ fontSize:12, opacity:.8 }}>Lista {p.nlista}</span>
              </div>
              {/* Sin “Sistema” ni Partida a la vista */}
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

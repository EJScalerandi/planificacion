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

function fmt(dt) {
  if (!dt) return '';
  try { return new Date(dt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return ''; }
}
function classForStatus(s) {
  const v = (s || '').toLowerCase();
  if (v === 'finalizado') return 'cell cell--done';
  if (v === 'en proceso') return 'cell cell--process';
  return 'cell cell--pending';
}
function isSistema(p) {
  return (p.inyeccion || '').toLowerCase() === 'finalizado' &&
         (p.revestimiento || '').toLowerCase() === 'finalizado';
}
function isFullyDone(p) {
  return STAGES.every(st => (p[st.key] || '').toLowerCase() === 'finalizado');
}
function doneCount(p) {
  return STAGES.reduce((acc, st) => acc + (((p[st.key] || '').toLowerCase() === 'finalizado') ? 1 : 0), 0);
}

export default function CreateGatePage() {
  // ------- Login simple -------
  const [authed, setAuthed] = useState(isAuthed());
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [authErr, setAuthErr] = useState('');

  if (!authed) {
    return (
      <div style={{ height:'100vh', display:'grid', placeItems:'center', background:'var(--bg)' }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (login(user.trim(), pass)) {
              setAuthed(true);
              setAuthErr(''); setPass('');
            } else {
              setAuthErr('Usuario o contraseña inválidos');
            }
          }}
          className="cell"
          style={{ width:340, borderColor:'var(--brand)', borderWidth:3, background:'var(--surface)' }}
        >
          <h3 className="h1" style={{ border:'0', margin:'0 0 8px 0' }}>Acceso CreateGate</h3>
          <input
            placeholder="Usuario"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            autoFocus
            style={{ padding:'10px 12px', border:'1px solid var(--border)', borderRadius:10, marginBottom:8 }}
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            style={{ padding:'10px 12px', border:'1px solid var(--border)', borderRadius:10, marginBottom:8 }}
          />
          {authErr && <div style={{ color:'crimson', fontSize:13, marginBottom:8 }}>{authErr}</div>}
          <button className="btn btn--brand" type="submit">Entrar</button>
        </form>
      </div>
    );
  }

  // ------- Página CreateGate -------
  const { data, loading, err, replaceItem, refresh, refreshing } = usePortones({ pollMs: 300000 });

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

  // Form crear
  const [nv, setNv] = useState('');
  const [nlista, setNlista] = useState('');
  const [sistemaOnCreate, setSistemaOnCreate] = useState(false);

  // Buscador
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(null);
  const hasQuery = !!(filter && String(filter).trim() !== '');

  const NV_COL_W = 150;
  const cols     = `${NV_COL_W}px repeat(${STAGES.length}, 1fr)`;

  const baseList = useMemo(() => {
    if (!Array.isArray(data)) return [];
    let arr = data.slice();

    // Orden: incompletos arriba, completados al fondo
    arr.sort((a, b) => {
      const da = doneCount(a), db = doneCount(b);
      if (da === STAGES.length && db !== STAGES.length) return 1;
      if (db === STAGES.length && da !== STAGES.length) return -1;
      if (a.nlista !== b.nlista) return String(a.nlista).localeCompare(String(b.nlista));
      return a.nv - b.nv;
    });

    if (!hasQuery) {
      // Sin búsqueda: ocultar totalmente finalizados
      arr = arr.filter(p => !isFullyDone(p));
    }
    return arr;
  }, [data, hasQuery]);

  const list = useMemo(() => {
    if (!hasQuery) return baseList;
    const n = Number(filter);
    if (Number.isNaN(n)) return baseList;
    return baseList.filter(p => p.nv === n || p.nlista === n);
  }, [baseList, filter, hasQuery]);

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
    const nNv = Number(nv);
    const nNl = Number(nlista);
    if (!Number.isInteger(nNv) || !Number.isInteger(nNl)) {
      alert('Ingresá NV y NLista como enteros.');
      return;
    }
    try {
      const { data: created } = await createPorton({ nv: nNv, nlista: nNl });
      if (sistemaOnCreate) {
        const updated = await finalizeSistema(created.id);
        alert(`Portón creado (Sistema): NV ${updated.nv} (lista ${updated.nlista})`);
      } else {
        alert(`Portón creado: NV ${created.nv} (lista ${created.nlista})`);
      }
      setNv(''); setNlista(''); setSistemaOnCreate(false);
      await refresh();
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  }

  async function handleCellClick(p, s) {
    const status = (p[s.key] || '').toLowerCase();
    if (status === 'pendiente') {
      if (confirm(`¿Iniciar "${s.label}" para NV ${p.nv}?`)) {
        try {
          const { data: updated } = await startStage(p.id, s.key);
          replaceItem(updated);
        } catch (e) { alert(e?.response?.data?.error || e.message); }
      }
    } else if (status === 'en proceso') {
      if (confirm(`¿Finalizar "${s.label}" para NV ${p.nv}?`)) {
        try {
          const { data: updated } = await stopStage(p.id, s.key);
          replaceItem(updated);
        } catch (e) { alert(e?.response?.data?.error || e.message); }
      }
    }
  }

  async function handleSetSistema(p) {
    if (isSistema(p)) return;
    if (!confirm(`Marcar NV ${p.nv} como "Sistema"? Esto finaliza Inyección y Revestimiento.`)) return;
    try {
      const updated = await finalizeSistema(p.id);
      replaceItem(updated);
      alert(`NV ${updated.nv} marcado como "Sistema".`);
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  }

  return (
    <div className="container">
      {/* Título + métricas + botones */}
      <div className="header-row" style={{ alignItems:'flex-start' }}>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="btn btn--brand"
          title="Refrescar datos"
        >
          {refreshing ? 'Actualizando…' : 'Refrescar'}
        </button>

        <h2 className="h1">PORTONES</h2>

        <div style={{ display:'flex', flexDirection:'column', gap:8, minWidth:280 }}>
          <div className="metric metric--ok" title="Armado Final = Finalizado y Despacho = Pendiente">
            Portones terminados en planta: {terminadosEnPlanta}
          </div>
          <div className="metric metric--warn" title="Al menos una etapa en 'En Proceso' (excepto Despacho)">
            Portones en proceso de fabricación: {enProcesoFabricacion}
          </div>
          <button className="btn" onClick={() => { logout(); setAuthed(false); }}>
            Salir
          </button>
        </div>
      </div>

      {/* Form crear */}
      <form onSubmit={handleCreate} style={{ display:'flex', gap:8, alignItems:'center', margin:'12px 0', flexWrap:'wrap' }}>
        <input
          type="number"
          placeholder="NV"
          value={nv}
          onChange={e => setNv(e.target.value)}
          style={{ padding:'8px 10px', border:'1px solid var(--border)', borderRadius:10, width:150 }}
        />
        <input
          type="number"
          placeholder="NLista"
          value={nlista}
          onChange={e => setNlista(e.target.value)}
          style={{ padding:'8px 10px', border:'1px solid var(--border)', borderRadius:10, width:150 }}
        />
        <label style={{ display:'flex', gap:6, alignItems:'center', marginLeft:8 }}>
          <input
            type="checkbox"
            checked={sistemaOnCreate}
            onChange={(e) => setSistemaOnCreate(e.target.checked)}
          />
          Sistema (finaliza Inyección y Revestimiento)
        </label>
        <button className="btn btn--brand" type="submit">Crear portón</button>
      </form>

      {/* Buscador */}
      <form
        onSubmit={(e) => { e.preventDefault(); setFilter(q.trim()); }}
        style={{ display:'flex', gap:8, alignItems:'center', margin:'6px 0 16px', flexWrap:'wrap' }}
      >
        <input
          type="text"
          placeholder="Buscar por NV o NLista (número)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ padding:'8px 10px', border:'1px solid var(--border)', borderRadius:10, minWidth:260 }}
          inputMode="numeric"
        />
        <button className="btn btn--brand" type="submit">Buscar</button>
        <button className="btn" type="button" onClick={() => { setQ(''); setFilter(null); }}>
          Limpiar
        </button>
      </form>

      {loading && <div>Cargando…</div>}
      {err && <div style={{ color:'crimson' }}>Error: {err}</div>}

      {/* Grid */}
      <div style={{ overflowX:'auto' }}>
        <div
          style={{
            display:'grid',
            gridTemplateColumns: `${NV_COL_W}px repeat(${STAGES.length}, 1fr)`,
            columnGap:6,
            rowGap:6,
            alignItems:'stretch',
            width:'max-content'
          }}
        >
          {/* Header */}
          <div className="cell" style={{ background:'var(--surface)', textAlign:'center', fontWeight:700 }}>
            NV / Lista / Sistema
          </div>
          {STAGES.map(s => (
            <div key={`h-${s.key}`} className="cell" style={{ background:'var(--surface)', textAlign:'center', fontWeight:700 }}>
              {s.label}
            </div>
          ))}

          {/* Filas */}
          {list.map(p => ([
            <div key={`nv-${p.id}`} className="cell" style={{ background:'var(--surface)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
              <div style={{ display:'flex', flexDirection:'column', lineHeight:1.15 }}>
                <strong>NV {p.nv}</strong>
                <span style={{ fontSize:12, color:'var(--muted)' }}>Lista {p.nlista}</span>
              </div>
              <label style={{ display:'flex', gap:6, alignItems:'center', fontSize:12 }}>
                <input
                  type="checkbox"
                  checked={isSistema(p)}
                  disabled={isSistema(p)}
                  onChange={() => handleSetSistema(p)}
                  title={isSistema(p) ? 'Ya es Sistema' : 'Marcar como Sistema (finaliza Inyección y Revestimiento)'}
                />
                Sistema
              </label>
            </div>,
            ...STAGES.map(s => {
              const st  = p[s.key];
              const ini = p[`${s.key}_inicio`];
              const fin = p[`${s.key}_fin`];
              const lower = (st || '').toLowerCase();
              const isClickable = lower === 'pendiente' || lower === 'en proceso';
              const title = [
                `Estado: ${st || ''}`,
                ini ? `Inicio: ${fmt(ini)}` : null,
                fin ? `Fin: ${fmt(fin)}` : null,
                isClickable ? (lower === 'pendiente' ? 'Click: Iniciar (En Proceso)' : 'Click: Finalizar') : 'Finalizado'
              ].filter(Boolean).join('\n');

              return (
                <div
                  key={`${p.id}-${s.key}`}
                  className={classForStatus(st)}
                  title={title}
                  onClick={() => isClickable && (async () => {
                    const confirmMsg = lower === 'pendiente'
                      ? `¿Iniciar "${s.label}" para NV ${p.nv}?`
                      : `¿Finalizar "${s.label}" para NV ${p.nv}?`;
                    if (!confirm(confirmMsg)) return;
                    try {
                      const { data: updated } = lower === 'pendiente'
                        ? await startStage(p.id, s.key)
                        : await stopStage(p.id, s.key);
                      replaceItem(updated);
                    } catch (e) {
                      alert(e?.response?.data?.error || e.message);
                    }
                  })()}
                  style={{ cursor: isClickable ? 'pointer' : 'default', outline: isClickable ? '2px dashed rgba(0,0,0,.12)' : 'none' }}
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

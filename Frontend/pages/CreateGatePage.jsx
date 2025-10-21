import { useMemo, useState } from 'react';
import usePortones from '../src/hooks/usePortones';
import { createPorton, startStage, stopStage } from '../src/api';
import { isAuthed, login, logout } from '../src/auth/createGateAuth';

const STAGES = [
  { key: 'diseno',                 label: 'Diseño' },
  { key: 'laser',                  label: 'Laser' },
  { key: 'guillotina',             label: 'Corte' },
  { key: 'plegadora',              label: 'Plegado' },
  { key: 'armado_piernas',         label: 'Armado Piernas' },
  { key: 'armado_marco_piernas',   label: 'Armado Marco Piernas' },
  { key: 'armado_hojas',           label: 'Armado Hojas' },
  { key: 'armado_primario',        label: 'Armado Primario' },
  { key: 'inyeccion',              label: 'Inyección' },
  { key: 'revestimiento',          label: 'Revestimiento' },
  { key: 'pintura',                label: 'Pintura' },
  { key: 'armado_final',           label: 'Armado Final' },
  { key: 'despacho',               label: 'Despacho' },
];

const COLORS = {
  'finalizado': '#32a852',
  'en proceso': '#e6c229',
  'pendiente':  '#f7b1b1',
  'default':    '#eee'
};

const NV_COL_W   = 150;
const GRID_GAP   = 6;
const CELL_PAD   = 8;
const CELL_MIN_H = 60;
const bordo      = '#008241ff';

function fmt(dt) {
  if (!dt) return '';
  try { return new Date(dt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return ''; }
}
function cellBg(status) {
  const s = (status || '').toLowerCase();
  return COLORS[s] || COLORS.default;
}
function isSistema(porton) {
  return (porton.inyeccion || '').toLowerCase() === 'finalizado' &&
         (porton.revestimiento || '').toLowerCase() === 'finalizado';
}

export default function CreateGatePage() {
  // ------- Login simple -------
  const [authed, setAuthed] = useState(isAuthed());
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [authErr, setAuthErr] = useState('');

  if (!authed) {
    return (
      <div style={{ height: '100vh', display: 'grid', placeItems: 'center', background: '#f7fff3', fontFamily: 'system-ui, sans-serif' }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (login(user.trim(), pass)) {
              setAuthed(true);
              setAuthErr('');
              setPass('');
            } else {
              setAuthErr('Usuario o contraseña inválidos');
            }
          }}
          style={{
            width: 340,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            border: `3px solid ${bordo}`,
            borderRadius: 12,
            padding: 18,
            background: 'white',
          }}
        >
          <h3 style={{ margin: 0, color: bordo, textAlign: 'center' }}>Acceso CreateGate</h3>
          <input
            placeholder="Usuario"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            autoFocus
            style={{ padding: '10px 12px', border: '1px solid #ccc', borderRadius: 8 }}
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            style={{ padding: '10px 12px', border: '1px solid #ccc', borderRadius: 8 }}
          />
          {authErr && <div style={{ color: 'crimson', fontSize: 13 }}>{authErr}</div>}
          <button type="submit" style={{ padding: '10px 12px', borderRadius: 8, fontWeight: 700 }}>
            Entrar
          </button>
        </form>
      </div>
    );
  }

  // ------- Página CreateGate (tu contenido previo) -------
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

  const list = useMemo(() => {
    if (!Array.isArray(data)) return [];
    if (filter === null || filter === '') return data;
    const n = Number(filter);
    if (Number.isNaN(n)) return data;
    return data.filter(p => p.nv === n || p.nlista === n);
  }, [data, filter]);

  const cols        = `${NV_COL_W}px repeat(${STAGES.length}, 1fr)`;
  const cellBase    = { border: `2px solid ${bordo}`, padding: CELL_PAD, boxSizing: 'border-box' };
  const headerCell  = { ...cellBase, background: '#fafafa', fontWeight: 700, textAlign: 'center' };
  const nvCell      = { ...cellBase, background: '#fff', minHeight: CELL_MIN_H, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingLeft: 10, paddingRight: 10 };

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
        } catch (e) {
          alert(e?.response?.data?.error || e.message);
        }
      }
    } else if (status === 'en proceso') {
      if (confirm(`¿Finalizar "${s.label}" para NV ${p.nv}?`)) {
        try {
          const { data: updated } = await stopStage(p.id, s.key);
          replaceItem(updated);
        } catch (e) {
          alert(e?.response?.data?.error || e.message);
        }
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
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      {/* Título + métricas + botón salir */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <button
     onClick={refresh}
      disabled={refreshing}
      style={{ padding: '6px 10px', borderRadius: 8 }}
    >
      {refreshing ? 'Actualizando…' : 'Refrescar'}
    </button>
        <h2 style={{ color: bordo, border: `3px solid ${bordo}`, padding: 8, margin: 0 }}>
          PORTONES
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 280 }}>
          <div
            style={{
              border: `3px solid ${bordo}`,
              padding: '8px 12px',
              borderRadius: 10,
              fontWeight: 800,
              background: '#fff8f8',
              textAlign: 'center'
            }}
            title="Armado Final = Finalizado y Despacho = Pendiente"
          >
            Portones terminados en planta: {terminadosEnPlanta}
          </div>

          <div
            style={{
              border: `3px solid ${bordo}`,
              padding: '8px 12px',
              borderRadius: 10,
              fontWeight: 800,
              background: '#f7fff3',
              textAlign: 'center'
            }}
            title="Al menos una etapa en 'En Proceso' (excepto Despacho)"
          >
            Portones en proceso de fabricación: {enProcesoFabricacion}
          </div>

          <button
            onClick={() => { logout(); setAuthed(false); }}
            style={{ marginTop: 4, padding: '6px 10px', borderRadius: 8 }}
            title="Cerrar sesión de CreateGate"
          >
            Salir
          </button>
        </div>
      </div>

      {/* Form crear */}
      <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0', flexWrap: 'wrap' }}>
        <input
          type="number"
          placeholder="NV"
          value={nv}
          onChange={e => setNv(e.target.value)}
          style={{ padding: '8px 10px', border: `1px solid ${bordo}`, borderRadius: 8, width: 150 }}
        />
        <input
          type="number"
          placeholder="NLista"
          value={nlista}
          onChange={e => setNlista(e.target.value)}
          style={{ padding: '8px 10px', border: `1px solid ${bordo}`, borderRadius: 8, width: 150 }}
        />
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 8 }}>
          <input
            type="checkbox"
            checked={sistemaOnCreate}
            onChange={(e) => setSistemaOnCreate(e.target.checked)}
          />
          Sistema (finaliza Inyección y Revestimiento)
        </label>
        <button type="submit" style={{ padding: '8px 12px' }}>Crear portón</button>
      </form>

      {/* Buscador */}
      <form
        onSubmit={(e) => { e.preventDefault(); setFilter(q.trim()); }}
        style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0 16px', flexWrap: 'wrap' }}
      >
        <input
          type="text"
          placeholder="Buscar por NV o NLista (número)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ padding: '8px 10px', border: `1px solid ${bordo}`, borderRadius: 8, minWidth: 260 }}
          inputMode="numeric"
        />
        <button type="submit" style={{ padding: '8px 12px' }}>Buscar</button>
        <button type="button" onClick={() => { setQ(''); setFilter(null); }} style={{ padding: '8px 12px' }}>
          Limpiar
        </button>
      </form>

      {loading && <div>Cargando…</div>}
      {err && <div style={{ color: 'crimson' }}>Error: {err}</div>}

      {/* Grid */}
      <div style={{ overflowX: 'auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `${NV_COL_W}px repeat(${STAGES.length}, 1fr)`,
            columnGap: GRID_GAP,
            rowGap: GRID_GAP,
            alignItems: 'stretch',
            width: 'max-content'
          }}
        >
          {/* Header */}
          <div style={{ ...headerCell, textAlign: 'center' }}>
            NV / Lista / Sistema
          </div>
          {STAGES.map(s => (
            <div key={`h-${s.key}`} style={{ ...headerCell, textAlign: 'center' }}>
              {s.label}
            </div>
          ))}

          {/* Filas */}
          {list.map(p => ([
            <div key={`nv-${p.id}`} style={nvCell}>
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                <strong>NV {p.nv}</strong>
                <span style={{ fontSize: 12, opacity: 0.8 }}>Lista {p.nlista}</span>
              </div>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
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

              return (
                <div
                  key={`${p.id}-${s.key}`}
                  onClick={() => isClickable && handleCellClick(p, s)}
                  style={{
                    ...cellBase,
                    background: cellBg(st),
                    minHeight: CELL_MIN_H,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    cursor: isClickable ? 'pointer' : 'default',
                    outline: isClickable ? `2px dashed rgba(0,0,0,0.12)` : 'none'
                  }}
                  title={[
                    `Estado: ${st || ''}`,
                    ini ? `Inicio: ${fmt(ini)}` : null,
                    fin ? `Fin: ${fmt(fin)}` : null,
                    isClickable
                      ? (lower === 'pendiente' ? 'Click: Iniciar (En Proceso)' : 'Click: Finalizar')
                      : 'Finalizado'
                  ].filter(Boolean).join('\n')}
                >
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{st || ''}</div>
                  <div style={{ fontSize: 11 }}>{ini ? `Inicio: ${fmt(ini)}` : ''}</div>
                  <div style={{ fontSize: 11 }}>{fin ? `Fin: ${fmt(fin)}` : ''}</div>
                </div>
              );
            })
          ]))}

          {!loading && list.length === 0 && (
            <div style={{ gridColumn: `1 / span ${STAGES.length + 1}`, marginTop: 12, opacity: 0.7 }}>Sin resultados.</div>
          )}
        </div>
      </div>
    </div>
  );
}

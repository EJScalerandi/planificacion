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

export default function PlantaReadOnlyPage() {
  const { data, loading, err, refresh, refreshing } = usePortones({ pollMs: 300000 });

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

  // Buscador
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(null);
  const hasQuery = !!(filter && String(filter).trim() !== '');

  const NV_COL_W = 150;
  const cols     = `${NV_COL_W}px repeat(${STAGES.length}, 1fr)`;

  const list = useMemo(() => {
    if (!Array.isArray(data)) return [];
    if (!hasQuery) {
      // ocultar totalmente finalizados si no hay búsqueda
      return data.filter(p => !isFullyDone(p));
    }
    const n = Number(filter);
    if (Number.isNaN(n)) return data;
    return data.filter(p => p.nv === n || p.nlista === n);
  }, [data, filter, hasQuery]);

  return (
    <div className="container">
      {/* Contadores a la izquierda + Título + Refresh */}
      <div className="header-row" style={{ alignItems:'flex-start', gap:16 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:10, minWidth:320 }}>
          <div className="metric metric--ok" title="Armado Final = Finalizado y Despacho = Pendiente">
            Portones terminados en planta: {terminadosEnPlanta}
          </div>
          <div className="metric metric--warn" title="Al menos una etapa en 'En Proceso' (excepto Despacho)">
            Portones en proceso de fabricación: {enProcesoFabricacion}
          </div>
        </div>

        <h2 className="h1">PLANTA (Solo lectura)</h2>

        <button className="btn btn--brand" onClick={refresh} disabled={refreshing}>
          {refreshing ? 'Actualizando…' : 'Refrescar'}
        </button>
      </div>

      {/* Buscador */}
      <form
        onSubmit={(e) => { e.preventDefault(); setFilter(q.trim()); }}
        style={{ display:'flex', gap:8, alignItems:'center', margin:'12px 0', flexWrap:'wrap' }}
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
            gridTemplateColumns: cols,
            columnGap:6,
            rowGap:6,
            alignItems:'stretch',
            width:'max-content'
          }}
        >
          <div className="cell" style={{ background:'var(--surface)', textAlign:'center', fontWeight:700 }}>
            NV / Lista
          </div>
          {STAGES.map(s => (
            <div key={`h-${s.key}`} className="cell" style={{ background:'var(--surface)', textAlign:'center', fontWeight:700 }}>
              {s.label}
            </div>
          ))}

          {list.map(p => ([
            <div key={`nv-${p.id}`} className="cell" style={{ background:'var(--surface)', display:'flex', gap:6, flexDirection:'column', justifyContent:'center' }}>
              <strong>NV {p.nv}</strong>
              <div style={{ fontSize:12, color:'var(--muted)' }}>Lista {p.nlista}</div>
              {isSistema(p) && (
                <div style={{
                  fontSize:11, background:'#eee', padding:'2px 8px',
                  borderRadius:999, border:'1px solid #ddd', alignSelf:'center'
                }}>
                  Sistema
                </div>
              )}
            </div>,
            ...STAGES.map(s => {
              const st  = p[s.key];
              const ini = p[`${s.key}_inicio`];
              const fin = p[`${s.key}_fin`];
              return (
                <div
                  key={`${p.id}-${s.key}`}
                  className={classForStatus(st)}
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

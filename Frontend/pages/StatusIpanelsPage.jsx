import { useMemo, useState } from 'react';
import useIpanels from '../src/hooks/useIpanels';

const IP_STAGES = [
  { key: 'guillotina', label: 'Corte' },
  { key: 'plegado',    label: 'Plegado' },
  { key: 'pintura',    label: 'Pintura' },
  { key: 'inyeccion',  label: 'Inyección' },
  { key: 'despacho',   label: 'Despacho' }, // ya disponible en backend
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

function isFullyDoneIP(i) {
  return IP_STAGES.every(st => (i[st.key] || '').toLowerCase() === 'finalizado');
}

export default function StatusIpanelsPage() {
  const { data, loading, err, refresh, refreshing } = useIpanels({ pollMs: 300000 });

  // ===== Buscador (por NV o Partida) =====
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(null);
  const hasQuery = !!(filter && String(filter).trim() !== '');

  const list = useMemo(() => {
    if (!Array.isArray(data)) return [];
    if (!hasQuery) {
      // Sin búsqueda: ocultar completamente finalizados
      return data.filter(i => !isFullyDoneIP(i));
    }
    // Con búsqueda: por NV o Partida
    const n = Number(filter);
    if (Number.isNaN(n)) return data;
    return data.filter(i => i.nv === n || i.partida === n);
  }, [data, filter, hasQuery]);

  const NV_COL_W = 150;
  const cols = `${NV_COL_W}px repeat(${IP_STAGES.length}, 1fr)`;

  return (
    <div className="container-fluid">{/* ancho completo */}
      <div className="header-row">
        <h2 className="h1">STATUS iPANELS</h2>
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
          placeholder="Buscar por NV o Partida (número)"
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
            columnGap: 6,
            rowGap: 6,
            alignItems:'stretch',
            width:'max-content'
          }}
        >
          {/* Header */}
          <div className="cell" style={{ background:'var(--surface)', textAlign:'center', fontWeight:700 }}>
            NV / Partida
          </div>
          {IP_STAGES.map(s => (
            <div key={`h-${s.key}`} className="cell" style={{ background:'var(--surface)', textAlign:'center', fontWeight:700 }}>
              {s.label}
            </div>
          ))}

          {/* Filas */}
          {list.map(i => ([
            <div
              key={`nv-${i.id}`}
              className="cell"
              style={{ background:'var(--surface)', display:'flex', gap:6, flexDirection:'column', justifyContent:'center' }}
            >
              <strong>NV {i.nv}</strong>
              <div style={{ fontSize:12, color:'var(--muted)' }}>Partida {i.partida ?? '—'}</div>
            </div>,
            ...IP_STAGES.map(s => {
              const st  = i[s.key];
              const ini = i[`${s.key}_inicio`];
              const fin = i[`${s.key}_fin`];
              return (
                <div
                  key={`${i.id}-${s.key}`}
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
            <div style={{ gridColumn:`1 / span ${IP_STAGES.length + 1}`, marginTop:12, opacity:.7 }}>
              Sin resultados.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

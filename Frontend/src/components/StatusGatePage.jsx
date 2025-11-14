// src/components/StatusGatePage.jsx
import { useMemo, useState, useEffect } from 'react';
import usePortones from '../hooks/usePortones';
import { setPortonObservaciones } from '../api';

const STAGES = [
  { key: 'diseno',          label: 'Diseño' },
  { key: 'armado_primario', label: 'Armado Primario' },
  { key: 'revestimiento',   label: 'Revestimiento' },
  { key: 'pintura',         label: 'Pintura' },
  { key: 'armado_final',    label: 'Armado Final' },
  { key: 'despacho',        label: 'Despacho' },
];

function fmt(dt) {
  if (!dt) return '';
  try { return new Date(dt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return ''; }
}

const dateOnly = (v) => {
  if (!v) return '';
  try {
    const d = new Date(v);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  } catch {
    return '';
  }
};

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

/** ==== MODAL SOLO PARA OBSERVACIONES (local state, sin lag) ==== */
function PortonObsModal({ open, target, onClose, onSave }) {
  const [draft, setDraft] = useState(target?.observaciones || '');
  const [saving, setSaving] = useState(false);

  // cuando cambia el portón, reseteo el texto
  useEffect(() => {
    setDraft(target?.observaciones || '');
  }, [target]);

  if (!open || !target) return null;

  const handleSaveClick = async () => {
    try {
      setSaving(true);
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position:'fixed',
        inset:0,
        background:'rgba(0,0,0,.45)',
        display:'grid',
        placeItems:'center',
        zIndex:9999
      }}
      onClick={onClose}
    >
      <div
        style={{
          background:'var(--surface)',
          padding:20,
          borderRadius:12,
          minWidth:320,
          maxWidth:520,
          boxShadow:'0 10px 30px rgba(0,0,0,.25)',
          display:'flex',
          flexDirection:'column',
          gap:10
        }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ margin:0 }}>
          Observaciones NV {target.nv}{target.nlista ? ` - Portón ${target.nlista}` : ''}
        </h3>
        {target.partida != null && (
          <div style={{ fontSize:13, opacity:.8 }}>Partida: {target.partida}</div>
        )}

        <textarea
          rows={6}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          className="btn"
          style={{ resize:'vertical', fontFamily:'inherit', lineHeight:1.3 }}
          placeholder="Escribí notas internas, aclaraciones, etc."
        />

        <div style={{ display:'flex', justifyContent:'space-between', gap:8, marginTop:6 }}>
          <button
            type="button"
            className="btn"
            onClick={() => setDraft('')}
          >
            Limpiar texto
          </button>
          <div style={{ display:'flex', gap:8 }}>
            <button
              type="button"
              className="btn"
              onClick={onClose}
              disabled={saving}
            >
              Cerrar
            </button>
            <button
              type="button"
              className="btn btn--brand"
              onClick={handleSaveClick}
              disabled={saving}
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** ==== PÁGINA PRINCIPAL ==== */
export default function StatusGatePage() {
  const { data, loading, err, refresh, refreshing } = usePortones({ pollMs: 300000 });

  // Buscador
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(null);
  const hasQuery = !!(filter && String(filter).trim() !== '');

  const list = useMemo(() => {
    if (!Array.isArray(data)) return [];
    if (!hasQuery) return data.filter(p => !isFullyDone(p));
    const n = Number(filter);
    if (Number.isNaN(n)) return data;
    return data.filter(p => p.nv === n || p.nlista === n);
  }, [data, filter, hasQuery]);

  // Estado solo de qué portón tiene el popup abierto
  const [obsOpen, setObsOpen] = useState(false);
  const [obsTarget, setObsTarget] = useState(null);

  const openObsModal = (p) => {
    setObsTarget(p);
    setObsOpen(true);
  };
  const closeObsModal = () => {
    setObsOpen(false);
    setObsTarget(null);
  };

  const handleSaveObs = async (texto) => {
    if (!obsTarget) return;
    await setPortonObservaciones(obsTarget.id, texto);
    await refresh();
    closeObsModal();
  };

  const NV_COL_W       = 150;
  const CONTACT_COL_W  = 88;
  const FECHA_COL_W    = 190;
  const cols = `${NV_COL_W}px ${CONTACT_COL_W}px ${FECHA_COL_W}px repeat(${STAGES.length}, 1fr)`;

  return (
    <div className="container-fluid">
      <div className="header-row">
        <h2 className="h1">STATUS GATE</h2>
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
            columnGap: 6,
            rowGap: 6,
            alignItems:'stretch',
            width:'max-content'
          }}
        >
          {/* Header */}
          <div className="cell" style={{ background:'var(--surface)', textAlign:'center', fontWeight:700 }}>
            NV / Lista / Partida
          </div>
          <div className="cell" style={{ background:'var(--surface)', textAlign:'center', fontWeight:700 }}>
            Contacto cliente
          </div>
          <div className="cell" style={{ background:'var(--surface)', textAlign:'center', fontWeight:700 }}>
            Fecha despacho
          </div>
          {STAGES.map(s => (
            <div key={`h-${s.key}`} className="cell" style={{ background:'var(--surface)', textAlign:'center', fontWeight:700 }}>
              {s.label}
            </div>
          ))}

          {/* Filas */}
          {list.map(p => {
            const hasFecha = !!dateOnly(p.fecha_plan);
            return ([
              <div
                key={`nv-${p.id}`}
                className="cell"
                style={{
                  background:'var(--surface)',
                  display:'flex',
                  gap:6,
                  flexDirection:'column',
                  justifyContent:'center',
                  cursor:'pointer'
                }}
                onClick={() => openObsModal(p)}
                title="Click para ver/editar observaciones"
              >
                <strong>NV {p.nv}</strong>
                <div style={{ fontSize:12, color:'var(--muted)' }}>N° Portón {p.nlista}</div>
                <div style={{ fontSize:12, color:'var(--muted)' }}>N° Partida {p.partida ?? '—'}</div>
                {isSistema(p) && (
                  <div style={{
                    fontSize:11, background:'#eee', padding:'2px 8px',
                    borderRadius:999, border:'1px solid #ddd', alignSelf:'flex-start'
                  }}>
                    Sistema
                  </div>
                )}
                {p.observaciones && (
                  <span style={{ fontSize:11, marginTop:4, color:'#555' }}>
                    📝 {p.observaciones.slice(0, 40)}{p.observaciones.length > 40 ? '…' : ''}
                  </span>
                )}
              </div>,

              <div
                key={`contacto-${p.id}`}
                className="cell"
                style={{ background:'var(--surface)', display:'grid', placeItems:'center' }}
                title={hasFecha ? 'Contacto realizado' : 'Sin contacto asignado'}
              >
                <div
                  style={{
                    width:16, height:16, borderRadius:999,
                    background: hasFecha ? '#10b981' : '#ef4444',
                    boxShadow: hasFecha
                      ? '0 0 0 2px rgba(16,185,129,.3)'
                      : '0 0 0 2px rgba(239,68,68,.3)'
                  }}
                />
              </div>,

              <div
                key={`fecha-${p.id}`}
                className="cell"
                style={{ background:'var(--surface)', display:'grid', placeItems:'center', fontWeight:600 }}
                title={p.fecha_plan ? `Fecha: ${fmt(p.fecha_plan)}` : 'Sin fecha asignada'}
              >
                {dateOnly(p.fecha_plan)}
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
            ]);
          })}

          {!loading && list.length === 0 && (
            <div style={{ gridColumn:`1 / span ${STAGES.length + 3}`, marginTop:12, opacity:.7 }}>
              Sin resultados.
            </div>
          )}
        </div>
      </div>

      {/* Modal (usa estado local, no toca la grilla al tipear) */}
      <PortonObsModal
        open={obsOpen}
        target={obsTarget}
        onClose={closeObsModal}
        onSave={handleSaveObs}
      />
    </div>
  );
}

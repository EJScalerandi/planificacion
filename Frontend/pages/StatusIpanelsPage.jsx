// src/pages/StatusIpanelsPage.jsx
import { useMemo, useState, useEffect } from 'react';
import useIpanels from '../src/hooks/useIpanels';
import { setIpanelObservaciones } from '../src/api';

const IP_STAGES = [
  { key: 'diseno',    label: 'Diseño' },
  { key: 'guillotina', label: 'Corte' },
  { key: 'plegado',    label: 'Plegado' },
  { key: 'pintura',    label: 'Pintura' },
  { key: 'inyeccion',  label: 'Inyección' },
  { key: 'despacho',   label: 'Despacho' },
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

/* ==== MODAL DE OBSERVACIONES iPANEL (estado local, sin lag) ==== */
function IpanelObsModal({ open, target, onClose, onSave }) {
  const [draft, setDraft] = useState(target?.observaciones || '');
  const [saving, setSaving] = useState(false);

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
          Observaciones iPanel NV {target.nv}
          {target.partida != null ? ` - Partida ${target.partida}` : ''}
        </h3>

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

/* ==== PÁGINA PRINCIPAL STATUS iPANELS ==== */
export default function StatusIpanelsPage() {
  const { data, loading, err, refresh, refreshing } = useIpanels({ pollMs: 300000 });

  // Buscador (NV / Partida)
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(null);
  const hasQuery = !!(filter && String(filter).trim() !== '');

  const list = useMemo(() => {
    if (!Array.isArray(data)) return [];
    if (!hasQuery) {
      // Sin búsqueda: ocultar completamente finalizados
      return data.filter(i => !isFullyDoneIP(i));
    }
    const n = Number(filter);
    if (Number.isNaN(n)) return data;
    return data.filter(i => i.nv === n || i.partida === n);
  }, [data, filter, hasQuery]);

  // Estado del popup de observaciones
  const [obsOpen, setObsOpen] = useState(false);
  const [obsTarget, setObsTarget] = useState(null);

  const openObsModal = (ip) => {
    setObsTarget(ip);
    setObsOpen(true);
  };
  const closeObsModal = () => {
    setObsOpen(false);
    setObsTarget(null);
  };

  const handleSaveObs = async (texto) => {
    if (!obsTarget) return;
    await setIpanelObservaciones(obsTarget.id, texto);
    await refresh();
    closeObsModal();
  };

  const NV_COL_W = 150;
  const cols = `${NV_COL_W}px repeat(${IP_STAGES.length}, 1fr)`;

  return (
    <div className="container-fluid">
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
            // NV/Partida: abre modal
            <div
              key={`nv-${i.id}`}
              className="cell"
              style={{
                background:'var(--surface)',
                display:'flex',
                gap:6,
                flexDirection:'column',
                justifyContent:'center',
                cursor:'pointer'
              }}
              onClick={() => openObsModal(i)}
              title="Click para ver/editar observaciones"
            >
              <strong>NV {i.nv}</strong>
              <div style={{ fontSize:12, color:'var(--muted)' }}>
                Partida {i.partida ?? '—'}
              </div>
              {i.observaciones && (
                <span style={{ fontSize:11, marginTop:4, color:'#555' }}>
                  📝 {i.observaciones.slice(0, 40)}{i.observaciones.length > 40 ? '…' : ''}
                </span>
              )}
            </div>,

            // Estados por etapa
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

      {/* Modal observaciones iPanel */}
      <IpanelObsModal
        open={obsOpen}
        target={obsTarget}
        onClose={closeObsModal}
        onSave={handleSaveObs}
      />
    </div>
  );
}

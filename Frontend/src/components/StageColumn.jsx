import React from 'react';

const bordo = '#008241ff';

export default function StageColumn({
  title,
  stageKey,
  items = [],
  onStart,
  onStop,
  disabledId,
}) {
  const low = v => (v || '').toLowerCase();

  function readyForArmadoFinal(p) {
    return low(p.pintura) === 'finalizado' && low(p.revestimiento) === 'finalizado';
  }

  const filtered = (items || []).filter(p => {
    const st = low(p[stageKey]);
    if (!(st === 'pendiente' || st === 'en proceso')) return false;
    if (stageKey === 'armado_final') return readyForArmadoFinal(p);
    return true;
  });

  const ordered = filtered.sort((a, b) => {
    const rank = s => (s === 'en proceso' ? 0 : s === 'pendiente' ? 1 : 2);
    const ra = rank(low(a[stageKey]));
    const rb = rank(low(b[stageKey]));
    if (ra !== rb) return ra - rb;

    const ia = a[`${stageKey}_inicio`] ? new Date(a[`${stageKey}_inicio`]).getTime() : Infinity;
    const ib = b[`${stageKey}_inicio`] ? new Date(b[`${stageKey}_inicio`]).getTime() : Infinity;
    if (ia !== ib) return ia - ib;

    return (a.nlista || 0) - (b.nlista || 0) || (a.nv || 0) - (b.nv || 0);
  });

  const fmt = dt => dt ? new Date(dt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '';

  return (
    <div style={{
      border: `2px solid ${bordo}`,
      borderRadius: 12,
      overflow: 'hidden',
      background: '#fff',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 320
    }}>
      <div style={{
        background: bordo,
        color: '#fff',
        fontWeight: 800,
        padding: '10px 12px'
      }}>
        {title}
      </div>

      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ordered.map(p => {
          const st = low(p[stageKey]);
          const canStop = st === 'en proceso';
          const canStart = st === 'pendiente';
          return (
            <div
              key={p.id}
              className="stage-card__grid"
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: '10px 12px',
                background: '#fff'
              }}
            >
              <div>
                <div className="stage-card__title" style={{ fontWeight: 900 }}>N° Portón {p.nlista}</div>
                <div className="stage-card__title">Partida {p.Partida}</div>
                <div className="stage-card__sub">NV {p.nv}</div>
                <div style={{ fontSize: 12, opacity: .75 }}>Estado: {p[stageKey] || ''}</div>
                {p[`${stageKey}_inicio`] && <div style={{ fontSize: 12 }}>Inicio: {fmt(p[`${stageKey}_inicio`])}</div>}
                {p[`${stageKey}_fin`]    && <div style={{ fontSize: 12 }}>Fin: {fmt(p[`${stageKey}_fin`])}</div>}
              </div>

              <div className="actions" style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn--brand"
                  onClick={() => onStart && onStart(p.id, stageKey)}
                  disabled={!canStart || disabledId === p.id}
                  title="Iniciar (En Proceso)"
                  style={{ fontSize: 18, padding: '8px 10px', borderRadius: 10 }}
                >
                  ▶
                </button>
                <button
                  className="btn"
                  onClick={() => onStop && onStop(p.id, stageKey)}
                  disabled={!canStop || disabledId === p.id}
                  title="Finalizar"
                  style={{ fontSize: 18, padding: '8px 10px', borderRadius: 10 }}
                >
                  ⏹
                </button>
              </div>
            </div>
          );
        })}

        {ordered.length === 0 && (
          <div style={{ opacity: .6, fontSize: 13 }}>
            {stageKey === 'armado_final'
              ? 'Sin elementos. Esperando Pintura y Revestimiento finalizados.'
              : 'Sin elementos.'}
          </div>
        )}
      </div>
    </div>
  );
}

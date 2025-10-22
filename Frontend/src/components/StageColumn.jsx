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
  // Solo mostramos Pendiente / En Proceso
  const filtered = (items || []).filter(p => {
    const st = (p[stageKey] || '').toLowerCase();
    return st === 'pendiente' || st === 'en proceso';
  });

  // --- ORDEN: En Proceso primero, luego Pendiente ---
  const ordered = filtered.sort((a, b) => {
    const rank = s => (s === 'en proceso' ? 0 : s === 'pendiente' ? 1 : 2);
    const ra = rank((a[stageKey] || '').toLowerCase());
    const rb = rank((b[stageKey] || '').toLowerCase());
    if (ra !== rb) return ra - rb;

    // Dentro de "En Proceso", que queden primero los que tienen inicio más antiguo
    const ia = a[`${stageKey}_inicio`] ? new Date(a[`${stageKey}_inicio`]).getTime() : Infinity;
    const ib = b[`${stageKey}_inicio`] ? new Date(b[`${stageKey}_inicio`]).getTime() : Infinity;
    if (ia !== ib) return ia - ib;

    // Tie-breaker por nlista y nv
    return (a.nlista || 0) - (b.nlista || 0) || (a.nv || 0) - (b.nv || 0);
  });

  const fmt = dt => (dt ? new Date(dt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '');

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
          const st = (p[stageKey] || '').toLowerCase();
          const canStop = st === 'en proceso';
          const canStart = st === 'pendiente';
          return (
            <div key={p.id} style={{
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              padding: '10px 12px',
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 8,
              alignItems: 'center'
            }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>NLista {p.nlista}</div>
                <div style={{ fontSize: 12, opacity: .75 }}>NV {p.nv}</div>
                <div style={{ fontSize: 12, opacity: .75 }}>Estado: {p[stageKey] || ''}</div>
                {p[`${stageKey}_inicio`] && <div style={{ fontSize: 12 }}>Inicio: {fmt(p[`${stageKey}_inicio`])}</div>}
                {p[`${stageKey}_fin`]    && <div style={{ fontSize: 12 }}>Fin: {fmt(p[`${stageKey}_fin`])}</div>}
              </div>

              <div className="actions" style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn--icon-lg btn--brand"
                  onClick={() => onStart && onStart(p.id, stageKey)}
                  disabled={!canStart || disabledId === p.id}
                  title="Iniciar (En Proceso)"
                >
                  ▶
                </button>
                <button
                  className="btn btn--icon-lg"
                  onClick={() => onStop && onStop(p.id, stageKey)}
                  disabled={!canStop || disabledId === p.id}
                  title="Finalizar"
                >
                  ⏹
                </button>
              </div>
            </div>
          );
        })}

        {ordered.length === 0 && (
          <div style={{ opacity: .6, fontSize: 13 }}>Sin elementos.</div>
        )}
      </div>
    </div>
  );
}

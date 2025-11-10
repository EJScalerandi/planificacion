import React from 'react';

const bordo = '#008241ff';

export default function StageColumn({
  title,
  stageKey,              // 'guillotina', 'plegadora', 'pintura', 'inyeccion'
  mode = 'porton',       // 'porton' | 'ipanel'
  items = [],
  onStart,
  onStop,
  disabledId,
}) {
  const low = v => (v || '').toLowerCase();

  // iPanel usa 'plegado' en vez de 'plegadora'
  const effKey = mode === 'ipanel' && stageKey === 'plegadora'
    ? 'plegado'
    : stageKey;

  // Mostrar Pendiente / En Proceso
  const filtered = (items || []).filter(p => {
    const st = low(p[effKey]);
    return st === 'pendiente' || st === 'en proceso';
  });

  // Orden:
  // 1) En proceso primero (más antiguos arriba)
  // 2) Pendientes por partida (vacías al final), luego nv, luego nlista
  const ordered = filtered.sort((a, b) => {
    const aStarted = low(a[effKey]) === 'en proceso';
    const bStarted = low(b[effKey]) === 'en proceso';
    if (aStarted !== bStarted) return aStarted ? -1 : 1;

    if (aStarted && bStarted) {
      const ia = a[`${effKey}_inicio`] ? new Date(a[`${effKey}_inicio`]).getTime() : 0;
      const ib = b[`${effKey}_inicio`] ? new Date(b[`${effKey}_inicio`]).getTime() : 0;
      if (ia !== ib) return ia - ib;
      const pa = a.partida != null ? Number(a.partida) : Infinity;
      const pb = b.partida != null ? Number(b.partida) : Infinity;
      if (pa !== pb) return pa - pb;
      return (a.nv || 0) - (b.nv || 0);
    }

    const pa = a.partida != null ? Number(a.partida) : Infinity;
    const pb = b.partida != null ? Number(b.partida) : Infinity;
    if (pa !== pb) return pa - pb;

    if ((a.nv || 0) !== (b.nv || 0)) return (a.nv || 0) - (b.nv || 0);
    return (a.nlista || 0) - (b.nlista || 0);
  });

  const fmt = dt =>
    dt ? new Date(dt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '';

  return (
    <div style={{
      border: `2px solid ${bordo}`,
      borderRadius: 12,
      overflow: 'hidden',
      background: 'var(--surface)',          // ⬅️ usa token (no #fff)
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
          const st = low(p[effKey]);
          const canStop = st === 'en proceso';
          const canStart = st === 'pendiente';

          return (
            <div
              key={`${mode}-${p.id}`}
              className="stage-card__grid"
              style={{
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '10px 12px',
                background: 'var(--surface)'      // ⬅️ usa token (no #fff)
              }}
            >
              {/* Bloque de info: hereda color del tema */}
              <div className="stage-card__info" style={{ color: 'var(--text)' }}>
                {mode === 'porton' ? (
                  <>
                    <div className="stage-card__title" style={{ fontWeight: 900 }}>
                      N° Portón {p.nlista}
                    </div>
                    {p.partida != null && (
                      <div className="stage-card__title">Partida {p.partida}</div>
                    )}
                    <div className="stage-card__sub">NV {p.nv}</div>
                  </>
                ) : (
                  <>
                    <div className="stage-card__title" style={{ fontWeight: 900 }}>
                      iPanel
                    </div>
                    {p.partida != null && (
                      <div className="stage-card__title">Partida {p.partida}</div>
                    )}
                    <div className="stage-card__sub">NV {p.nv}</div>
                  </>
                )}

                <div style={{ fontSize: 12, opacity: .75 }}>
                  Estado: {p[effKey] || ''}
                </div>
                {p[`${effKey}_inicio`] && (
                  <div style={{ fontSize: 12 }}>Inicio: {fmt(p[`${effKey}_inicio`])}</div>
                )}
                {p[`${effKey}_fin`] && (
                  <div style={{ fontSize: 12 }}>Fin: {fmt(p[`${effKey}_fin`])}</div>
                )}
              </div>

              <div className="actions" style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn--brand"
                  onClick={() => onStart && onStart(p.id, effKey)}
                  disabled={!canStart || disabledId === p.id}
                  title="Iniciar (En Proceso)"
                  style={{ fontSize: 18, padding: '8px 10px', borderRadius: 10 }}
                >
                  ▶
                </button>
                <button
                  className="btn"
                  onClick={() => onStop && onStop(p.id, effKey)}
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
            Sin elementos.
          </div>
        )}
      </div>
    </div>
  );
}

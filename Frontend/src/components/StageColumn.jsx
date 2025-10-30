// src/components/StageColumn.jsx
import React from 'react';

const bordo = '#008241ff';

export default function StageColumn({
  title,
  stageKey,              // p.ej. 'guillotina', 'plegadora', 'pintura', 'inyeccion'
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

  // Sólo aplica para portones (iPanel no tiene armado_final)
  function readyForArmadoFinal(p) {
    return low(p.pintura) === 'finalizado' && low(p.revestimiento) === 'finalizado';
  }

  // Filtrado: mostrar Pendiente/En Proceso; si es armado_final validar prereqs
  const filtered = (items || []).filter(p => {
    const st = low(p[effKey]);
    if (!(st === 'pendiente' || st === 'en proceso')) return false;
    if (effKey === 'armado_final' && mode === 'porton') return readyForArmadoFinal(p);
    return true;
  });

  // Orden: primero En Proceso, luego Pendiente; luego por inicio, luego por (nlista|partida) y NV
  const ordered = filtered.sort((a, b) => {
    const rank = s => (s === 'en proceso' ? 0 : s === 'pendiente' ? 1 : 2);
    const ra = rank(low(a[effKey]));
    const rb = rank(low(b[effKey]));
    if (ra !== rb) return ra - rb;

    const ia = a[`${effKey}_inicio`] ? new Date(a[`${effKey}_inicio`]).getTime() : Infinity;
    const ib = b[`${effKey}_inicio`] ? new Date(b[`${effKey}_inicio`]).getTime() : Infinity;
    if (ia !== ib) return ia - ib;

    // Portón: nlista -> nv ; iPanel: partida -> nv
    const aPrim = mode === 'porton' ? (a.nlista || 0) : (a.partida || 0);
    const bPrim = mode === 'porton' ? (b.nlista || 0) : (b.partida || 0);
    if (aPrim !== bPrim) return aPrim - bPrim;

    return (a.nv || 0) - (b.nv || 0);
  });

  const fmt = dt =>
    dt ? new Date(dt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '';

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
          const st = low(p[effKey]);
          const canStop = st === 'en proceso';
          const canStart = st === 'pendiente';

          return (
            <div
              key={`${mode}-${p.id}`}
              className="stage-card__grid"
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: '10px 12px',
                background: '#fff'
              }}
            >
              <div>
                {/* Cabecera según tipo */}
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
            {effKey === 'armado_final' && mode === 'porton'
              ? 'Sin elementos. Esperando Pintura y Revestimiento finalizados.'
              : 'Sin elementos.'}
          </div>
        )}
      </div>
    </div>
  );
}

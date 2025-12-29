import React from 'react';

const bordo = '#008241ff';

export default function StageColumn({
  title,
  stageKey,
  mode = 'porton',
  items = [],
  onStart,
  onStop,
  disabledId,
  pdfBaseUrl = 'https://integrador-six-zeta.vercel.app',
}) {
  const low = (v) => (v || '').toLowerCase();

  const effKey =
    mode === 'ipanel' && stageKey === 'plegadora'
      ? 'plegado'
      : stageKey;

  const filtered = (items || []).filter((p) => {
    const st = low(p[effKey]);
    return st === 'pendiente' || st === 'en proceso';
  });

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

  const fmt = (dt) =>
    dt
      ? new Date(dt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
      : '';

  // ✅ NO mostrar PDFs en iPanel
  const showPdfButtons = mode !== 'ipanel';

  // ✅ abre PDF en app externa:
  // - arm-primario => nv
  // - resto => partida
  function openPdf(tipo, { partida, nv }) {
    const base = (pdfBaseUrl || '').trim();
    if (!base) return;

    if (tipo === 'arm-primario') {
      const n = nv != null ? String(nv).trim() : '';
      if (!n) return;
      const url = `${base}/?pdf=${encodeURIComponent(tipo)}&nv=${encodeURIComponent(n)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    const p = partida != null ? String(partida).trim() : '';
    if (!p) return;
    const url = `${base}/?pdf=${encodeURIComponent(tipo)}&partida=${encodeURIComponent(p)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  const titleNorm = low(title);

  const isDisenoLaser =
    titleNorm.includes('diseño') ||
    titleNorm.includes('diseno') ||
    titleNorm.includes('laser');

  const isCortePlegadoTapas =
    titleNorm.includes('cortes piernas') ||
    titleNorm.includes('cortes revestimiento') ||
    titleNorm.includes('plegado piernas') ||
    titleNorm.includes('plegado revestimiento') ||
    titleNorm.includes('corte') ||
    titleNorm.includes('pleg');

  function getPdfButtonsForColumn() {
    if (isDisenoLaser) {
      return [{ tipo: 'diseno-laser', label: 'D', title: 'PDF Diseño Láser' }];
    }

    if (isCortePlegadoTapas) {
      return [
        { tipo: 'corte-plegado', label: 'C/P', title: 'PDF Corte y Plegado' },
        { tipo: 'tapajuntas', label: 'T', title: 'PDF Tapajuntas' },
      ];
    }

    return [{ tipo: 'arm-primario', label: 'AP', title: 'PDF Armado Primario (por NV)' }];
  }

  const pdfButtons = getPdfButtonsForColumn();

  return (
    <div
      style={{
        border: `2px solid ${bordo}`,
        borderRadius: 12,
        overflow: 'hidden',
        background: 'var(--surface)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 320,
      }}
    >
      <div
        style={{
          background: bordo,
          color: '#fff',
          fontWeight: 800,
          padding: '10px 12px',
        }}
      >
        {title}
      </div>

      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ordered.map((p) => {
          const st = low(p[effKey]);
          const canStop = st === 'en proceso';
          const canStart = st === 'pendiente';

          const hasPartida = p.partida != null && String(p.partida).trim() !== '';
          const hasNv = p.nv != null && String(p.nv).trim() !== '';
          const canPdfBase = !!String(pdfBaseUrl || '').trim();

          return (
            <div
              key={`${mode}-${p.id}`}
              className="stage-card__grid"
              style={{
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '10px 12px',
                background: 'var(--surface)',
              }}
            >
              <div className="stage-card__info" style={{ color: 'var(--text)' }}>
                {mode === 'porton' ? (
                  <>
                    <div className="stage-card__title" style={{ fontWeight: 900 }}>
                      N° Portón {p.nlista}
                    </div>
                    {p.partida != null && <div className="stage-card__title">Partida {p.partida}</div>}
                    <div className="stage-card__sub">NV {p.nv}</div>
                  </>
                ) : (
                  <>
                    <div className="stage-card__title" style={{ fontWeight: 900 }}>
                      iPanel
                    </div>
                    {p.partida != null && <div className="stage-card__title">Partida {p.partida}</div>}
                    <div className="stage-card__sub">NV {p.nv}</div>
                  </>
                )}

                <div style={{ fontSize: 12, opacity: 0.75 }}>Estado: {p[effKey] || ''}</div>
                {p[`${effKey}_inicio`] && (
                  <div style={{ fontSize: 12 }}>Inicio: {fmt(p[`${effKey}_inicio`])}</div>
                )}
                {p[`${effKey}_fin`] && (
                  <div style={{ fontSize: 12 }}>Fin: {fmt(p[`${effKey}_fin`])}</div>
                )}
              </div>

              <div className="actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {showPdfButtons &&
                  pdfButtons.map((b) => {
                    const needsNv = b.tipo === 'arm-primario';
                    const enabled =
                      canPdfBase && (needsNv ? hasNv : hasPartida);

                    return (
                      <button
                        key={b.tipo}
                        className="btn"
                        onClick={() => openPdf(b.tipo, { partida: p.partida, nv: p.nv })}
                        disabled={!enabled}
                        title={
                          enabled
                            ? `${b.title}`
                            : !canPdfBase
                              ? 'Configurar pdfBaseUrl'
                              : needsNv
                                ? 'Sin NV'
                                : 'Sin partida'
                        }
                        style={{ fontSize: 16, padding: '8px 10px', borderRadius: 10 }}
                      >
                        📄 {b.label}
                      </button>
                    );
                  })}

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
          <div style={{ opacity: 0.6, fontSize: 13 }}>Sin elementos.</div>
        )}
      </div>
    </div>
  );
}

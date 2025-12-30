import React, { useMemo, useState } from 'react';

const bordo = '#008241ff';

function low(v) {
  return (v || '').toLowerCase();
}

function fmt(dt) {
  return dt
    ? new Date(dt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
    : '';
}

function safeStr(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

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
  const [showHist, setShowHist] = useState(false);

  // historial search
  const [q, setQ] = useState('');
  const [searched, setSearched] = useState(false);
  const [searchResults, setSearchResults] = useState([]); // <-- ahora lista
  const [selected, setSelected] = useState(null); // <-- seleccionado para detalle

  const effKey =
    mode === 'ipanel' && stageKey === 'plegadora'
      ? 'plegado'
      : stageKey;

  // Solo muestra pendientes + en proceso en la columna
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

  // ✅ NO mostrar PDFs en iPanel
  const showPdfButtons = mode !== 'ipanel';

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
      return [{ tipo: 'diseno-laser', label: 'D', title: 'PDF Diseño Láser', icon: '🧩' }];
    }

    if (isCortePlegadoTapas) {
      return [
        { tipo: 'corte-plegado', label: 'C/P', title: 'PDF Corte y Plegado', icon: '✂️' },
        { tipo: 'tapajuntas', label: 'T', title: 'PDF Tapajuntas', icon: '🧱' },
      ];
    }

    return [{ tipo: 'arm-primario', label: 'AP', title: 'PDF Armado Primario (por NV)', icon: '🧰' }];
  }

  const pdfButtons = getPdfButtonsForColumn();

  // ==========================
  // Historial (búsqueda + últimos 10 finalizados)
  // ==========================

  // Nota: con el dataset actual (items) solo podés ver “historial”
  // si el backend manda también finalizados.
  const allSectorItems = useMemo(() => (items || []).slice(), [items]);

  // Helper: toma campos “nv / nlista / partida” en varios formatos
  function getFields(p) {
    const nv = safeStr(p?.nv ?? p?.NV);
    const nlista = safeStr(p?.nlista ?? p?.NRO_PORTON ?? p?.porton);
    const partida = safeStr(p?.partida ?? p?.PARTIDA);
    return { nv, nlista, partida };
  }

  // Búsqueda:
  // - Si coincide EXACTO con partida => devuelve TODOS los portones de esa partida
  // - Si coincide EXACTO con nv => devuelve TODOS los portones de ese nv
  // - Si coincide EXACTO con nlista => devuelve TODOS los portones de ese nlista
  // - Si no, fallback "contiene" (capado) para ayudar a encontrar
  function searchByQuery(query) {
    const qq = safeStr(query);
    if (!qq) return [];

    // 1) exact PARTIDA
    const exactPartidaHits = (allSectorItems || []).filter((p) => getFields(p).partida === qq);
    if (exactPartidaHits.length) return exactPartidaHits;

    // 2) exact NV
    const exactNvHits = (allSectorItems || []).filter((p) => getFields(p).nv === qq);
    if (exactNvHits.length) return exactNvHits;

    // 3) exact N° Portón
    const exactPortonHits = (allSectorItems || []).filter((p) => getFields(p).nlista === qq);
    if (exactPortonHits.length) return exactPortonHits;

    // 4) contains fallback
    const containsHits = (allSectorItems || [])
      .filter((p) => {
        const { nv, nlista, partida } = getFields(p);
        return nv.includes(qq) || nlista.includes(qq) || partida.includes(qq);
      })
      .slice(0, 50);

    return containsHits;
  }

  function sortResults(list) {
    const key = effKey;

    // Orden:
    // 1) en proceso primero
    // 2) pendiente después
    // 3) finalizado al final
    // 4) por partida, nv, nlista
    return (list || []).slice().sort((a, b) => {
      const sa = low(a?.[key]);
      const sb = low(b?.[key]);

      const rank = (s) => {
        if (s === 'en proceso') return 0;
        if (s === 'pendiente') return 1;
        if (s === 'finalizado') return 2;
        return 3;
      };

      const ra = rank(sa);
      const rb = rank(sb);
      if (ra !== rb) return ra - rb;

      const fa = getFields(a);
      const fb = getFields(b);

      const pa = fa.partida ? Number(fa.partida) : Infinity;
      const pb = fb.partida ? Number(fb.partida) : Infinity;
      if (pa !== pb) return pa - pb;

      const na = fa.nv ? Number(fa.nv) : Infinity;
      const nb = fb.nv ? Number(fb.nv) : Infinity;
      if (na !== nb) return na - nb;

      const la = fa.nlista ? Number(fa.nlista) : Infinity;
      const lb = fb.nlista ? Number(fb.nlista) : Infinity;
      if (la !== lb) return la - lb;

      return 0;
    });
  }

  function doSearch() {
    const qq = safeStr(q);
    setSearched(true);

    if (!qq) {
      setSearchResults([]);
      setSelected(null);
      return;
    }

    const hits = sortResults(searchByQuery(qq));
    setSearchResults(hits);
    setSelected(hits.length ? hits[0] : null);
  }

  const last10Finalizados = useMemo(() => {
    const key = effKey;

    const finals = (allSectorItems || [])
      .filter((p) => {
        const st = low(p?.[key]);
        const hasFin = !!p?.[`${key}_fin`];
        return st === 'finalizado' || st === 'done' || hasFin;
      })
      .map((p) => {
        const finTs = p?.[`${key}_fin`] ? new Date(p[`${key}_fin`]).getTime() : 0;
        return { ...p, __finTs: Number.isFinite(finTs) ? finTs : 0 };
      })
      .sort((a, b) => (b.__finTs || 0) - (a.__finTs || 0))
      .slice(0, 10);

    return finals;
  }, [allSectorItems, effKey]);

  const canPdfBase = !!String(pdfBaseUrl || '').trim();

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
      {/* Header */}
      <div
        style={{
          background: bordo,
          color: '#fff',
          fontWeight: 800,
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div>{title}</div>

        <button
          type="button"
          onClick={() => {
            setShowHist(true);
            setSearched(false);
            setSearchResults([]);
            setSelected(null);
            setQ('');
          }}
          style={{
            border: '1px solid rgba(255,255,255,0.6)',
            background: 'rgba(255,255,255,0.12)',
            color: '#fff',
            padding: '6px 10px',
            borderRadius: 10,
            cursor: 'pointer',
            fontWeight: 800,
          }}
          title="Abrir historial del sector"
        >
          Historial
        </button>
      </div>

      {/* Cards */}
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ordered.map((p) => {
          const st = low(p[effKey]);
          const canStop = st === 'en proceso';
          const canStart = st === 'pendiente';

          const hasPartida = p.partida != null && String(p.partida).trim() !== '';
          const hasNv = p.nv != null && String(p.nv).trim() !== '';

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
                {p[`${effKey}_inicio`] && <div style={{ fontSize: 12 }}>Inicio: {fmt(p[`${effKey}_inicio`])}</div>}
                {p[`${effKey}_fin`] && <div style={{ fontSize: 12 }}>Fin: {fmt(p[`${effKey}_fin`])}</div>}
              </div>

              <div className="actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {showPdfButtons &&
                  pdfButtons.map((b) => {
                    const needsNv = b.tipo === 'arm-primario';
                    const enabled = canPdfBase && (needsNv ? hasNv : hasPartida);

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
                        {b.icon} {b.label}
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

        {ordered.length === 0 && <div style={{ opacity: 0.6, fontSize: 13 }}>Sin elementos.</div>}
      </div>

      {/* =========================
          Modal Historial
      ========================== */}
      {showHist && (
        <div
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowHist(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 9999,
          }}
        >
          <div
            style={{
              width: 'min(920px, 100%)',
              background: '#fff',
              borderRadius: 14,
              border: '1px solid #e5e7eb',
              boxShadow: '0 18px 55px rgba(0,0,0,0.25)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '12px 14px',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                background: '#f8fafc',
              }}
            >
              <div style={{ fontWeight: 900 }}>
                Historial – {title} ({mode === 'ipanel' ? 'iPanel' : 'Portones'})
              </div>

              <button
                type="button"
                onClick={() => setShowHist(false)}
                style={{
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  borderRadius: 10,
                  padding: '6px 10px',
                  cursor: 'pointer',
                  fontWeight: 800,
                }}
                title="Cerrar"
              >
                Cerrar
              </button>
            </div>

            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Buscador */}
              <div
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: 12,
                  padding: 12,
                  background: '#fff',
                }}
              >
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Buscar portón</div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Buscar por NV, N° Portón o Partida"
                    style={{
                      flex: '1 1 320px',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid #d1d5db',
                      outline: 'none',
                      fontSize: 14,
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        doSearch();
                      }
                    }}
                  />

                  <button
                    type="button"
                    onClick={doSearch}
                    style={{
                      border: '1px solid #d1d5db',
                      background: '#111827',
                      color: '#fff',
                      borderRadius: 10,
                      padding: '10px 12px',
                      cursor: 'pointer',
                      fontWeight: 800,
                    }}
                  >
                    Buscar
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setQ('');
                      setSearched(false);
                      setSearchResults([]);
                      setSelected(null);
                    }}
                    style={{
                      border: '1px solid #d1d5db',
                      background: '#fff',
                      color: '#111827',
                      borderRadius: 10,
                      padding: '10px 12px',
                      cursor: 'pointer',
                      fontWeight: 800,
                    }}
                  >
                    Limpiar
                  </button>
                </div>

                {/* Resultado */}
                <div style={{ marginTop: 10 }}>
                  {!searched ? (
                    <div style={{ fontSize: 13, opacity: 0.7 }}>
                      Ingresá un dato (NV / N° Portón / Partida) y presioná Buscar.
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#b91c1c', fontWeight: 800 }}>
                      No se encontró coincidencia en el dataset actual.
                    </div>
                  ) : (
                    <>
                      {searchResults.length > 1 && (
                        <div
                          style={{
                            marginTop: 8,
                            border: '1px solid #e5e7eb',
                            borderRadius: 12,
                            padding: 12,
                            background: '#fff',
                          }}
                        >
                          <div style={{ fontWeight: 900, marginBottom: 8 }}>
                            Se encontraron {searchResults.length} portones para “{safeStr(q)}”
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {searchResults.map((p) => {
                              const { nv, nlista, partida } = getFields(p);
                              const st = safeStr(p?.[effKey]);
                              const isSel = selected && (selected === p);

                              return (
                                <div
                                  key={`hit-${p?.id ?? `${nv}-${nlista}-${partida}`}`}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: 10,
                                    alignItems: 'center',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: 12,
                                    padding: '10px 12px',
                                    background: isSel ? '#eff6ff' : '#fff',
                                  }}
                                >
                                  <div style={{ fontWeight: 900 }}>
                                    N° Portón {nlista || '-'} · Partida {partida || '-'} · NV {nv || '-'}
                                    <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.75, marginTop: 2 }}>
                                      Estado: {st || '(sin estado)'}
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => setSelected(p)}
                                    style={{
                                      border: '1px solid #d1d5db',
                                      background: '#111827',
                                      color: '#fff',
                                      borderRadius: 10,
                                      padding: '8px 10px',
                                      cursor: 'pointer',
                                      fontWeight: 900,
                                    }}
                                  >
                                    Ver
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Detalle seleccionado (para 1 o varios resultados) */}
                      {selected && (
                        <div
                          style={{
                            marginTop: 10,
                            border: '1px solid #e5e7eb',
                            borderRadius: 12,
                            padding: 12,
                            background: '#f9fafb',
                          }}
                        >
                          {(() => {
                            const p = selected;
                            const { nv, nlista, partida } = getFields(p);

                            const st = safeStr(p?.[effKey]);
                            const inicio = p?.[`${effKey}_inicio`] || null;
                            const fin = p?.[`${effKey}_fin`] || null;

                            return (
                              <>
                                <div style={{ fontWeight: 900, marginBottom: 6 }}>
                                  N° Portón {nlista || '-'} · Partida {partida || '-'} · NV {nv || '-'}
                                </div>

                                <div style={{ fontSize: 13 }}>
                                  <b>Puesto:</b> {title} · <b>Estado:</b> {st || '(sin estado)'}
                                </div>

                                <div style={{ fontSize: 13, marginTop: 4 }}>
                                  {inicio ? (
                                    <>
                                      <b>Inicio:</b> {fmt(inicio)}
                                    </>
                                  ) : (
                                    <span style={{ opacity: 0.7 }}>Sin fecha de inicio</span>
                                  )}
                                  {' · '}
                                  {fin ? (
                                    <>
                                      <b>Fin:</b> {fmt(fin)}
                                    </>
                                  ) : (
                                    <span style={{ opacity: 0.7 }}>Sin fecha de fin</span>
                                  )}
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Últimos 10 */}
              <div
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: 12,
                  padding: 12,
                  background: '#fff',
                }}
              >
                <div style={{ fontWeight: 900, marginBottom: 8 }}>
                  Últimos 10 finalizados en este sector
                </div>

                {last10Finalizados.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {last10Finalizados.map((p) => {
                      const { nv, nlista, partida } = getFields(p);
                      return (
                        <div
                          key={`hist-${effKey}-${p?.id ?? `${nv}-${nlista}-${partida}`}`}
                          style={{
                            border: '1px solid #e5e7eb',
                            borderRadius: 12,
                            padding: '10px 12px',
                            background: '#fff',
                            fontWeight: 900,
                          }}
                        >
                          N° Portón {nlista || '-'} · Partida {partida || '-'} · NV {nv || '-'}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, opacity: 0.7 }}>
                    No hay finalizados recientes detectables para este sector (en el dataset actual).
                  </div>
                )}
              </div>

              <div style={{ fontSize: 12, opacity: 0.65 }}>
                Nota: si tu API no devuelve registros finalizados para este sector, el “últimos 10” no podrá
                llenarse. En ese caso hay que agregar un endpoint de historial en backend para consultar por NV/Partida/N° Portón.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

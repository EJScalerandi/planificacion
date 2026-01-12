// src/components/StageColumn.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { qcAuthorize, qcGetMotives, qcHistory } from '../api';

const bordo = '#008241ff';

function low(v) {
  return String(v ?? '').toLowerCase();
}

function up(v) {
  return String(v ?? '').trim().toUpperCase();
}

function fmt(dt) {
  return dt
    ? new Date(dt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
    : '';
}

function mapModeToLine(mode) {
  return mode === 'ipanel' ? 'ipanel' : 'portones';
}

/**
 * ID que usa QC. En tu caso: /qc/history/portones/2633 (NV)
 * => usamos NV como item_id por defecto.
 */
function getQcItemId(item, line) {
  const nv = Number(item?.nv);
  if (Number.isInteger(nv)) return nv;

  // fallback (por si un día cambiás criterio)
  if (line === 'portones') {
    const nl = Number(item?.nlista);
    if (Number.isInteger(nl)) return nl;
  }
  const pa = Number(item?.partida);
  if (Number.isInteger(pa)) return pa;

  return null;
}

// =====================
// Modal QC
// =====================
function QcModal({ open, onClose, item, line, stageKey, title }) {
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState('APROBADO');
  const [motiveId, setMotiveId] = useState('');
  const [motives, setMotives] = useState([]);
  const [loadingMotives, setLoadingMotives] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const needsMotive =
    String(status || '').toUpperCase() === 'OBSERVADO' ||
    String(status || '').toUpperCase() === 'RECHAZADO';

  const qcItemId = useMemo(() => getQcItemId(item, line), [item, line]);

  useEffect(() => {
    if (!open) return;
    setErr('');
    setPin('');
    setStatus('APROBADO');
    setMotiveId('');
    setMotives([]);
    setLoadingMotives(false);
    setSaving(false);
  }, [open, item?.id, item?.nv, item?.nlista, item?.partida, stageKey, line]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!open || !item) return;

      const st = String(status || '').toUpperCase();
      if (!(st === 'OBSERVADO' || st === 'RECHAZADO')) {
        setMotives([]);
        setMotiveId('');
        return;
      }

      try {
        setLoadingMotives(true);
        setErr('');
        const data = await qcGetMotives({ line, kind: st, stage: stageKey });
        if (cancelled) return;
        setMotives(Array.isArray(data) ? data : []);
        setMotiveId('');
      } catch (e) {
        if (cancelled) return;
        setErr(e?.response?.data?.error || e.message);
        setMotives([]);
        setMotiveId('');
      } finally {
        if (!cancelled) setLoadingMotives(false);
      }
    }

    run();
    return () => { cancelled = true; };
  }, [open, status, item, line, stageKey]);

  const submit = async () => {
    const pinStr = String(pin || '').trim();
    const qc_status = String(status || '').trim().toUpperCase();

    setErr('');

    if (!/^\d{3,10}$/.test(pinStr)) {
      setErr('PIN inválido (solo numérico, 3 a 10 dígitos).');
      return;
    }

    if (!Number.isInteger(qcItemId)) {
      setErr('Item QC inválido: no se pudo resolver un ID numérico (NV/NLista/Partida).');
      return;
    }

    if ((qc_status === 'OBSERVADO' || qc_status === 'RECHAZADO') && !String(motiveId || '').trim()) {
      setErr('Tenés que elegir un motivo para OBSERVADO/RECHAZADO.');
      return;
    }

    try {
      setSaving(true);

      const payload = {
        line,
        item_id: qcItemId,
        stage_key: stageKey,
        qc_status,
        pin: pinStr,
      };

      if (qc_status === 'OBSERVADO' || qc_status === 'RECHAZADO') {
        payload.motive_id = Number(motiveId);
      }

      const resp = await qcAuthorize(payload);
      const uname = resp?.user?.name ? ` (${resp.user.name})` : '';

      alert(`QC registrado: ${qc_status}${uname}`);
      onClose?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open || !item) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
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
          width: 'min(720px, 100%)',
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
          <div style={{ fontWeight: 900 }}>QC – {title}</div>
          <button className="btn" type="button" onClick={onClose}>Cerrar</button>
        </div>

        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {err && <div style={{ color: 'crimson', fontWeight: 800 }}>{err}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontWeight: 800 }}>PIN</span>
              <input
                className="btn"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                placeholder="Ej: 1234"
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontWeight: 800 }}>Estado</span>
              <select className="btn" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="APROBADO">Autorizar</option>
                <option value="OBSERVADO">Observar</option>
                <option value="RECHAZADO">Rechazar</option>
              </select>
            </label>
          </div>

          {needsMotive && (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>
                Motivo ({String(status).toUpperCase()})
              </div>

              {loadingMotives ? (
                <div style={{ opacity: 0.8 }}>Cargando motivos…</div>
              ) : (
                <select
                  className="btn"
                  style={{ width: '100%' }}
                  value={motiveId}
                  onChange={(e) => setMotiveId(e.target.value)}
                >
                  <option value="">— Elegí un motivo —</option>
                  {(motives || []).map((m) => (
                    <option key={m.id} value={String(m.id)}>
                      {m.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Line: <b>{line}</b> · Stage: <b>{stageKey}</b> · QC Item ID: <b>{qcItemId ?? '-'}</b>
            </div>

            <button className="btn btn--brand" type="button" onClick={submit} disabled={saving}>
              {saving ? 'Guardando…' : 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================
// ✅ Modal Observaciones
// =====================
function ObservacionesModal({ open, onClose, title, item, observations = [] }) {
  if (!open || !item) return null;

  const nv = item?.nv != null ? `NV ${item.nv}` : '';
  const nlista = item?.nlista != null ? `Portón ${item.nlista}` : '';
  const partida = item?.partida != null ? `Partida ${item.partida}` : '';
  const head = [title, nv, nlista, partida].filter(Boolean).join(' · ');

  const rows = (observations || []).map((o) => ({
    sector: o?.stage_key || o?.sector || o?.stage || '-',
    fecha: o?.created_at || o?.timestamp || null,
    motivo: o?.motive_label || o?.motive?.label || '-',
    quien: o?.user_name || o?.user?.name || '-',
    status: String(o?.qc_status || '').toUpperCase(),
  }));

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
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
          width: 'min(860px, 100%)',
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
            background: '#fff5f5',
          }}
        >
          <div style={{ fontWeight: 900, color: '#991b1b' }}>
            Observaciones · {head}
          </div>
          <button className="btn" type="button" onClick={onClose}>Cerrar</button>
        </div>

        <div style={{ padding: 14 }}>
          {rows.length === 0 ? (
            <div style={{ opacity: 0.75 }}>No hay observaciones registradas.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rows.map((r, idx) => (
                <div
                  key={`obs-${idx}`}
                  style={{
                    border: '1px solid #fecaca',
                    background: '#fffafa',
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  <div style={{ fontWeight: 900, color: '#7f1d1d', marginBottom: 6 }}>
                    {r.status || 'OBSERVADO'}
                  </div>
                  <div style={{ fontSize: 13 }}><b>Sector:</b> {r.sector}</div>
                  <div style={{ fontSize: 13 }}><b>Fecha:</b> {r.fecha ? fmt(r.fecha) : '-'}</div>
                  <div style={{ fontSize: 13 }}><b>Motivo:</b> {r.motivo}</div>
                  <div style={{ fontSize: 13 }}><b>Quién puso el PIN:</b> {r.quien}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
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
  // QC modal
  const [qcOpen, setQcOpen] = useState(false);
  const [qcTarget, setQcTarget] = useState(null);

  // Observaciones modal
  const [obsOpen, setObsOpen] = useState(false);
  const [obsTarget, setObsTarget] = useState(null);

  // cache por qcItemId:
  // {
  //   loaded, loading, error,
  //   hasObs, list (solo OBSERVADO),
  //   latestStageStatus (último QC de ESTA etapa)
  // }
  const [obsById, setObsById] = useState({});
  const obsByIdRef = useRef(obsById);
  useEffect(() => { obsByIdRef.current = obsById; }, [obsById]);

  const effKey =
    mode === 'ipanel' && stageKey === 'plegadora'
      ? 'plegado'
      : stageKey;

  const line = mapModeToLine(mode);

  // ✅ regla de ocultado para FINALIZADO
  // Se oculta SOLO si FINALIZADO y último QC de esta etapa es APROBADO u OBSERVADO.
  // Si RECHAZADO o no hay QC => se muestra.
  function shouldHideFinalizado(p) {
    const qcId = getQcItemId(p, line);
    if (!Number.isInteger(qcId)) return false;

    const latest = up(obsByIdRef.current?.[qcId]?.latestStageStatus);
    if (!latest) return false; // sin QC => visible

    return (latest === 'APROBADO' || latest === 'OBSERVADO');
  }

  // ✅ orden estable
  // Antes filtrabas solo pendiente/en proceso => por eso desaparecía al finalizado.
  // Ahora incluimos finalizado también, pero el render lo puede ocultar según QC.
  const ordered = useMemo(() => {
    const filtered = (items || []).filter((p) => {
      const st = low(p?.[effKey]);
      return st === 'pendiente' || st === 'en proceso' || st === 'finalizado';
    });

    return filtered.slice().sort((a, b) => {
      const aSt = low(a?.[effKey]);
      const bSt = low(b?.[effKey]);

      const aStarted = aSt === 'en proceso';
      const bStarted = bSt === 'en proceso';
      if (aStarted !== bStarted) return aStarted ? -1 : 1;

      // Pendiente antes que finalizado (para que “lo activo” quede arriba)
      const aPend = aSt === 'pendiente';
      const bPend = bSt === 'pendiente';
      if (aPend !== bPend) return aPend ? -1 : 1;

      return (a?.nv || 0) - (b?.nv || 0);
    });
  }, [items, effKey]);

  const visibleQcIdsKey = useMemo(() => {
    const ids = ordered
      .map((p) => getQcItemId(p, line))
      .filter((x) => Number.isInteger(x));
    return ids.join(',');
  }, [ordered, line]);

  // Prefetch QC (usamos history completo):
  // - hasObs/list: solo OBSERVADO (para el "!")
  // - latestStageStatus: último QC para effKey (para ocultar finalizados cuando corresponde)
  useEffect(() => {
    let cancelled = false;

    async function loadChunk(chunk) {
      setObsById((prev) => {
        const next = { ...prev };
        for (const id of chunk) {
          const curr = next[id] || {};
          next[id] = { ...curr, loading: true, loaded: Boolean(curr.loaded), error: '' };
        }
        return next;
      });

      const results = await Promise.allSettled(
        chunk.map(async (id) => {
          const resp = await qcHistory({ line, item_id: id });
          const arr = Array.isArray(resp) ? resp : [];

          // OBSERVADO para el "!"
          const obs = arr.filter((x) => up(x?.qc_status) === 'OBSERVADO');

          // Último QC de ESTA etapa (arr viene desc, así que el primero que matchee es el último)
          const latestForStage = arr.find((x) => String(x?.stage_key || '').trim() === String(effKey || '').trim());
          const latestStageStatus = latestForStage?.qc_status ? up(latestForStage.qc_status) : '';

          return { id, obs, latestStageStatus };
        })
      );

      if (cancelled) return;

      setObsById((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (r.status === 'fulfilled') {
            next[r.value.id] = {
              loaded: true,
              loading: false,
              error: '',
              hasObs: r.value.obs.length > 0,
              list: r.value.obs,
              latestStageStatus: r.value.latestStageStatus || '',
            };
          }
        }
        return next;
      });
    }

    const ids = (visibleQcIdsKey || '')
      .split(',')
      .map((x) => Number(x))
      .filter((x) => Number.isInteger(x));

    const missing = ids.filter((id) => {
      const curr = obsByIdRef.current?.[id];
      return !(curr?.loaded === true) && !(curr?.loading === true);
    });

    if (!missing.length) return;

    (async () => {
      const chunkSize = 6;
      for (let i = 0; i < missing.length; i += chunkSize) {
        await loadChunk(missing.slice(i, i + chunkSize));
        if (cancelled) return;
      }
    })();

    return () => { cancelled = true; };
  }, [line, visibleQcIdsKey, effKey]);

  const openQc = (p) => {
    setQcTarget(p);
    setQcOpen(true);
  };

  // PDFs (mantengo lo tuyo)
  const showPdfButtons = mode !== 'ipanel';
  const canPdfBase = !!String(pdfBaseUrl || '').trim();
  const pdfButtons = useMemo(() => [{ tipo: 'arm-primario', label: 'AP', title: 'PDF Armado Primario (por NV)', icon: '🧰' }], []);

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
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>{title}</div>
      </div>

      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ordered
          .filter((p) => {
            const st = low(p?.[effKey]);

            if (st === 'finalizado') {
              // ✅ solo ocultar si finalizado + QC OK (APROBADO/OBSERVADO)
              return !shouldHideFinalizado(p);
            }

            // pendiente / en proceso => siempre visibles
            return st === 'pendiente' || st === 'en proceso';
          })
          .map((p) => {
            const st = low(p?.[effKey]);
            const canStop = st === 'en proceso';
            const canStart = st === 'pendiente';

            const qcId = getQcItemId(p, line);
            const obsInfo = Number.isInteger(qcId) ? obsById[qcId] : null;
            const hasObs = Boolean(obsInfo?.hasObs);

            return (
              <div
                key={`${mode}-${p?.id ?? `${p?.nv}-${p?.nlista}-${p?.partida}`}`}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '10px 12px',
                  background: 'var(--surface)',
                  position: 'relative',
                }}
              >
                {/* ✅ CLICK: abre modal con Sector/Fecha/Motivo/Usuario */}
                {hasObs ? (
                  <button
                    type="button"
                    onClick={() => {
                      setObsTarget(p);
                      setObsOpen(true);
                    }}
                    title="Ver observaciones"
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      border: '1px solid #b91c1c',
                      background: '#ef4444',
                      color: '#fff',
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'grid',
                      placeItems: 'center',
                      boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
                    }}
                  >
                    !
                  </button>
                ) : null}

                <div style={{ fontWeight: 900 }}>N° Portón {p?.nlista}</div>
                <div>Partida {p?.partida}</div>
                <div>NV {p?.nv}</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  Estado: {p?.[effKey] || ''}
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  {showPdfButtons &&
                    pdfButtons.map((b) => {
                      const enabled = canPdfBase && p?.nv != null;
                      return (
                        <button
                          key={b.tipo}
                          className="btn"
                          onClick={() => openPdf(b.tipo, { partida: p.partida, nv: p.nv })}
                          disabled={!enabled}
                          title={b.title}
                        >
                          {b.icon} {b.label}
                        </button>
                      );
                    })}

                  <button className="btn" type="button" onClick={() => openQc(p)} style={{ fontWeight: 900 }}>
                    QC
                  </button>

                  <button
                    className="btn btn--brand"
                    onClick={() => onStart && onStart(p.id, effKey)}
                    disabled={!canStart || disabledId === p.id}
                  >
                    ▶
                  </button>

                  <button
                    className="btn"
                    onClick={() => onStop && onStop(p.id, effKey)}
                    disabled={!canStop || disabledId === p.id}
                  >
                    ⏹
                  </button>
                </div>
              </div>
            );
          })}
      </div>

      {/* Modal QC */}
      <QcModal
        open={qcOpen}
        onClose={() => { setQcOpen(false); setQcTarget(null); }}
        item={qcTarget}
        line={line}
        stageKey={effKey}
        title={title}
      />

      {/* Modal Observaciones */}
      <ObservacionesModal
        open={obsOpen}
        onClose={() => { setObsOpen(false); setObsTarget(null); }}
        title={title}
        item={obsTarget}
        observations={(() => {
          const qcId = getQcItemId(obsTarget, line);
          return Number.isInteger(qcId) ? (obsById[qcId]?.list || []) : [];
        })()}
      />
    </div>
  );
}

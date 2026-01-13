import React, { useEffect, useMemo, useState } from 'react';
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

// ===== fechas / cola =====
function pad2(n) {
  return String(n).padStart(2, '0');
}
function toISODate10(v) {
  if (!v) return '';
  const s = String(v).trim();

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;

  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;

  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const yyyy = d.getUTCFullYear();
    const mm = pad2(d.getUTCMonth() + 1);
    const dd = pad2(d.getUTCDate());
    return `${yyyy}-${mm}-${dd}`;
  }

  return '';
}
function todayISO10Utc() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * Lunes anterior a la semana de `date10`.
 * - Si date10 cae lunes: devuelve el lunes de la semana anterior (date10 - 7d).
 * - Caso general: busca el lunes de ESA semana y le resta 7d.
 */
function mondayBeforeISO10(dateLike) {
  const date10 = toISODate10(dateLike);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date10)) return '';

  const d = new Date(`${date10}T00:00:00Z`);
  const dayMon0 = (d.getUTCDay() + 6) % 7; // lunes=0
  const mondayThisWeek = new Date(d);
  mondayThisWeek.setUTCDate(d.getUTCDate() - dayMon0);

  const mondayPrev = new Date(mondayThisWeek);
  mondayPrev.setUTCDate(mondayThisWeek.getUTCDate() - 7);

  return `${mondayPrev.getUTCFullYear()}-${pad2(mondayPrev.getUTCMonth() + 1)}-${pad2(mondayPrev.getUTCDate())}`;
}

/**
 * Fecha de producción del ítem (ISO10 si se puede).
 */
function getProdDate10(item) {
  const raw =
    item?.fecha_prod ??
    item?.Fecha_Prod ??
    item?.fecha_produccion ??
    item?.Fecha_Produccion ??
    item?.inicio_prod ??
    item?.Inicio_Prod ??
    item?.inicio_prod_imput ??
    item?.Inicio_Prod_Imput ??
    null;

  return toISODate10(raw);
}

/**
 * Regla de cola:
 * - Debe aparecer (pendiente/finalizado) a partir del lunes anterior a su fecha_prod.
 * - Si no hay fecha_prod válida, NO lo bloqueamos.
 * - Si ya está "en proceso", siempre visible.
 */
function canEnterQueue(item, effKey) {
  const st = low(item?.[effKey]);
  if (st === 'en proceso') return true;

  const prod10 = getProdDate10(item);
  if (!prod10) return true;

  const allowFrom = mondayBeforeISO10(prod10);
  if (!allowFrom) return true;

  const today10 = todayISO10Utc();
  return today10 >= allowFrom;
}

// ===== autorización administración (para Despacho) =====
function truthyAuth(v) {
  if (v === true) return true;
  if (v === false || v == null) return false;

  if (typeof v === 'number') return v !== 0;

  const s = String(v).trim().toUpperCase();
  if (!s) return false;

  if (s === '1' || s === 'SI' || s === 'S' || s === 'OK' || s === 'APROBADO' || s === 'AUTORIZADO' || s === 'TRUE')
    return true;

  if (s === '0' || s === 'NO' || s === 'N' || s === 'PENDIENTE' || s === 'FALSE')
    return false;

  return !s.includes('NO') && !s.includes('PEND');
}

function isAdminAuthorized(item) {
  const candidates = [
    item?.aut_admin,
    item?.autorizacion_admin,
    item?.autorizacion_adm,
    item?.aut_adm,
    item?.admin_ok,
    item?.aprobado_admin,
    item?.aprobado_adm,
    item?.autorizado_admin,
    item?.autorizado_adm,
    item?.administracion_ok,
  ];

  if (candidates.some((v) => truthyAuth(v) === true)) return true;

  const anyDefined = candidates.some((v) => v !== undefined);
  if (!anyDefined) return true;

  return false;
}

// =====================
// Modal QC
// =====================
function QcModal({ open, onClose, item, line, stageKey, title, onSaved }) {
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
      onSaved?.(); // para que el Board refresque qcSummary si querés
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
// Modal Observaciones (carga on-demand)
// =====================
function ObservacionesModal({ open, onClose, title, item, line }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [observations, setObservations] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!open || !item) return;

      const qcId = getQcItemId(item, line);
      if (!Number.isInteger(qcId)) {
        setObservations([]);
        return;
      }

      try {
        setErr('');
        setLoading(true);
        const resp = await qcHistory({ line, item_id: qcId });
        const arr = Array.isArray(resp) ? resp : [];
        const onlyObs = arr.filter((x) => up(x?.qc_status) === 'OBSERVADO');
        if (cancelled) return;
        setObservations(onlyObs);
      } catch (e) {
        if (cancelled) return;
        setErr(e?.response?.data?.error || e.message);
        setObservations([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => { cancelled = true; };
  }, [open, item, line]);

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
          <div style={{ fontWeight: 900, color: '#991b1b' }}>Observaciones · {head}</div>
          <button className="btn" type="button" onClick={onClose}>Cerrar</button>
        </div>

        <div style={{ padding: 14 }}>
          {err && <div style={{ color: 'crimson', fontWeight: 800, marginBottom: 10 }}>{err}</div>}

          {loading ? (
            <div style={{ opacity: 0.8 }}>Cargando observaciones…</div>
          ) : rows.length === 0 ? (
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

  // ✅ NUEVO: mapa QC summary batch (item_id -> {has_obs, latest_by_stage})
  qcSummaryMap = {},

  // ✅ opcional: para pedir al Board que refresque summary luego de un QC
  onQcSaved,
}) {
  // QC modal
  const [qcOpen, setQcOpen] = useState(false);
  const [qcTarget, setQcTarget] = useState(null);

  // Observaciones modal
  const [obsOpen, setObsOpen] = useState(false);
  const [obsTarget, setObsTarget] = useState(null);

  const effKey = mode === 'ipanel' && stageKey === 'plegadora' ? 'plegado' : stageKey;
  const line = mapModeToLine(mode);

  const isDespachoColumn = String(effKey || '').trim() === 'despacho';

  // ✅ ocultado para FINALIZADO (instantáneo: no llama qcHistory)
  function shouldHideFinalizado(p) {
    const qcId = getQcItemId(p, line);
    if (!Number.isInteger(qcId)) return false;

    const info = qcSummaryMap?.[qcId];
    const latest = up(info?.latest_by_stage?.[String(effKey || '').trim()] || '');
    if (!latest) return false;

    return latest === 'APROBADO' || latest === 'OBSERVADO';
  }

  // ✅ orden estable + cola por fecha de producción
  const ordered = useMemo(() => {
    const filtered = (items || [])
      .filter((p) => {
        const st = low(p?.[effKey]);
        if (!(st === 'pendiente' || st === 'en proceso' || st === 'finalizado')) return false;
        return canEnterQueue(p, effKey);
      })
      .slice();

    const groupRank = (st) => {
      if (st === 'en proceso') return 0;
      if (st === 'pendiente') return 1;
      return 2;
    };

    const dateRank = (prod10) => (prod10 ? prod10 : '9999-12-31');

    filtered.sort((a, b) => {
      const aSt = low(a?.[effKey]);
      const bSt = low(b?.[effKey]);

      const gA = groupRank(aSt);
      const gB = groupRank(bSt);
      if (gA !== gB) return gA - gB;

      const aProd = dateRank(getProdDate10(a));
      const bProd = dateRank(getProdDate10(b));
      if (aProd !== bProd) return aProd.localeCompare(bProd);

      return (a?.nv || 0) - (b?.nv || 0);
    });

    return filtered;
  }, [items, effKey]);

  const openQc = (p) => {
    setQcTarget(p);
    setQcOpen(true);
  };

  // PDFs
  const showPdfButtons = mode !== 'ipanel';
  const canPdfBase = !!String(pdfBaseUrl || '').trim();
  const pdfButtons = useMemo(
    () => [{ tipo: 'arm-primario', label: 'AP', title: 'PDF Armado Primario (por NV)', icon: '🧰' }],
    []
  );

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
            if (st === 'finalizado') return !shouldHideFinalizado(p);
            return st === 'pendiente' || st === 'en proceso';
          })
          .map((p) => {
            const st = low(p?.[effKey]);
            const canStop = st === 'en proceso';
            const canStart = st === 'pendiente';

            const qcId = getQcItemId(p, line);
            const info = Number.isInteger(qcId) ? qcSummaryMap?.[qcId] : null;
            const hasObs = Boolean(info?.has_obs);

            const prod10 = getProdDate10(p);

            // ✅ Despacho: si NO está autorizado por administración => recuadro rojo
            const needsAdminAuthRed = isDespachoColumn && !isAdminAuthorized(p);

            return (
              <div
                key={`${mode}-${p?.id ?? `${p?.nv}-${p?.nlista}-${p?.partida}`}`}
                style={{
                  border: needsAdminAuthRed ? '2px solid #ef4444' : '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '10px 12px',
                  background: needsAdminAuthRed ? '#fff5f5' : 'var(--surface)',
                  position: 'relative',
                  boxShadow: needsAdminAuthRed ? '0 8px 22px rgba(239,68,68,0.16)' : undefined,
                }}
              >
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
                  {prod10 ? (
                    <>
                      {' '}
                      · Producción: <b>{prod10}</b>
                    </>
                  ) : null}
                  {needsAdminAuthRed ? (
                    <>
                      {' '}
                      · <b style={{ color: '#b91c1c' }}>Falta autorización Administración</b>
                    </>
                  ) : null}
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
        onClose={() => {
          setQcOpen(false);
          setQcTarget(null);
        }}
        item={qcTarget}
        line={line}
        stageKey={effKey}
        title={title}
        onSaved={() => onQcSaved?.()}
      />

      {/* Modal Observaciones */}
      <ObservacionesModal
        open={obsOpen}
        onClose={() => {
          setObsOpen(false);
          setObsTarget(null);
        }}
        title={title}
        item={obsTarget}
        line={line}
      />
    </div>
  );
}

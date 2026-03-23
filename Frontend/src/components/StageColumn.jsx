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
  const nv = Number(item?.nv ?? item?.NV);
  if (Number.isInteger(nv)) return nv;

  if (line === 'portones') {
    const nl = Number(item?.nlista ?? item?.NLista);
    if (Number.isInteger(nl)) return nl;
  }
  const pa = Number(item?.partida ?? item?.PARTIDA);
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
    // usamos fecha local, no UTC
    const yyyy = d.getFullYear();
    const mm = pad2(d.getMonth() + 1);
    const dd = pad2(d.getDate());
    return `${yyyy}-${mm}-${dd}`;
  }

  return '';
}

// ✅ hoy local (Argentina)
function todayISO10Local() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// lunes anterior a la semana de producción (para cola)
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
 * ✅ NUEVO: fecha que ahora usa el sistema de PDFs (link mode) para agrupar portones.
 * Se basa en `fecha_envio_produccion` (Supabase).
 */
function getEnvioProduccionDate10(item) {
  const raw =
    item?.fecha_envio_produccion ??
    item?.Fecha_Envio_Produccion ??
    item?.fecha_envio_prod ??
    item?.Fecha_Envio_Prod ??
    null;

  return toISODate10(raw);
}

function canEnterQueue() {
  return true;
}

/**
 * ✅ Fecha salida/entrega para la regla de despacho
 * Priorizamos lo que vos tenés: fecha_salida_imput
 */
function getSalidaDate10(item) {
  const raw =
    item?.fecha_salida_imput ??
    item?.Fecha_Salida_Imput ??
    item?.fecha_salida ??
    item?.Fecha_Salida ??
    item?.fecha_entrega_imput ??
    item?.Fecha_Entrega_Imput ??
    item?.fecha_entrega ??
    item?.Fecha_Entrega ??
    null;

  return toISODate10(raw);
}

/**
 * ✅ Estado “cliente en regla” (modal)
 * Requisito: si NO existe o es false => NO está en regla.
 */
function isClienteEnRegla(item) {
  return item?.admin_cliente_en_regla === true;
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
    return () => {
      cancelled = true;
    };
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
      onSaved?.();
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
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
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
          <button className="btn" type="button" onClick={onClose}>
            Cerrar
          </button>
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
    return () => {
      cancelled = true;
    };
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
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
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
          <button className="btn" type="button" onClick={onClose}>
            Cerrar
          </button>
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
                  <div style={{ fontSize: 13 }}>
                    <b>Sector:</b> {r.sector}
                  </div>
                  <div style={{ fontSize: 13 }}>
                    <b>Fecha:</b> {r.fecha ? fmt(r.fecha) : '-'}
                  </div>
                  <div style={{ fontSize: 13 }}>
                    <b>Motivo:</b> {r.motivo}
                  </div>
                  <div style={{ fontSize: 13 }}>
                    <b>Quién puso el PIN:</b> {r.quien}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =====================
// ✅ Modal Historial (últimos 10 del sector)
// =====================
function HistoryModal({ open, onClose, title, effKey, rows = [] }) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
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
          width: 'min(900px, 100%)',
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
            Historial · {title} <span style={{ opacity: 0.7, fontWeight: 700 }}>({effKey})</span>
          </div>
          <button className="btn" type="button" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <div style={{ padding: 14 }}>
          {rows.length === 0 ? (
            <div style={{ opacity: 0.75 }}>Sin historial para mostrar.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rows.map((r) => (
                <div
                  key={r._key}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: 12,
                    padding: 12,
                    background: '#ffffff',
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 10,
                    alignItems: 'center',
                  }}
                >
                  <div style={{ fontSize: 13 }}>
                    <div style={{ fontWeight: 900 }}>
                      Portón {r.nlista} · NV {r.nv} · Partida {r.partida}
                    </div>
                    <div style={{ opacity: 0.8, marginTop: 2 }}>
                      Fin etapa: <b>{r.fin ? fmt(r.fin) : '-'}</b>
                      {r.prod10 ? (
                        <>
                          {' '}
                          · Producción: <b>{r.prod10}</b>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.9 }}>
                    {r.qcLatest ? `QC: ${r.qcLatest}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =====================
// StageColumn
// =====================
export default function StageColumn({
  title,
  stageKey,
  mode = 'porton',
  items = [],
  allItems = [],
  onStart,
  onStop,
  disabledId,
  pdfBaseUrl = 'https://integrador-six-zeta.vercel.app',
  qcSummaryMap = {},
  onQcSaved,
}) {
  const [qcOpen, setQcOpen] = useState(false);
  const [qcTarget, setQcTarget] = useState(null);

  const [obsOpen, setObsOpen] = useState(false);
  const [obsTarget, setObsTarget] = useState(null);

  const [histOpen, setHistOpen] = useState(false);

  const effKey = mode === 'ipanel' && stageKey === 'plegadora' ? 'plegado' : stageKey;
  const line = mapModeToLine(mode);

  const keyTrim = String(effKey || '').trim();
  const isDespachoColumn = keyTrim === 'despacho';

  function shouldHideFinalizado(p) {
    const qcId = getQcItemId(p, line);
    if (!Number.isInteger(qcId)) return false;

    const info = qcSummaryMap?.[qcId];
    const latest = up(info?.latest_by_stage?.[keyTrim] || '');
    if (!latest) return false;

    return latest === 'APROBADO' || latest === 'OBSERVADO';
  }

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

  const showPdfButtons = mode !== 'ipanel';
  const canPdfBase = !!String(pdfBaseUrl || '').trim();

  const pdfButtons = useMemo(() => {
    const k = String(keyTrim || '').trim();

    if (k === 'diseno' || k === 'laser') {
      return [{ tipo: 'diseno', label: 'Diseño', title: 'PDF Diseño', icon: '📐' }];
    }

    const cortePlegadoKeys = new Set([
      'guillotina',
      'corte_revest',
      'plegadora',
      'plegado_revest',
      'armado_piernas',
    ]);

    if (cortePlegadoKeys.has(k)) {
      return [
        // ✅ Para estas secciones necesitamos 2 PDFs distintos:
        // - corte-plegado
        // - tapajuntas
        // Antes el 2° botón enviaba `plegado`, que se mapeaba a `corte-plegado`,
        // por eso ambos abrían el mismo PDF.
        { tipo: 'corte', label: 'Corte/Plegado', title: 'PDF Corte/Plegado', icon: '✂️' },
        { tipo: 'tapajuntas', label: 'Tapajuntas', title: 'PDF Tapajuntas', icon: '📏' },
      ];
    }

    return [{ tipo: 'arm-primario', label: 'AP', title: 'PDF Armado Primario (por NV)', icon: '🧰' }];
  }, [keyTrim]);

  /**
   * ✅ Adaptación a “links por fecha”
   *
   * - Diseño / Corte / Plegado / Tapajuntas: se abren por fecha (YYYY-MM-DD).
   *   En la tabla portones guardamos esa fecha como `fecha_prod`.
   *   En el visor actual, el parámetro se llama `fecha_envio_produccion`, así que lo enviamos
   *   con el valor de `fecha_prod` para compatibilidad.
   * - Armado Primario queda por NV (como siempre)
   */
  function openPdf(tipo, item) {
    const base = (pdfBaseUrl || '').trim();
    if (!base) return;

    const t = String(tipo || '').trim();

    const tipoMap =
      t === 'diseno' ? 'diseno-laser' :
      (t === 'corte' || t === 'plegado') ? 'corte-plegado' :
      t === 'tapajuntas' ? 'tapajuntas' :
      t; // arm-primario

    const nvStr = item?.nv != null ? String(item.nv).trim() : (item?.NV != null ? String(item.NV).trim() : '');
    const partidaStr =
      item?.partida != null ? String(item.partida).trim() : (item?.PARTIDA != null ? String(item.PARTIDA).trim() : '');

    // ✅ Fecha guía para PDFs agrupados:
    // Preferimos fecha_prod (planificación/producción) desde tabla portones,
    // y dejamos fecha_envio_produccion como fallback por compatibilidad.
    const fecha10 = getProdDate10(item) || getEnvioProduccionDate10(item);

    const params = new URLSearchParams();
    params.set('pdf', tipoMap);

    if (tipoMap === 'arm-primario') {
      // ✅ NO TOCAR: sigue por NV (preferido). Si no hay NV, cae a partida como antes.
      if (nvStr) params.set('nv', nvStr);
      else if (partidaStr) params.set('partida', partidaStr);
    } else {
      // ✅ Agrupación por fecha
      if (fecha10) {
        // Visor actual
        params.set('fecha_envio_produccion', fecha10);
        // Compatibilidad futura
        params.set('fecha_prod', fecha10);
      } else {
        // fallback conservador: evitamos abrir un link inválido
        alert('Este portón no tiene fecha de producción cargada, no se puede abrir el PDF por fecha.');
        return;
      }
    }

    const url = `${base}/?${params.toString()}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  const historyLast10 = useMemo(() => {
    if (mode === 'ipanel') return [];

    const key = String(keyTrim || '').trim();
    const finKey = `${key}_fin`;

    const src = Array.isArray(allItems) ? allItems : [];

    const done = src.filter((p) => {
      const st = low(p?.[key]);
      if (st !== 'finalizado') return false;

      const qcId = getQcItemId(p, 'portones');
      const info = Number.isInteger(qcId) ? qcSummaryMap?.[qcId] : null;
      const latest = up(info?.latest_by_stage?.[key] || '');

      if (latest) return latest === 'APROBADO' || latest === 'OBSERVADO';

      return true;
    });

    done.sort((a, b) => {
      const aT = a?.[finKey] ? new Date(a[finKey]).getTime() : 0;
      const bT = b?.[finKey] ? new Date(b[finKey]).getTime() : 0;

      if (aT && bT && aT !== bT) return bT - aT;
      if (aT && !bT) return -1;
      if (!aT && bT) return 1;

      return (Number(b?.nv) || 0) - (Number(a?.nv) || 0);
    });

    return done.slice(0, 10).map((p) => {
      const qcId = getQcItemId(p, 'portones');
      const info = Number.isInteger(qcId) ? qcSummaryMap?.[qcId] : null;
      const qcLatest = up(info?.latest_by_stage?.[key] || '');

      return {
        _key: String(p?.id ?? p?.nv ?? `${Math.random()}`),
        nv: p?.nv ?? '-',
        nlista: p?.nlista ?? '-',
        partida: p?.partida ?? '-',
        fin: p?.[finKey] ?? null,
        prod10: getProdDate10(p) || '',
        qcLatest,
      };
    });
  }, [mode, keyTrim, allItems, qcSummaryMap]);

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
          gap: 8,
        }}
      >
        <div>{title}</div>

        {mode !== 'ipanel' ? (
          <button
            type="button"
            className="btn"
            onClick={() => setHistOpen(true)}
            title="Ver historial (últimos 10)"
            style={{
              background: 'rgba(255,255,255,0.18)',
              color: '#fff',
              borderColor: 'rgba(255,255,255,0.35)',
              fontWeight: 900,
              padding: '6px 10px',
            }}
          >
            Hist
          </button>
        ) : null}
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

            // ✅ NUEVO: regla despacho (fecha salida + admin_cliente_en_regla)
            const salida10 = getSalidaDate10(p);
            const today10 = todayISO10Local();
            const vencida = salida10 ? salida10 <= today10 : false;

            const enRegla = isClienteEnRegla(p);

            const needsAdminAuthRed = isDespachoColumn && vencida && !enRegla;

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

                <div style={{ fontWeight: 900 }}>N° Portón {p?.nlista ?? p?.NLista ?? '-'}</div>
                <div>Partida {p?.partida ?? p?.PARTIDA ?? '-'}</div>
                <div>NV {p?.nv ?? p?.NV ?? '-'}</div>

                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  Estado: {p?.[effKey] || ''}
                  {prod10 ? (
                    <>
                      {' '}
                      · Producción: <b>{prod10}</b>
                    </>
                  ) : null}

                  {isDespachoColumn && salida10 ? (
                    <>
                      {' '}
                      · Salida: <b>{salida10}</b>
                    </>
                  ) : null}

                  {needsAdminAuthRed ? (
                    <>
                      {' '}
                      · <b style={{ color: '#b91c1c' }}>Cliente NO en regla (Administración)</b>
                    </>
                  ) : null}
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  {showPdfButtons &&
                    pdfButtons.map((b) => {
                      const enabled =
                        canPdfBase &&
                        (b.tipo === 'arm-primario'
                          ? Boolean(p?.nv != null || p?.NV != null || p?.partida != null || p?.PARTIDA != null)
                          : Boolean(getProdDate10(p) || getEnvioProduccionDate10(p)));

                      return (
                        <button
                          key={b.tipo}
                          className="btn"
                          onClick={() => openPdf(b.tipo, p)}
                          disabled={!enabled}
                          title={
                            b.tipo === 'arm-primario'
                              ? b.title
                              : `${b.title} (por fecha de producción)`
                          }
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

      <HistoryModal
        open={histOpen}
        onClose={() => setHistOpen(false)}
        title={title}
        effKey={String(effKey || '').trim()}
        rows={historyLast10}
      />

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

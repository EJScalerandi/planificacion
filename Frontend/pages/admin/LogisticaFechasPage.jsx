// pages/admin/LogisticaFechasPage.jsx
//
// Un paso antes de Logística de Viajes: acá se decide EN QUÉ SEMANA sale
// (despacho) o llega/instala (instalación) cada portón, arrastrando desde el
// pool de "sin fecha" hacia la semana elegida (o entre semanas). Escribe
// directo sobre fecha_salida_imput / fecha_llegada_imput en
// preproduccion_valores — la MISMA propiedad que edita /a — así que cualquier
// cambio acá se ve reflejado ahí y viceversa (misma fuente de datos, sin
// tabla ni endpoint nuevo).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getAdminToken, clearAdminToken, fetchPreproduccionValores, updatePreproduccionValor, fetchPortones } from '../../src/api';
import { getPreproduccionAccessMode } from '../../src/utils/adminScopes';
import {
  isoWeekLabelFromDate,
  isoWeekStartEndFromLabel,
  weekNumberFromLabel,
  weekTitleFromSelection,
  buildWeekRange,
  formatDMY,
  todayISO10,
} from '../../src/utils/isoWeek';
import { BLOCKED_NV_URL, parseBlockedNvText, getAny, getNvCanonicalFromRow, getSistemaFromRow } from '../../src/utils/preproduccionRow';

const DND_MIME = 'application/x-logistica-fecha-row';

const MODES = {
  despacho: { label: 'Despacho', patchKey: 'fecha_salida_imput', altKey: 'Fecha_Salida_Imput' },
  instalacion: { label: 'Instalación', patchKey: 'fecha_llegada_imput', altKey: 'Fecha_Llegada_Imput' },
};

function getDateValue(row, mode) {
  const d = row?.data || {};
  const cfg = MODES[mode];
  return d[cfg.patchKey] ?? d[cfg.altKey] ?? '';
}

function ciIncludes(haystack, needle) {
  return String(haystack || '').toLowerCase().includes(String(needle || '').toLowerCase());
}

function RowChip({ row, mode, draggable, onDragStart, onDragEnd, busy }) {
  const nv = getNvCanonicalFromRow(row);
  const d = row?.data || {};
  const nombre = getAny(d, ['Nombre']) || '';
  const distribuidor = getAny(d, ['RazSoc']) || '';
  const sistema = getSistemaFromRow(row) || '';
  const fecha = getDateValue(row, mode);

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '8px 10px',
        background: 'var(--surface)',
        cursor: draggable ? 'grab' : 'default',
        opacity: busy ? 0.5 : 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
      }}
      title={distribuidor}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontWeight: 900, fontSize: 13 }}>NV {nv || '—'}</span>
        {fecha ? <span style={{ fontSize: 10, opacity: 0.7 }}>{formatDMY(fecha)}</span> : null}
      </div>
      <div style={{ fontSize: 12, opacity: 0.85 }}>{nombre || sistema || '—'}</div>
      {distribuidor ? <div style={{ fontSize: 11, opacity: 0.65 }}>{distribuidor}</div> : null}
    </div>
  );
}

function WeekColumn({ weekLabel, rows, mode, canEdit, saving, onDropRow, onDragStartChip, onDragEndChip, isCurrent, colRef }) {
  const [over, setOver] = useState(false);
  return (
    <div
      ref={colRef}
      onDragOver={(e) => { if (!canEdit) return; e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { if (!canEdit) return; e.preventDefault(); setOver(false); onDropRow(weekLabel, e); }}
      style={{
        minWidth: 210, maxWidth: 210, display: 'flex', flexDirection: 'column', gap: 8,
        border: `1px solid ${over ? 'var(--brand)' : isCurrent ? 'var(--brand)' : 'var(--border)'}`,
        borderRadius: 12, padding: 10,
        background: over ? 'var(--brand-100)' : isCurrent ? 'color-mix(in srgb, var(--brand) 6%, var(--surface))' : 'var(--surface)',
      }}
    >
      <div>
        <div style={{ fontWeight: 900, fontSize: 12 }}>
          Semana {weekNumberFromLabel(weekLabel)} {isCurrent ? <span style={{ fontSize: 10, color: 'var(--brand-700)' }}>(hoy)</span> : null}
        </div>
        <div style={{ fontSize: 10, opacity: 0.7 }}>{weekTitleFromSelection(weekLabel).replace(/^Semana \d+ /, '')}</div>
        <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{rows.length} portón{rows.length === 1 ? '' : 'es'}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 40 }}>
        {rows.map((row) => (
          <RowChip
            key={row.id}
            row={row}
            mode={mode}
            draggable={canEdit}
            busy={saving.has(row.id)}
            onDragStart={(e) => onDragStartChip(e, row)}
            onDragEnd={onDragEndChip}
          />
        ))}
      </div>
    </div>
  );
}

export default function LogisticaFechasPage() {
  const nav = useNavigate();

  useEffect(() => {
    if (!getAdminToken()) nav('/admin/login', { replace: true });
  }, [nav]);

  const accessMode = getPreproduccionAccessMode();
  const canEdit = accessMode === 'full';

  const [mode, setMode] = useState('despacho');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const [mostrarDespachados, setMostrarDespachados] = useState(false);

  const [blockedNvSet, setBlockedNvSet] = useState(() => new Set());
  const [despachoFinalizadoByNv, setDespachoFinalizadoByNv] = useState(() => new Map());

  const load = useCallback(async () => {
    setErr('');
    setLoading(true);
    try {
      const [pvRes, blockedTxt, portonesRes] = await Promise.all([
        fetchPreproduccionValores(),
        fetch(BLOCKED_NV_URL, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
        fetchPortones().catch(() => null),
      ]);
      setRows(Array.isArray(pvRes?.data) ? pvRes.data : []);
      setBlockedNvSet(parseBlockedNvText(blockedTxt));

      const finalizadoByNv = new Map();
      const list = Array.isArray(portonesRes?.data) ? portonesRes.data : [];
      for (const it of list) {
        const nv = Number(it?.nv ?? it?.NV);
        if (!Number.isInteger(nv)) continue;
        const despacho = String(it?.despacho ?? it?.Despacho ?? '').trim().toLowerCase();
        const prev = finalizadoByNv.has(nv) ? finalizadoByNv.get(nv) : true;
        finalizadoByNv.set(nv, prev && despacho === 'finalizado');
      }
      setDespachoFinalizadoByNv(finalizadoByNv);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (accessMode === 'none') return;
    load();
  }, [accessMode, load]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const nv = getNvCanonicalFromRow(row);
      if (nv && blockedNvSet.has(nv)) return false;
      if (mode === 'despacho' && !mostrarDespachados) {
        const nvInt = Number(nv);
        if (Number.isInteger(nvInt) && despachoFinalizadoByNv.get(nvInt) === true) return false;
      }
      return true;
    });
  }, [rows, blockedNvSet, mode, mostrarDespachados, despachoFinalizadoByNv]);

  const pool = useMemo(
    () => filteredRows.filter((row) => !isoWeekLabelFromDate(getDateValue(row, mode))),
    [filteredRows, mode]
  );

  const poolFiltered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return pool;
    return pool.filter((row) => {
      const nv = getNvCanonicalFromRow(row);
      const d = row?.data || {};
      const nombre = getAny(d, ['Nombre']) || '';
      const distribuidor = getAny(d, ['RazSoc']) || '';
      const sistema = getSistemaFromRow(row) || '';
      return ciIncludes(`${nv} ${nombre} ${distribuidor} ${sistema}`, needle);
    });
  }, [pool, search]);

  const rowsByWeek = useMemo(() => {
    const map = new Map();
    for (const row of filteredRows) {
      const wk = isoWeekLabelFromDate(getDateValue(row, mode));
      if (!wk) continue;
      if (!map.has(wk)) map.set(wk, []);
      map.get(wk).push(row);
    }
    return map;
  }, [filteredRows, mode]);

  const currentWeek = useMemo(() => isoWeekLabelFromDate(todayISO10()), []);

  const weeks = useMemo(() => {
    const base = buildWeekRange(4, 20);
    const set = new Set(base);
    for (const wk of rowsByWeek.keys()) set.add(wk);
    return Array.from(set).sort();
  }, [rowsByWeek]);

  const colRefs = useRef({});
  const scrollToToday = () => {
    colRefs.current[currentWeek]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };

  const patchRow = useCallback(async (id, patch) => {
    setSaving((prev) => new Set(prev).add(id));
    setErr('');
    try {
      const res = await updatePreproduccionValor(id, patch);
      const updated = res?.data;
      if (updated) setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setSaving((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }
  }, []);

  const onDragStartChip = (e, row) => {
    e.dataTransfer.setData(DND_MIME, JSON.stringify({ id: row.id }));
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragEndChip = () => {};

  const onDropToWeek = useCallback((weekLabel, e) => {
    const raw = e.dataTransfer.getData(DND_MIME);
    if (!raw) return;
    let payload;
    try { payload = JSON.parse(raw); } catch { return; }
    const row = rows.find((r) => r.id === payload.id);
    if (!row) return;
    if (isoWeekLabelFromDate(getDateValue(row, mode)) === weekLabel) return;

    const { start } = isoWeekStartEndFromLabel(weekLabel);
    patchRow(row.id, { [MODES[mode].patchKey]: start });
  }, [rows, mode, patchRow]);

  const [poolOver, setPoolOver] = useState(false);
  const onDropToPool = useCallback((e) => {
    const raw = e.dataTransfer.getData(DND_MIME);
    if (!raw) return;
    let payload;
    try { payload = JSON.parse(raw); } catch { return; }
    const row = rows.find((r) => r.id === payload.id);
    if (!row) return;
    if (!isoWeekLabelFromDate(getDateValue(row, mode))) return;

    patchRow(row.id, { [MODES[mode].patchKey]: null });
  }, [rows, mode, patchRow]);

  const logout = () => {
    clearAdminToken();
    nav('/admin/login', { replace: true });
  };

  if (accessMode === 'none') {
    return (
      <div className="container">
        <div style={{ background: '#fff5f5', border: '1px solid #fecaca', padding: 12, borderRadius: 12 }}>
          No tenés permisos para ver Planificación de Fechas. Pedí que te asignen: <b>preproduccion:full</b>,{' '}
          <b>preproduccion:admin</b> o <b>preproduccion:comercial_view</b>.
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header-row" style={{ alignItems: 'center' }}>
        <h2 className="h1">Planificación de Fechas</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn" to="/a">Ir a Preproducción (/a)</Link>
          <Link className="btn" to="/admin/logistica-viajes">Ir a Viajes de Logística</Link>
          <button className="btn" onClick={load} disabled={loading}>Recargar</button>
          <button className="btn" onClick={logout}>Salir</button>
        </div>
      </div>

      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
        Arrastrá un portón del pool (izquierda) a la semana que le corresponda, o de una semana a otra para
        cambiarla. Escribe directo sobre {MODES[mode].patchKey} — la misma propiedad que ves y editás en /a —
        así que los cambios se reflejan ahí al instante (y viceversa).
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
        <div className="btn" style={{ display: 'inline-flex', padding: 2, gap: 2 }}>
          {Object.entries(MODES).map(([key, cfg]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className="btn"
              style={{
                border: 'none',
                background: mode === key ? 'var(--brand)' : 'transparent',
                color: mode === key ? '#fff' : undefined,
              }}
            >
              {cfg.label}
            </button>
          ))}
        </div>

        {mode === 'despacho' ? (
          <label className="btn" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={mostrarDespachados} onChange={(e) => setMostrarDespachados(e.target.checked)} />
            Mostrar ya despachados
          </label>
        ) : null}

        <button className="btn" onClick={scrollToToday}>Ir a hoy</button>
      </div>

      {err ? <div style={{ color: 'crimson', fontWeight: 800, fontSize: 12, marginTop: 10 }}>{err}</div> : null}

      {loading ? (
        <div style={{ marginTop: 16, opacity: 0.75 }}>Cargando…</div>
      ) : (
        <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
          <div
            onDragOver={(e) => { if (!canEdit) return; e.preventDefault(); setPoolOver(true); }}
            onDragLeave={() => setPoolOver(false)}
            onDrop={(e) => { if (!canEdit) return; e.preventDefault(); setPoolOver(false); onDropToPool(e); }}
            style={{
              minWidth: 300, maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 8,
              border: `1px solid ${poolOver ? 'var(--brand)' : 'var(--border)'}`,
              borderRadius: 12, padding: 10,
              background: poolOver ? 'var(--brand-100)' : 'var(--surface-muted, #f9fafb)',
              maxHeight: '72vh', overflowY: 'auto',
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 13 }}>Sin {MODES[mode].label.toLowerCase()} ({poolFiltered.length})</div>
            <input
              className="pp-input"
              placeholder="Buscar NV, cliente, distribuidor, sistema…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {poolFiltered.length === 0 ? (
              <div style={{ fontSize: 11, opacity: 0.6 }}>Nada por asignar.</div>
            ) : (
              poolFiltered.map((row) => (
                <RowChip
                  key={row.id}
                  row={row}
                  mode={mode}
                  draggable={canEdit}
                  busy={saving.has(row.id)}
                  onDragStart={(e) => onDragStartChip(e, row)}
                  onDragEnd={onDragEndChip}
                />
              ))
            )}
          </div>

          <div style={{ flex: 1, display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, maxHeight: '72vh' }}>
            {weeks.map((wk) => (
              <WeekColumn
                key={wk}
                weekLabel={wk}
                rows={rowsByWeek.get(wk) || []}
                mode={mode}
                canEdit={canEdit}
                saving={saving}
                onDropRow={onDropToWeek}
                onDragStartChip={onDragStartChip}
                onDragEndChip={onDragEndChip}
                isCurrent={wk === currentWeek}
                colRef={(el) => { colRefs.current[wk] = el; }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

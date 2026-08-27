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
import PortonesMapaModal from '../../src/components/modals/PortonesMapaModal';
import LogisticaFechasMapaView from '../../src/components/LogisticaFechasMapaView';

// NV únicos de un conjunto de filas (despacho e instalación del mismo NV son
// el mismo domicilio).
function uniqueNvs(rows) {
  return Array.from(new Set((rows || []).map((r) => Number(getNvCanonicalFromRow(r))).filter(Number.isInteger)));
}

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

// Buscador compartido entre el pool y el tablero de semanas: NV, cliente,
// distribuidor, sistema.
function matchesSearch(row, needle) {
  if (!needle) return true;
  const nv = getNvCanonicalFromRow(row);
  const d = row?.data || {};
  const nombre = getAny(d, ['Nombre']) || '';
  const distribuidor = getAny(d, ['RazSoc']) || '';
  const sistema = getSistemaFromRow(row) || '';
  return ciIncludes(`${nv} ${nombre} ${distribuidor} ${sistema}`, needle);
}

// Color por estado de instalación (independiente del modo que estés viendo):
// azul = ya tiene fecha_llegada_imput (instalación) asignada, amarillo = no.
const INSTALACION_COLOR = { border: '#3b82f6', bg: 'rgba(59,130,246,0.10)' };
const SIN_INSTALACION_COLOR = { border: '#f59e0b', bg: 'rgba(245,158,11,0.10)' };

function RowChip({ row, mode, draggable, onDragStart, onDragEnd, busy, highlight }) {
  const nv = getNvCanonicalFromRow(row);
  const d = row?.data || {};
  const nombre = getAny(d, ['Nombre']) || '';
  const distribuidor = getAny(d, ['RazSoc']) || '';
  const sistema = getSistemaFromRow(row) || '';
  const fecha = getDateValue(row, mode);
  const tieneInstalacion = !!isoWeekLabelFromDate(getDateValue(row, 'instalacion'));
  const accent = tieneInstalacion ? INSTALACION_COLOR : SIN_INSTALACION_COLOR;

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        border: '1px solid var(--border)',
        borderLeft: `4px solid ${accent.border}`,
        borderRadius: 10,
        padding: '8px 10px',
        background: `linear-gradient(0deg, ${accent.bg}, ${accent.bg}), var(--surface)`,
        cursor: draggable ? 'grab' : 'default',
        opacity: busy ? 0.5 : 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        boxShadow: highlight ? '0 0 0 2px var(--brand)' : 'none',
      }}
      title={`${distribuidor}${tieneInstalacion ? ' · con instalación asignada' : ' · sin instalación asignada'}`}
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

function WeekColumn({ weekLabel, rows, mode, canEdit, saving, onDropRow, onDragStartChip, onDragEndChip, isCurrent, colRef, searchNeedle, onVerMapa }) {
  const [over, setOver] = useState(false);
  return (
    <div
      ref={colRef}
      onDragOver={(e) => { if (!canEdit) return; e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { if (!canEdit) return; e.preventDefault(); setOver(false); onDropRow(weekLabel, e); }}
      style={{
        minWidth: 210, maxWidth: 210, height: '100%', display: 'flex', flexDirection: 'column', gap: 8,
        border: `1px solid ${over ? 'var(--brand)' : isCurrent ? 'var(--brand)' : 'var(--border)'}`,
        borderRadius: 12, padding: 10,
        background: over ? 'var(--brand-100)' : isCurrent ? 'color-mix(in srgb, var(--brand) 6%, var(--surface))' : 'var(--surface)',
      }}
    >
      <div style={{ flex: '0 0 auto' }}>
        <div style={{ fontWeight: 900, fontSize: 12 }}>
          Semana {weekNumberFromLabel(weekLabel)} {isCurrent ? <span style={{ fontSize: 10, color: 'var(--brand-700)' }}>(hoy)</span> : null}
        </div>
        <div style={{ fontSize: 10, opacity: 0.7 }}>{weekTitleFromSelection(weekLabel).replace(/^Semana \d+ /, '')}</div>
        <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{rows.length} portón{rows.length === 1 ? '' : 'es'}</div>
        <button
          type="button"
          className="btn"
          style={{ padding: '1px 6px', fontSize: 10, marginTop: 4 }}
          disabled={rows.length === 0}
          onClick={() => onVerMapa(weekLabel, rows)}
        >
          🗺️ Mapa
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 40, flex: '1 1 auto', overflowY: 'auto' }}>
        {rows.map((row) => (
          <RowChip
            key={row.id}
            row={row}
            mode={mode}
            draggable={canEdit}
            busy={saving.has(row.id)}
            highlight={!!searchNeedle && matchesSearch(row, searchNeedle)}
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

  // Vista principal: mapa (default - portones pendientes de asignar, filtro
  // por semana, ver/crear viajes) o tablero clásico (arrastrar por semana
  // para fijar fecha_salida_imput/fecha_llegada_imput) - secundario, para
  // consultar/ajustar fechas sueltas.
  const [vista, setVista] = useState('mapa'); // 'mapa' | 'tablero'

  const [mode, setMode] = useState('despacho');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const [mapa, setMapa] = useState(null); // { nvs, titulo } | null

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

  // Despacho finalizado = ya salió de fábrica: se saca de Planificación de
  // Fechas por completo (los dos modos), no solo del modo Despacho, para
  // no ensuciar la pantalla con portones que ya no hay que replanificar.
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const nv = getNvCanonicalFromRow(row);
      if (nv && blockedNvSet.has(nv)) return false;
      const nvInt = Number(nv);
      if (Number.isInteger(nvInt) && despachoFinalizadoByNv.get(nvInt) === true) return false;
      return true;
    });
  }, [rows, blockedNvSet, despachoFinalizadoByNv]);

  const pool = useMemo(
    () => filteredRows.filter((row) => !isoWeekLabelFromDate(getDateValue(row, mode))),
    [filteredRows, mode]
  );

  const searchNeedle = search.trim().toLowerCase();

  const poolFiltered = useMemo(
    () => pool.filter((row) => matchesSearch(row, searchNeedle)),
    [pool, searchNeedle]
  );

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

  // Con búsqueda activa, el tablero se achica a solo las semanas que tienen
  // algún match (así "3990" te dice de un vistazo en qué semana está); sin
  // búsqueda, se ven todas como siempre.
  const visibleWeeks = useMemo(() => {
    if (!searchNeedle) return weeks;
    return weeks.filter((wk) => (rowsByWeek.get(wk) || []).some((row) => matchesSearch(row, searchNeedle)));
  }, [weeks, rowsByWeek, searchNeedle]);

  const colRefs = useRef({});
  const scrollToToday = () => {
    colRefs.current[currentWeek]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };

  // Al entrar, arrancar posicionado en la semana en curso (una sola vez, no
  // cada vez que se recarga o se cambia de modo).
  const didInitialScrollRef = useRef(false);
  useEffect(() => {
    if (loading || didInitialScrollRef.current) return;
    didInitialScrollRef.current = true;
    const id = requestAnimationFrame(() => {
      colRefs.current[currentWeek]?.scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' });
    });
    return () => cancelAnimationFrame(id);
  }, [loading, currentWeek]);

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
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 74px)', padding: '10px 16px 16px' }}>
      <div className="header-row" style={{ alignItems: 'center', flex: '0 0 auto' }}>
        <h2 className="h1" style={{ fontSize: 16, padding: '6px 14px' }}>Planificación de Fechas</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="btn" style={{ display: 'inline-flex', padding: 2, gap: 2 }}>
            <button
              type="button" onClick={() => setVista('mapa')} className="btn"
              style={{ border: 'none', background: vista === 'mapa' ? 'var(--brand)' : 'transparent', color: vista === 'mapa' ? '#fff' : undefined }}
            >
              🗺️ Mapa
            </button>
            <button
              type="button" onClick={() => setVista('tablero')} className="btn"
              style={{ border: 'none', background: vista === 'tablero' ? 'var(--brand)' : 'transparent', color: vista === 'tablero' ? '#fff' : undefined }}
            >
              📋 Tablero clásico
            </button>
          </div>
          <Link className="btn" to="/a">/a</Link>
          <Link className="btn" to="/admin/logistica-viajes">Viajes de Logística</Link>
          <button className="btn" onClick={load} disabled={loading}>Recargar</button>
          <button className="btn" onClick={logout}>Salir</button>
        </div>
      </div>

      {vista === 'mapa' ? (
        <div style={{ flex: '1 1 auto', minHeight: 0, marginTop: 10 }}>
          <LogisticaFechasMapaView canEdit={canEdit} onCreated={load} />
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap', flex: '0 0 auto' }}>
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

            <button className="btn" onClick={scrollToToday}>Ir a hoy</button>

            <span style={{ fontSize: 11, opacity: 0.7 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: INSTALACION_COLOR.border, marginRight: 4 }} />
              con instalación
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: SIN_INSTALACION_COLOR.border, margin: '0 4px 0 10px' }} />
              sin instalación
            </span>

            <span style={{ fontSize: 11, opacity: 0.65 }}>
              Arrastrá un portón para asignarle/cambiarle la semana. Escribe directo {MODES[mode].patchKey} (misma
              propiedad que /a).
            </span>
          </div>

          {err ? <div style={{ color: 'crimson', fontWeight: 800, fontSize: 12, marginTop: 8, flex: '0 0 auto' }}>{err}</div> : null}

          {loading ? (
            <div style={{ marginTop: 16, opacity: 0.75 }}>Cargando…</div>
          ) : (
            <div style={{ display: 'flex', gap: 12, marginTop: 10, flex: '1 1 auto', minHeight: 0 }}>
              <div
                onDragOver={(e) => { if (!canEdit) return; e.preventDefault(); setPoolOver(true); }}
                onDragLeave={() => setPoolOver(false)}
                onDrop={(e) => { if (!canEdit) return; e.preventDefault(); setPoolOver(false); onDropToPool(e); }}
                style={{
                  minWidth: 300, maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 8,
                  border: `1px solid ${poolOver ? 'var(--brand)' : 'var(--border)'}`,
                  borderRadius: 12, padding: 10,
                  background: poolOver ? 'var(--brand-100)' : 'var(--surface-muted, #f9fafb)',
                  overflowY: 'auto',
                }}
              >
                <div style={{ fontWeight: 900, fontSize: 13, flex: '0 0 auto' }}>
                  Sin {MODES[mode].label.toLowerCase()} ({poolFiltered.length})
                </div>
                <input
                  className="pp-input"
                  placeholder="Buscar NV, cliente… (también filtra las semanas)"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ flex: '0 0 auto' }}
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

              <div style={{ flex: '1 1 auto', display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, minHeight: 0 }}>
                {searchNeedle && visibleWeeks.length === 0 ? (
                  <div style={{ fontSize: 12, opacity: 0.65, padding: 10 }}>
                    Ninguna semana tiene un portón que matchee "{search.trim()}" (puede estar en el pool, sin fecha).
                  </div>
                ) : (
                  visibleWeeks.map((wk) => (
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
                      searchNeedle={searchNeedle}
                      onVerMapa={(weekLabel, rows) => setMapa({ nvs: uniqueNvs(rows), titulo: `Mapa · Semana ${weekNumberFromLabel(weekLabel)}` })}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </>
      )}

      <PortonesMapaModal open={!!mapa} nvs={mapa?.nvs} titulo={mapa?.titulo} onClose={() => setMapa(null)} />
    </div>
  );
}

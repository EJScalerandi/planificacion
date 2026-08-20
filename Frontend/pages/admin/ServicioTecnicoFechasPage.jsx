// pages/admin/ServicioTecnicoFechasPage.jsx
//
// Espejo de LogisticaFechasPage.jsx, aplicado a Servicio Técnico: acá se
// decide EN QUÉ SEMANA se atiende cada solicitud de ST o cada medición
// pendiente, arrastrando desde el pool ("sin fecha") a la semana elegida (o
// entre semanas). A diferencia de Logística no hay dos "modos" (despacho/
// instalación) - acá el pool mezcla dos tipos de item (🔧 solicitud, 📏
// medición) en un solo tablero.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getAdminToken, clearAdminToken, fetchStFechasItems, patchStFechaItem, fetchStLogisticaSombraFechas } from '../../src/api';
import {
  isoWeekLabelFromDate, isoWeekStartEndFromLabel, weekNumberFromLabel,
  weekTitleFromSelection, buildWeekRange, formatDMY, todayISO10,
} from '../../src/utils/isoWeek';
import ServicioTecnicoIaMapaModal from '../../src/components/modals/ServicioTecnicoIaMapaModal';

const DND_MIME = 'application/x-st-fecha-item';

function ciIncludes(haystack, needle) {
  return String(haystack || '').toLowerCase().includes(String(needle || '').toLowerCase());
}
function matchesSearch(item, needle) {
  if (!needle) return true;
  return ciIncludes(`${item.nv ?? ''} ${item.nombre_cliente ?? ''} ${item.distribuidor ?? ''} ${item.descripcion ?? ''}`, needle);
}

const TIPO_COLOR = {
  solicitud: { border: '#7c3aed', bg: 'rgba(124,58,237,0.10)' },
  medicion: { border: '#0891b2', bg: 'rgba(8,145,178,0.10)' },
};

function ItemChip({ item, draggable, onDragStart, onDragEnd, busy, highlight }) {
  const accent = TIPO_COLOR[item.tipo] || TIPO_COLOR.solicitud;
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        border: '1px solid var(--border)', borderLeft: `4px solid ${accent.border}`, borderRadius: 10, padding: '8px 10px',
        background: `linear-gradient(0deg, ${accent.bg}, ${accent.bg}), var(--surface)`,
        cursor: draggable ? 'grab' : 'default', opacity: busy ? 0.5 : 1,
        display: 'flex', flexDirection: 'column', gap: 3,
        boxShadow: highlight ? '0 0 0 2px var(--brand)' : 'none',
      }}
      title={item.tipo === 'solicitud' ? 'Solicitud de servicio técnico' : 'Medición pendiente'}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontWeight: 900, fontSize: 13 }}>
          {item.tipo === 'solicitud' ? '🔧' : '📏'} {item.nv ? `NV ${item.nv}` : 'Sin NV'}
        </span>
        {item.fecha ? <span style={{ fontSize: 10, opacity: 0.7 }}>{formatDMY(item.fecha)}</span> : null}
      </div>
      <div style={{ fontSize: 12, opacity: 0.85 }}>{item.nombre_cliente || item.descripcion || '—'}</div>
      {item.tipo === 'solicitud' ? <div style={{ fontSize: 11, opacity: 0.65 }}>{item.descripcion}</div> : null}
    </div>
  );
}

// Chip de solo lectura para un portón que Logística ya tiene planificado esa
// semana (despacho o instalación) - "sombra", no se puede arrastrar ni tocar.
function LogisticaSombraChip({ item }) {
  return (
    <div
      style={{
        border: '1px dashed var(--border)', borderRadius: 8, padding: '6px 8px',
        background: 'var(--surface-muted, #f9fafb)', opacity: 0.85,
        display: 'flex', flexDirection: 'column', gap: 2,
      }}
      title={item.direccion?.trim() || ''}
    >
      <div style={{ fontWeight: 800, fontSize: 11 }}>
        🔒 {item.tipo === 'despacho' ? '📦' : '🔧'} NV {item.nv} <span style={{ fontWeight: 400, opacity: 0.7 }}>({item.tipo === 'despacho' ? 'despacho' : 'instalación'})</span>
      </div>
      <div style={{ fontSize: 11, opacity: 0.8 }}>{item.nombre?.trim() || item.direccion?.trim() || '—'}</div>
    </div>
  );
}

function WeekColumn({ weekLabel, items, sombraItems, canEdit, saving, onDropItem, onDragStartChip, onDragEndChip, isCurrent, colRef, searchNeedle }) {
  const [over, setOver] = useState(false);
  return (
    <div
      ref={colRef}
      onDragOver={(e) => { if (!canEdit) return; e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { if (!canEdit) return; e.preventDefault(); setOver(false); onDropItem(weekLabel, e); }}
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
        <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{items.length} item{items.length === 1 ? '' : 's'}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 40, flex: '1 1 auto', overflowY: 'auto' }}>
        {items.map((item) => (
          <ItemChip
            key={item.id} item={item} draggable={canEdit} busy={saving.has(item.id)}
            highlight={!!searchNeedle && matchesSearch(item, searchNeedle)}
            onDragStart={(e) => onDragStartChip(e, item)} onDragEnd={onDragEndChip}
          />
        ))}
        {sombraItems && sombraItems.length > 0 ? (
          <>
            <div style={{ fontSize: 10, fontWeight: 800, opacity: 0.6, marginTop: 4, borderTop: '1px dashed var(--border)', paddingTop: 6 }}>
              Logística ({sombraItems.length})
            </div>
            {sombraItems.map((it, i) => <LogisticaSombraChip key={`${it.porton_id}-${it.tipo}-${i}`} item={it} />)}
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function ServicioTecnicoFechasPage() {
  const nav = useNavigate();
  useEffect(() => { if (!getAdminToken()) nav('/admin/login', { replace: true }); }, [nav]);
  const canEdit = true; // un solo scope (servicio_tecnico:admin) para todo el módulo

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const [showIaMapa, setShowIaMapa] = useState(false);

  // "Sombra" de Logística: apagado por defecto, el usuario lo prende para ver
  // (solo lectura) lo que Logística ya tiene planificado en cada semana.
  const [showSombra, setShowSombra] = useState(false);
  const [sombraItems, setSombraItems] = useState([]);
  const [sombraLoading, setSombraLoading] = useState(false);
  const [sombraErr, setSombraErr] = useState('');

  const load = useCallback(async () => {
    setErr('');
    setLoading(true);
    try {
      const data = await fetchStFechasItems();
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const loadSombra = useCallback(async () => {
    setSombraErr('');
    setSombraLoading(true);
    try {
      const data = await fetchStLogisticaSombraFechas();
      setSombraItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      setSombraErr(e?.response?.data?.error || e.message);
    } finally {
      setSombraLoading(false);
    }
  }, []);
  useEffect(() => {
    if (showSombra) loadSombra();
    else { setSombraItems([]); setSombraErr(''); }
  }, [showSombra, loadSombra]);

  const sombraByWeek = useMemo(() => {
    const map = new Map();
    for (const it of sombraItems) {
      if (!it.semana) continue;
      if (!map.has(it.semana)) map.set(it.semana, []);
      map.get(it.semana).push(it);
    }
    return map;
  }, [sombraItems]);

  const pool = useMemo(() => items.filter((it) => !it.fecha), [items]);
  const searchNeedle = search.trim().toLowerCase();
  const poolFiltered = useMemo(() => pool.filter((it) => matchesSearch(it, searchNeedle)), [pool, searchNeedle]);

  const itemsByWeek = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      if (!it.fecha) continue;
      const wk = isoWeekLabelFromDate(it.fecha);
      if (!wk) continue;
      if (!map.has(wk)) map.set(wk, []);
      map.get(wk).push(it);
    }
    return map;
  }, [items]);

  const currentWeek = useMemo(() => isoWeekLabelFromDate(todayISO10()), []);
  const weeks = useMemo(() => {
    const base = buildWeekRange(4, 20);
    const set = new Set(base);
    for (const wk of itemsByWeek.keys()) set.add(wk);
    if (showSombra) for (const wk of sombraByWeek.keys()) set.add(wk);
    return Array.from(set).sort();
  }, [itemsByWeek, showSombra, sombraByWeek]);
  const visibleWeeks = useMemo(() => {
    if (!searchNeedle) return weeks;
    return weeks.filter((wk) => (itemsByWeek.get(wk) || []).some((it) => matchesSearch(it, searchNeedle)));
  }, [weeks, itemsByWeek, searchNeedle]);

  const colRefs = useRef({});
  const scrollToToday = () => colRefs.current[currentWeek]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  const didInitialScrollRef = useRef(false);
  useEffect(() => {
    if (loading || didInitialScrollRef.current) return;
    didInitialScrollRef.current = true;
    const id = requestAnimationFrame(() => colRefs.current[currentWeek]?.scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' }));
    return () => cancelAnimationFrame(id);
  }, [loading, currentWeek]);

  const patchItem = useCallback(async (item, fecha) => {
    setSaving((prev) => new Set(prev).add(item.id));
    setErr('');
    try {
      await patchStFechaItem(item.tipo, item.tipo === 'solicitud' ? item.solicitud_id : item.quote_id, fecha);
      await load();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setSaving((prev) => { const n = new Set(prev); n.delete(item.id); return n; });
    }
  }, [load]);

  const onDragStartChip = (e, item) => {
    e.dataTransfer.setData(DND_MIME, JSON.stringify({ id: item.id }));
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragEndChip = () => {};

  const onDropToWeek = useCallback((weekLabel, e) => {
    const raw = e.dataTransfer.getData(DND_MIME);
    if (!raw) return;
    let payload;
    try { payload = JSON.parse(raw); } catch { return; }
    const item = items.find((it) => it.id === payload.id);
    if (!item) return;
    if (item.fecha && isoWeekLabelFromDate(item.fecha) === weekLabel) return;
    const { start } = isoWeekStartEndFromLabel(weekLabel);
    patchItem(item, start);
  }, [items, patchItem]);

  const [poolOver, setPoolOver] = useState(false);
  const onDropToPool = useCallback((e) => {
    const raw = e.dataTransfer.getData(DND_MIME);
    if (!raw) return;
    let payload;
    try { payload = JSON.parse(raw); } catch { return; }
    const item = items.find((it) => it.id === payload.id);
    if (!item || !item.fecha) return;
    patchItem(item, null);
  }, [items, patchItem]);

  const logout = () => { clearAdminToken(); nav('/admin/login', { replace: true }); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 74px)', padding: '10px 16px 16px' }}>
      <div className="header-row" style={{ alignItems: 'center', flex: '0 0 auto' }}>
        <h2 className="h1" style={{ fontSize: 16, padding: '6px 14px' }}>Planificación de Fechas · Servicio Técnico</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, opacity: 0.7 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: TIPO_COLOR.solicitud.border, marginRight: 4 }} />
            🔧 solicitud
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: TIPO_COLOR.medicion.border, margin: '0 4px 0 10px' }} />
            📏 medición
          </span>
          <Link className="btn" to="/admin/servicio-tecnico-solicitudes">Solicitudes</Link>
          <Link className="btn" to="/admin/servicio-tecnico-viajes">Viajes de Técnica</Link>
          <button className="btn btn--brand" onClick={() => setShowIaMapa(true)}>🤖 Generar viaje con IA</button>
          <button className="btn" onClick={load} disabled={loading}>Recargar</button>
          <button className="btn" onClick={logout}>Salir</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap', flex: '0 0 auto' }}>
        <button className="btn" onClick={scrollToToday}>Ir a hoy</button>
        <span style={{ fontSize: 11, opacity: 0.65 }}>Arrastrá un item para asignarle/cambiarle la semana.</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', marginLeft: 'auto' }}>
          <input type="checkbox" checked={showSombra} onChange={(e) => setShowSombra(e.target.checked)} />
          👁️ Ver plan de Logística (solo lectura){sombraLoading ? '…' : ''}
        </label>
      </div>

      {err ? <div style={{ color: 'crimson', fontWeight: 800, fontSize: 12, marginTop: 8, flex: '0 0 auto' }}>{err}</div> : null}
      {sombraErr ? <div style={{ color: 'crimson', fontWeight: 800, fontSize: 12, marginTop: 4, flex: '0 0 auto' }}>Plan de Logística: {sombraErr}</div> : null}

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
              border: `1px solid ${poolOver ? 'var(--brand)' : 'var(--border)'}`, borderRadius: 12, padding: 10,
              background: poolOver ? 'var(--brand-100)' : 'var(--surface-muted, #f9fafb)', overflowY: 'auto',
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 13, flex: '0 0 auto' }}>Sin fecha ({poolFiltered.length})</div>
            <input
              className="pp-input" placeholder="Buscar NV, cliente… (también filtra las semanas)"
              value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: '0 0 auto' }}
            />
            {poolFiltered.length === 0 ? (
              <div style={{ fontSize: 11, opacity: 0.6 }}>Nada por asignar.</div>
            ) : (
              poolFiltered.map((item) => (
                <ItemChip
                  key={item.id} item={item} draggable={canEdit} busy={saving.has(item.id)}
                  onDragStart={(e) => onDragStartChip(e, item)} onDragEnd={onDragEndChip}
                />
              ))
            )}
          </div>

          <div style={{ flex: '1 1 auto', display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, minHeight: 0 }}>
            {searchNeedle && visibleWeeks.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.65, padding: 10 }}>Ninguna semana tiene un item que matchee "{search.trim()}".</div>
            ) : (
              visibleWeeks.map((wk) => (
                <WeekColumn
                  key={wk} weekLabel={wk} items={itemsByWeek.get(wk) || []}
                  sombraItems={showSombra ? (sombraByWeek.get(wk) || []) : null}
                  canEdit={canEdit} saving={saving}
                  onDropItem={onDropToWeek} onDragStartChip={onDragStartChip} onDragEndChip={onDragEndChip}
                  isCurrent={wk === currentWeek} colRef={(el) => { colRefs.current[wk] = el; }} searchNeedle={searchNeedle}
                />
              ))
            )}
          </div>
        </div>
      )}

      <ServicioTecnicoIaMapaModal open={showIaMapa} onClose={() => setShowIaMapa(false)} onCreated={load} />
    </div>
  );
}

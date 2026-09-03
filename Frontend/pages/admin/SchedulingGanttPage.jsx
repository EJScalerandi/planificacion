// pages/admin/SchedulingGanttPage.jsx
//
// Gantt interactivo de la regresión de flota (Fase 2b/3): dos vistas sobre
// exactamente los mismos datos de /admin/scheduling/regression/preview —
// por portón (con sus etapas como sub-filas) y por recurso/máquina (con los
// tramos de los portones que pasan por cada una). Cada barra se dibuja en
// dos mitades: arriba lo teórico (latest_start/latest_finish calculado),
// abajo lo real (porton_etapas_tiempos.inicio/fin, si ya se registró).
//
// "Mover un portón" (Flujo Logística únicamente — Presupuesto es de solo
// lectura): arrastrar la barra teórica agregada de un portón le cambia
// fecha_despacho_logistica al día soltado, y eso dispara un recálculo
// completo de toda la flota — el mismo mecanismo ya construido y probado en
// Fase 2b/2c, no hay lógica de backend nueva más que exponer real_start/
// real_finish por etapa (ver regressionEngine.js).
//
// Modo sombra: esta pantalla no la ve el tablero operador ni cambia nada
// fuera de fecha_despacho_logistica de los portones que el usuario arrastre.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { clearAdminToken, getAdminToken, getSchedulingRegressionPreview, setFechaDespachoLogistica } from '../../src/api';

const AR_TZ = 'America/Argentina/Buenos_Aires';
const AR_OFFSET_MINUTES = -180; // UTC-3 fijo, sin horario de verano — mismo criterio que lib/scheduling/calendar.js
const DAY_MS = 86400000;
const PX_PER_DAY = 52;
const STAGE_ROW_H = 30;
const PORTON_ROW_H = 40;

function pad2(n) { return String(n).padStart(2, '0'); }

// Instante -> {dateKey 'YYYY-MM-DD', weekday} en hora de Argentina.
function toArDateKey(date) {
  const local = new Date(date.getTime() + AR_OFFSET_MINUTES * 60000);
  return `${local.getUTCFullYear()}-${pad2(local.getUTCMonth() + 1)}-${pad2(local.getUTCDate())}`;
}
function addDaysToDateKey(dateKey, delta) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}
// 'YYYY-MM-DD' (medianoche AR) -> instante absoluto.
function arMidnightInstant(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - AR_OFFSET_MINUTES * 60000);
}
function fmtArDateTime(d) {
  if (!d) return '—';
  try {
    return new Intl.DateTimeFormat('es-AR', { timeZone: AR_TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(d));
  } catch { return String(d); }
}
function fmtArDateShort(dateKey) {
  const d = arMidnightInstant(dateKey);
  return new Intl.DateTimeFormat('es-AR', { timeZone: AR_TZ, day: '2-digit', month: '2-digit' }).format(d);
}
function weekdayShort(dateKey) {
  const d = arMidnightInstant(dateKey);
  return new Intl.DateTimeFormat('es-AR', { timeZone: AR_TZ, weekday: 'short' }).format(d).replace('.', '');
}

// Paleta determinística por resource_key — no depende de cuántos recursos
// haya cargados, así que un recurso nuevo (Láser, etc.) recibe color estable.
const RESOURCE_PALETTE = ['#2563eb', '#7c3aed', '#0891b2', '#c2410c', '#be185d', '#4338ca', '#65a30d', '#92400e', '#0f766e', '#a21caf'];
function colorForResource(key) {
  let hash = 0;
  const s = String(key || '');
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return RESOURCE_PALETTE[hash % RESOURCE_PALETTE.length];
}

export default function SchedulingGanttPage() {
  const nav = useNavigate();

  useEffect(() => {
    const t = getAdminToken();
    if (!t) nav('/admin/login', { replace: true });
  }, [nav]);

  const [flow, setFlow] = useState('logistica'); // 'logistica' (editable) | 'presupuesto' (solo lectura)
  const [viewMode, setViewMode] = useState('porton'); // 'porton' | 'recurso'
  const [limit, setLimit] = useState(20);
  const [regression, setRegression] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const [savingIds, setSavingIds] = useState(() => new Set());
  const [drag, setDrag] = useState(null); // {portonId, startX, deltaDays, deadlineKey}

  const load = async () => {
    setErr('');
    setLoading(true);
    try {
      const data = await getSchedulingRegressionPreview('portones', { limit, mode: 'fleet', flow });
      setRegression(data);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, limit]);

  const portones = useMemo(() => regression?.portones || [], [regression]);

  // ---- Filas por portón: agrega min/max teórico y real sobre sus etapas ----
  const portonRows = useMemo(() => {
    return portones
      .map((p) => {
        if (!p.ok || !p.stages) return { id: p.id, nv: p.nv, sistema: p.sistema, warning: p.warning, error: p.error, stages: [] };
        const stages = Object.values(p.stages).sort((a, b) => new Date(a.latest_start) - new Date(b.latest_start));
        const theoStarts = stages.map((s) => s.latest_start && new Date(s.latest_start)).filter(Boolean);
        const theoEnds = stages.map((s) => s.latest_finish && new Date(s.latest_finish)).filter(Boolean);
        const realStarts = stages.map((s) => s.real_start && new Date(s.real_start)).filter(Boolean);
        const realEnds = stages.map((s) => s.real_finish && new Date(s.real_finish)).filter(Boolean);
        return {
          id: p.id, nv: p.nv, sistema: p.sistema, warning: p.warning, error: p.error, stages,
          theoStart: theoStarts.length ? new Date(Math.min(...theoStarts.map((d) => d.getTime()))) : null,
          theoEnd: theoEnds.length ? new Date(Math.max(...theoEnds.map((d) => d.getTime()))) : null,
          realStart: realStarts.length ? new Date(Math.min(...realStarts.map((d) => d.getTime()))) : null,
          realEnd: realEnds.length ? new Date(Math.max(...realEnds.map((d) => d.getTime()))) : null,
        };
      })
      .sort((a, b) => (a.theoEnd && b.theoEnd ? a.theoEnd - b.theoEnd : a.theoEnd ? -1 : 1));
  }, [portones]);

  const portonRowsWithDates = portonRows.filter((r) => r.theoStart && r.theoEnd);
  const portonRowsWithoutDates = portonRows.filter((r) => !(r.theoStart && r.theoEnd));

  // ---- Filas por recurso: aplana (portón × etapa) agrupado por resource_key,
  // con empaquetado en carriles (greedy interval scheduling) para que dos
  // tramos que se superponen en el tiempo no queden dibujados uno encima del
  // otro — es justo el caso que esta vista existe para mostrar (contención).
  const resourceRows = useMemo(() => {
    const byResource = new Map();
    for (const p of portones) {
      if (!p.ok || !p.stages) continue;
      for (const s of Object.values(p.stages)) {
        if (!s.latest_start || !s.latest_finish) continue;
        const key = s.resource_key || s.stage_key;
        if (!byResource.has(key)) byResource.set(key, []);
        byResource.get(key).push({ ...s, portonId: p.id, nv: p.nv, sistema: p.sistema });
      }
    }
    const out = [];
    for (const [key, segs] of byResource.entries()) {
      segs.sort((a, b) => new Date(a.latest_start) - new Date(b.latest_start));
      const laneEnds = []; // último latest_finish (ms) asignado a cada carril
      for (const seg of segs) {
        const start = new Date(seg.latest_start).getTime();
        const end = new Date(seg.latest_finish).getTime();
        let lane = laneEnds.findIndex((e) => e <= start);
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(end); } else { laneEnds[lane] = end; }
        seg.lane = lane;
      }
      out.push([key, segs, laneEnds.length || 1]);
    }
    return out.sort((a, b) => a[0].localeCompare(b[0]));
  }, [portones]);

  // ---- Rango temporal global (con margen) para el eje ----
  const timeRange = useMemo(() => {
    const all = [];
    for (const r of portonRowsWithDates) {
      all.push(r.theoStart, r.theoEnd);
      if (r.realStart) all.push(r.realStart);
      if (r.realEnd) all.push(r.realEnd);
    }
    if (!all.length) {
      const now = new Date();
      return { min: now, max: new Date(now.getTime() + 7 * DAY_MS) };
    }
    const minKey = toArDateKey(new Date(Math.min(...all.map((d) => d.getTime()))));
    const maxKey = toArDateKey(new Date(Math.max(...all.map((d) => d.getTime()))));
    return { min: arMidnightInstant(addDaysToDateKey(minKey, -1)), max: arMidnightInstant(addDaysToDateKey(maxKey, 2)) };
  }, [portonRowsWithDates]);

  const totalDays = Math.max(1, Math.ceil((timeRange.max - timeRange.min) / DAY_MS));
  const timelineWidth = totalDays * PX_PER_DAY;
  const xForDate = (d) => ((d.getTime() - timeRange.min.getTime()) / DAY_MS) * PX_PER_DAY;

  const dayColumns = useMemo(() => {
    const cols = [];
    let key = toArDateKey(timeRange.min);
    const endKey = toArDateKey(timeRange.max);
    let guard = 0;
    while (key <= endKey && guard < 400) {
      cols.push(key);
      key = addDaysToDateKey(key, 1);
      guard += 1;
    }
    return cols;
  }, [timeRange]);

  const toggleExpanded = (id) => setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ---- Drag: solo la barra teórica agregada de un portón, solo en flujo logística ----
  const dragRef = useRef(null);
  const onBarMouseDown = (row) => (e) => {
    if (flow !== 'logistica' || savingIds.has(row.id)) return;
    e.preventDefault();
    const state = { portonId: row.id, startX: e.clientX, deltaDays: 0, deadlineKey: toArDateKey(row.theoEnd) };
    dragRef.current = state;
    setDrag({ ...state });

    const onMove = (ev) => {
      const deltaPx = ev.clientX - state.startX;
      const deltaDays = Math.round(deltaPx / PX_PER_DAY);
      dragRef.current = { ...dragRef.current, deltaDays };
      setDrag({ ...dragRef.current });
    };
    const onUp = async () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const final = dragRef.current;
      setDrag(null);
      dragRef.current = null;
      if (!final || final.deltaDays === 0) return;
      const newDateKey = addDaysToDateKey(final.deadlineKey, final.deltaDays);
      setSavingIds((prev) => new Set(prev).add(final.portonId));
      setErr('');
      try {
        await setFechaDespachoLogistica(final.portonId, newDateKey);
        await load();
      } catch (ex) {
        setErr(ex?.response?.data?.error || ex.message);
      } finally {
        setSavingIds((prev) => { const n = new Set(prev); n.delete(final.portonId); return n; });
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const logout = () => { clearAdminToken(); nav('/admin/login', { replace: true }); };

  return (
    <div className="container" style={{ maxWidth: 1500 }}>
      <div className="header-row" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h2 className="h1">Gantt de Producción (Beta)</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn" to="/admin/scheduling">Reglas de Tiempo</Link>
          <Link className="btn" to="/admin">Volver</Link>
          <Link className="btn" to="/">Inicio</Link>
          <button className="btn" onClick={load}>Refrescar</button>
          <button className="btn" onClick={logout}>Salir</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
        <select className="btn" value={viewMode} onChange={(e) => setViewMode(e.target.value)}>
          <option value="porton">Vista por portón (etapas como sub-filas)</option>
          <option value="recurso">Vista por recurso/máquina</option>
        </select>
        <select className="btn" value={flow} onChange={(e) => setFlow(e.target.value)} title="Presupuesto es de solo lectura — no se puede arrastrar">
          <option value="logistica">Flujo Logística (editable, arrastrable)</option>
          <option value="presupuesto">Flujo Presupuesto (solo lectura)</option>
        </select>
        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          Portones:
          <input className="btn" type="number" min="1" max="200" style={{ width: 70 }} value={limit} onChange={(e) => setLimit(Number(e.target.value) || 20)} />
        </label>
        {loading && <span style={{ fontSize: 12, opacity: 0.7 }}>Calculando…</span>}
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 10, fontSize: 12, opacity: 0.8, flexWrap: 'wrap' }}>
        <LegendSwatch style={{ border: '2px solid #6b7280', background: 'transparent' }} label="Teórico (calculado)" />
        <LegendSwatch style={{ background: '#6b7280' }} label="Real (registrado)" />
        <span>⏳ etapa esperó cupo compartido</span>
        {flow === 'logistica' && <span>Arrastrá la barra teórica de un portón para cambiar su fecha de despacho.</span>}
      </div>

      {err && <div style={{ color: 'crimson', fontWeight: 700, marginTop: 10 }}>{err}</div>}
      {regression?.warning && <div style={{ opacity: 0.7, marginTop: 8 }}>{regression.warning}</div>}

      {!loading && !portonRowsWithDates.length && !err && (
        <div style={{ marginTop: 16, fontSize: 13, opacity: 0.7 }}>
          Ningún portón del lote tiene fecha calculable todavía para el flujo {flow === 'logistica' ? 'Logística' : 'Presupuesto'}.
        </div>
      )}

      {!!portonRowsWithDates.length && (
        <div style={{ marginTop: 16, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'flex', minWidth: 260 + timelineWidth }}>
              {/* Columna de etiquetas, fija */}
              <div style={{ width: 260, flex: 'none', borderRight: '1px solid var(--border)' }}>
                <div style={{ height: 34, borderBottom: '1px solid var(--border)', background: 'var(--surface-muted, #f3f4f6)' }} />
                {viewMode === 'porton'
                  ? portonRowsWithDates.map((row) => (
                      <PortonLabel key={row.id} row={row} expanded={expanded.has(row.id)} onToggle={() => toggleExpanded(row.id)} saving={savingIds.has(row.id)} />
                    ))
                  : resourceRows.map(([resourceKey, segs, laneCount]) => (
                      <ResourceLabel key={resourceKey} resourceKey={resourceKey} count={segs.length} height={STAGE_ROW_H * laneCount} />
                    ))}
              </div>

              {/* Timeline */}
              <div style={{ position: 'relative', width: timelineWidth }}>
                {/* Header de días */}
                <div style={{ height: 34, position: 'relative', borderBottom: '1px solid var(--border)', background: 'var(--surface-muted, #f3f4f6)' }}>
                  {dayColumns.map((key) => (
                    <div key={key} style={{ position: 'absolute', left: xForDate(arMidnightInstant(key)), width: PX_PER_DAY, top: 0, bottom: 0, borderLeft: '1px solid var(--border)', fontSize: 10.5, textAlign: 'center', paddingTop: 3, opacity: 0.75 }}>
                      <div style={{ fontWeight: 700 }}>{weekdayShort(key)}</div>
                      <div>{fmtArDateShort(key)}</div>
                    </div>
                  ))}
                </div>

                {/* Líneas de grilla de fondo, para todas las filas */}
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, pointerEvents: 'none' }}>
                  {dayColumns.map((key) => (
                    <div key={key} style={{ position: 'absolute', left: xForDate(arMidnightInstant(key)), top: 0, bottom: 0, borderLeft: '1px solid var(--border)', opacity: 0.5 }} />
                  ))}
                </div>

                {viewMode === 'porton'
                  ? portonRowsWithDates.map((row) => {
                      const isDragging = drag?.portonId === row.id;
                      const shiftPx = isDragging ? drag.deltaDays * PX_PER_DAY : 0;
                      return (
                        <div key={row.id}>
                          <div style={{ height: PORTON_ROW_H, position: 'relative', borderBottom: '1px solid var(--border)' }}>
                            <TwoHalfBar
                              left={xForDate(row.theoStart)} width={Math.max(4, xForDate(row.theoEnd) - xForDate(row.theoStart))}
                              realLeft={row.realStart ? xForDate(row.realStart) : null}
                              realWidth={row.realStart ? Math.max(4, xForDate(row.realEnd || new Date()) - xForDate(row.realStart)) : null}
                              color="#374151" rowHeight={PORTON_ROW_H}
                              draggable={flow === 'logistica' && !savingIds.has(row.id)}
                              onMouseDown={onBarMouseDown(row)}
                              transformPx={shiftPx}
                              title={`NV ${row.nv} — teórico ${fmtArDateTime(row.theoStart)} → ${fmtArDateTime(row.theoEnd)}`}
                            />
                            {isDragging && drag.deltaDays !== 0 && (
                              <div style={{ position: 'absolute', left: xForDate(row.theoEnd) + shiftPx + 6, top: 8, fontSize: 11, fontWeight: 700, color: 'var(--brand-700)' }}>
                                {drag.deltaDays > 0 ? '+' : ''}{drag.deltaDays}d
                              </div>
                            )}
                          </div>
                          {expanded.has(row.id) && row.stages.map((s) => (
                            <div key={s.stage_key} style={{ height: STAGE_ROW_H, position: 'relative', borderBottom: '1px dashed var(--border)' }}>
                              <TwoHalfBar
                                left={xForDate(new Date(s.latest_start))} width={Math.max(3, xForDate(new Date(s.latest_finish)) - xForDate(new Date(s.latest_start)))}
                                realLeft={s.real_start ? xForDate(new Date(s.real_start)) : null}
                                realWidth={s.real_start ? Math.max(3, xForDate(new Date(s.real_finish || Date.now())) - xForDate(new Date(s.real_start))) : null}
                                color={colorForResource(s.resource_key)} rowHeight={STAGE_ROW_H} small
                                title={`${s.stage_key} (${s.resource_key}) — teórico ${fmtArDateTime(s.latest_start)} → ${fmtArDateTime(s.latest_finish)}${s.real_start ? ` · real ${fmtArDateTime(s.real_start)} → ${s.real_finish ? fmtArDateTime(s.real_finish) : 'en curso'}` : ''}${s.resource_constrained ? ' · esperó cupo compartido' : ''}`}
                                constrained={s.resource_constrained}
                              />
                            </div>
                          ))}
                        </div>
                      );
                    })
                  : resourceRows.map(([resourceKey, segs, laneCount]) => (
                      <div key={resourceKey} style={{ height: STAGE_ROW_H * laneCount, position: 'relative', borderBottom: '1px solid var(--border)' }}>
                        {/* Un carril por superposición temporal — ver el empaquetado greedy en resourceRows */}
                        {segs.map((s) => (
                          <TwoHalfBar
                            key={`${s.portonId}-${s.stage_key}`}
                            left={xForDate(new Date(s.latest_start))} width={Math.max(3, xForDate(new Date(s.latest_finish)) - xForDate(new Date(s.latest_start)))}
                            realLeft={s.real_start ? xForDate(new Date(s.real_start)) : null}
                            realWidth={s.real_start ? Math.max(3, xForDate(new Date(s.real_finish || Date.now())) - xForDate(new Date(s.real_start))) : null}
                            color={colorForResource(resourceKey)} rowHeight={STAGE_ROW_H} laneOffset={s.lane * STAGE_ROW_H} small
                            title={`NV ${s.nv} · ${s.stage_key} — teórico ${fmtArDateTime(s.latest_start)} → ${fmtArDateTime(s.latest_finish)}${s.real_start ? ` · real ${fmtArDateTime(s.real_start)} → ${s.real_finish ? fmtArDateTime(s.real_finish) : 'en curso'}` : ''}${s.resource_constrained ? ' · esperó cupo compartido' : ''}`}
                            constrained={s.resource_constrained}
                            label={`NV${s.nv}`}
                          />
                        ))}
                      </div>
                    ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {!!portonRowsWithoutDates.length && (
        <details style={{ marginTop: 14 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
            Portones sin fecha calculable en este lote ({portonRowsWithoutDates.length})
          </summary>
          <ul style={{ fontSize: 12.5, opacity: 0.75, marginTop: 6 }}>
            {portonRowsWithoutDates.map((r) => (
              <li key={r.id}>NV {r.nv ?? r.id} — {r.warning || r.error || 'sin etapas resueltas'}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function LegendSwatch({ style, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 16, height: 10, borderRadius: 3, display: 'inline-block', ...style }} />
      {label}
    </span>
  );
}

function PortonLabel({ row, expanded, onToggle, saving }) {
  return (
    <div style={{ height: PORTON_ROW_H, display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', borderBottom: '1px solid var(--border)', fontSize: 12.5, fontWeight: 700 }}>
      <button type="button" onClick={onToggle} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, width: 16 }}>
        {expanded ? '▾' : '▸'}
      </button>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.sistema}>
        NV {row.nv ?? row.id}
      </span>
      {saving && <span style={{ fontSize: 10, opacity: 0.6, fontWeight: 400 }}>guardando…</span>}
    </div>
  );
}

function ResourceLabel({ resourceKey, count, height }) {
  return (
    <div style={{ height, display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', borderBottom: '1px solid var(--border)', fontSize: 12.5, fontWeight: 700 }}>
      <span style={{ width: 9, height: 9, borderRadius: 3, background: colorForResource(resourceKey), flex: 'none' }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resourceKey}</span>
      <span style={{ fontSize: 10.5, opacity: 0.6, fontWeight: 400 }}>({count})</span>
    </div>
  );
}

// Barra de dos mitades: arriba teórico (contorno), abajo real (relleno) —
// mismo componente para fila de portón, fila de etapa y fila de recurso.
function TwoHalfBar({ left, width, realLeft, realWidth, color, rowHeight, small, draggable, onMouseDown, transformPx = 0, title, constrained, label, laneOffset = 0 }) {
  const halfH = small ? rowHeight - 8 : (rowHeight - 10) / 2;
  const top1 = 4 + laneOffset;
  const top2 = (small ? 4 : halfH + 6) + laneOffset;
  return (
    <>
      <div
        title={title}
        onMouseDown={onMouseDown}
        style={{
          position: 'absolute', left, width, top: top1, height: small ? halfH : halfH,
          border: `2px solid ${color}`, borderRadius: 5, background: constrained ? 'rgba(180,83,9,0.12)' : 'transparent',
          cursor: draggable ? 'grab' : 'default', transform: `translateX(${transformPx}px)`,
          display: 'flex', alignItems: 'center', paddingLeft: 4, boxSizing: 'border-box', overflow: 'hidden',
        }}
      >
        {constrained && <span style={{ fontSize: 10 }}>⏳</span>}
        {label && width > 34 && <span style={{ fontSize: 9.5, fontWeight: 700, color, whiteSpace: 'nowrap', marginLeft: 2 }}>{label}</span>}
      </div>
      {!small && realLeft != null && (
        <div title={title} style={{ position: 'absolute', left: realLeft, width: realWidth, top: top2, height: halfH, background: color, opacity: 0.85, borderRadius: 5 }} />
      )}
      {small && realLeft != null && (
        <div title={title} style={{ position: 'absolute', left: realLeft, width: realWidth, top: top1 + halfH + 1, height: 3, background: color, opacity: 0.9, borderRadius: 2 }} />
      )}
    </>
  );
}

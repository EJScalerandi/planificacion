import React, { useEffect, useMemo, useState } from 'react';

function apiBase() {
  const v = import.meta.env.VITE_API_URL || '';
  return String(v || '').replace(/\/$/, '');
}

function toISODate10(v) {
  if (!v) return null;
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : null;
}

function fmtAR(iso10) {
  if (!iso10) return '';
  const [y, m, d] = iso10.split('-');
  return `${d}/${m}/${y}`;
}

function monthKey(iso10) {
  return iso10 ? iso10.slice(0, 7) : '';
}

function monthLabel(yyyyMm) {
  if (!yyyyMm) return '';
  const [y, m] = yyyyMm.split('-');
  return `${m}/${y}`;
}

const STAGE_DEFS = [
  { key: 'diseno', label: 'Diseño' },
  { key: 'laser', label: 'Láser' },

  { key: 'guillotina', label: 'Guillotina' },
  { key: 'corte_revest', label: 'Corte Revest.' },

  { key: 'plegadora', label: 'Plegadora' },
  { key: 'plegado_revest', label: 'Plegado Revest.' },

  { key: 'armado_piernas', label: 'Arm. Piernas' }, // ✅ Prefabricados real
  { key: 'armado_hojas', label: 'Arm. Hojas' },
  { key: 'armado_marco_piernas', label: 'Arm. Marco/Piernas' },
  { key: 'armado_primario', label: 'Arm. Primario' },

  { key: 'revestimiento', label: 'Revestimiento' },
  { key: 'pintura', label: 'Pintura' },
  { key: 'inyeccion', label: 'Inyección' },

  { key: 'armado_final', label: 'Arm. Final' },
  { key: 'despacho', label: 'Despacho' },
];

const LS_VISIBLE_COLS_KEY = 'portones_stats_visible_cols_v2';

// ✅ Total en planta = base + armado_piernas - despacho
const PLANT_IN_KEY = 'plegadora';
const PLANT_OUT_KEY = 'despacho';

function newCounts() {
  const c = {};
  for (const s of STAGE_DEFS) c[s.key] = 0;
  return c;
}

function loadVisibleColsDefault() {
  return STAGE_DEFS.map((s) => s.key);
}

function loadVisibleCols() {
  try {
    const raw = localStorage.getItem(LS_VISIBLE_COLS_KEY);
    if (!raw) return loadVisibleColsDefault();

    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return loadVisibleColsDefault();

    const allKeys = new Set(STAGE_DEFS.map((s) => s.key));
    const cleaned = arr.filter((k) => allKeys.has(k));
    return cleaned.length ? cleaned : loadVisibleColsDefault();
  } catch {
    return loadVisibleColsDefault();
  }
}

function saveVisibleCols(keys) {
  try {
    localStorage.setItem(LS_VISIBLE_COLS_KEY, JSON.stringify(keys));
  } catch {}
}

export default function PortonesStatsPage() {
  const [portones, setPortones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [view, setView] = useState('daily+monthly'); // daily | monthly | daily+monthly

  // Columnas visibles
  const [visibleCols, setVisibleCols] = useState(() => loadVisibleCols());
  const [colsOpen, setColsOpen] = useState(false);

  const visibleStages = useMemo(() => {
    const set = new Set(visibleCols);
    return STAGE_DEFS.filter((s) => set.has(s.key));
  }, [visibleCols]);

  // Base “Total en planta”
  const [plantaBase, setPlantaBase] = useState(null); // {date, qty}
  const [plantaLoading, setPlantaLoading] = useState(false);
  const [plantaErr, setPlantaErr] = useState('');
  const [plantaOk, setPlantaOk] = useState('');

  // Inputs (solo fecha y cantidad)
  const [newPlantaDate, setNewPlantaDate] = useState('');
  const [newPlantaQty, setNewPlantaQty] = useState('');

  // -------------------------
  // Load portones
  // -------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadPortones() {
      try {
        setLoading(true);
        setErr('');

        const base = apiBase();
        const url = `${base}/portones`;

        const r = await fetch(url);
        if (!r.ok) {
          const t = await r.text().catch(() => '');
          throw new Error(`Error ${r.status} leyendo /portones. ${t}`);
        }

        const data = await r.json();
        if (cancelled) return;
        setPortones(Array.isArray(data) ? data : []);
      } catch (e) {
        if (cancelled) return;
        setErr(e?.message || 'Error cargando datos');
        setPortones([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPortones();
    return () => { cancelled = true; };
  }, []);

  // -------------------------
  // Load planta base desde backend
  // GET /planta/base -> { date: "YYYY-MM-DD", qty: 123 } o {date:null, qty:null}
  // -------------------------
  const loadPlantaBase = async () => {
    try {
      setPlantaLoading(true);
      setPlantaErr('');
      setPlantaOk('');

      const base = apiBase();
      const r = await fetch(`${base}/planta/base`, { cache: 'no-store' });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        throw new Error(`Error ${r.status} leyendo /planta/base. ${t}`);
      }

      const data = await r.json();
      const dRaw = data?.date ?? null;
      const qRaw = data?.qty ?? null;

      // ✅ tabla vacía: no es error
      if (dRaw == null || qRaw == null) {
        setPlantaBase(null);
        return;
      }

      const d = String(dRaw).trim();
      const q = Number(qRaw);

      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(q)) {
        throw new Error('Respuesta inválida de /planta/base (espera {date, qty}).');
      }

      setPlantaBase({ date: d, qty: q });
    } catch (e) {
      setPlantaBase(null);
      setPlantaErr(e?.message || 'No se pudo cargar la base de planta.');
    } finally {
      setPlantaLoading(false);
    }
  };

  useEffect(() => {
    loadPlantaBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------
  // Agregado diario real
  // -------------------------
  const dailyRows = useMemo(() => {
    const map = new Map();

    for (const p of portones || []) {
      for (const s of STAGE_DEFS) {
        const finField = `${s.key}_fin`;
        const iso10 = toISODate10(p?.[finField]);
        if (!iso10) continue;

        if (!map.has(iso10)) map.set(iso10, { date: iso10, counts: newCounts() });
        map.get(iso10).counts[s.key] += 1;
      }
    }

    let arr = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    if (from) arr = arr.filter((r) => r.date >= from);
    if (to) arr = arr.filter((r) => r.date <= to);
    return arr;
  }, [portones, from, to]);

  // -------------------------
  // Agregado mensual
  // -------------------------
  const monthlyRows = useMemo(() => {
    const map = new Map();
    for (const r of dailyRows) {
      const mm = monthKey(r.date);
      if (!mm) continue;
      if (!map.has(mm)) map.set(mm, newCounts());
      const acc = map.get(mm);
      for (const s of STAGE_DEFS) acc[s.key] += Number(r.counts?.[s.key] || 0);
    }
    return Array.from(map.entries())
      .map(([month, counts]) => ({ month, counts }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [dailyRows]);

  // -------------------------
  // Total en planta (serie)
  // base + (armado_piernas) - (despacho)
  // -------------------------
  const plantSeries = useMemo(() => {
    const byDate = new Map();
    const byMonthEnd = new Map();

    const baseDate = plantaBase?.date || null;
    const baseQty = Number(plantaBase?.qty ?? NaN);
    if (!baseDate || !Number.isFinite(baseQty)) {
      return { byDate, byMonthEnd, baseDate: null, baseQty: null };
    }

    let running = baseQty;
    let currentMonth = '';

    for (const r of dailyRows) {
      const d = r.date;
      if (d < baseDate) continue;

      const mm = monthKey(d);
      if (!currentMonth) currentMonth = mm;

      if (mm !== currentMonth) {
        byMonthEnd.set(currentMonth, running);
        currentMonth = mm;
      }

      const inQty = Number(r.counts?.[PLANT_IN_KEY] || 0);
      const outQty = Number(r.counts?.[PLANT_OUT_KEY] || 0);
      running += (inQty - outQty);

      byDate.set(d, running);
    }

    if (currentMonth) byMonthEnd.set(currentMonth, running);

    return { byDate, byMonthEnd, baseDate, baseQty };
  }, [dailyRows, plantaBase]);

  const totalsAll = useMemo(() => {
    const t = newCounts();
    for (const r of dailyRows) {
      for (const s of STAGE_DEFS) t[s.key] += Number(r.counts?.[s.key] || 0);
    }
    return t;
  }, [dailyRows]);

  const dailyPlusMonthlyRows = useMemo(() => {
    const totalsByMonth = new Map(monthlyRows.map((x) => [x.month, x]));
    const out = [];

    let current = '';
    for (const row of dailyRows) {
      const mm = monthKey(row.date);
      if (!current) current = mm;

      if (mm !== current) {
        const tot = totalsByMonth.get(current);
        if (tot) out.push({ __type: 'month', ...tot });
        current = mm;
      }
      out.push({ __type: 'day', ...row });
    }

    if (current) {
      const tot = totalsByMonth.get(current);
      if (tot) out.push({ __type: 'month', ...tot });
    }

    return out;
  }, [dailyRows, monthlyRows]);

  const setAllCols = () => {
    const next = loadVisibleColsDefault();
    setVisibleCols(next);
    saveVisibleCols(next);
  };

  // -------------------------
  // POST planta base
  // POST /planta/base { date, qty }
  // -------------------------
  const savePlantaBase = async () => {
    try {
      setPlantaErr('');
      setPlantaOk('');

      const d = String(newPlantaDate || '').trim();
      const qStr = String(newPlantaQty || '').trim();

      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        setPlantaErr('Fecha inválida. Usá YYYY-MM-DD.');
        return;
      }
      if (!/^-?\d+$/.test(qStr)) {
        setPlantaErr('Cantidad inválida. Usá un entero (ej: 120).');
        return;
      }

      const qty = Number(qStr);
      const base = apiBase();

      setPlantaLoading(true);

      const r = await fetch(`${base}/planta/base`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: d, qty }),
      });

      if (!r.ok) {
        const t = await r.text().catch(() => '');
        throw new Error(`Error ${r.status} guardando base planta. ${t}`);
      }

      const data = await r.json();
      const rd = String(data?.date || d);
      const rq = Number(data?.qty ?? qty);

      setPlantaBase({ date: rd, qty: rq });
      setNewPlantaDate('');
      setNewPlantaQty('');
      setPlantaOk(`Guardado: ${rq} desde ${fmtAR(rd)}.`);
    } catch (e) {
      setPlantaErr(e?.message || 'No se pudo guardar la base.');
    } finally {
      setPlantaLoading(false);
    }
  };

  const exportCsv = () => {
    const header = ['Fecha', 'Total en planta', ...visibleStages.map((s) => s.label)];
    const lines = [header.join(';')];

    for (const r of dailyRows) {
      const plant = plantSeries.byDate.get(r.date);
      const showPlant = plantSeries.baseDate && r.date >= plantSeries.baseDate;
      const row = [
        fmtAR(r.date),
        showPlant ? String(plant ?? '') : '',
        ...visibleStages.map((s) => String(r.counts?.[s.key] || 0)),
      ];
      lines.push(row.join(';'));
    }

    const csv = '\uFEFF' + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'portones-finalizados-por-sector.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="screen page">
      <style>{`
        .ps-wrap{
          border:1px solid #e5e7eb;
          border-radius:12px;
          background:var(--surface);
          box-shadow: 0 10px 26px rgba(0,0,0,.06);
        }

        /* Un solo contenedor con overflow-x: auto (sin barra duplicada).
           Añadimos position/isolation para mejorar sticky+z-index */
        .ps-scrollX{
          overflow-x:auto;
          overflow-y:visible;
          scrollbar-gutter: stable both-edges;
          border-radius: 12px;
          position: relative;
          isolation: isolate;
        }

        .ps-table{
          border-collapse: separate;
          border-spacing: 10px 6px;
          width:100%;
          min-width: 1480px;
          color: var(--ink);
          background: var(--surface);
          font-feature-settings: "tnum" 1;
        }

        /* Encabezado sticky */
        .ps-table thead th{
          position: sticky;
          top: 0;
          z-index: 60;
          background: var(--surface-muted);
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 10px 12px;
          text-align: left;
          white-space: nowrap;
          box-shadow: 0 8px 18px rgba(0,0,0,.08);
          background-clip: padding-box;
        }

        .ps-date{
          font-weight: 900;
          padding: 10px 12px !important;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          background: #fff;
          white-space: nowrap;
        }

        .ps-num{ text-align:center; }

        .ps-chip{
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 44px;
          height: 34px;
          padding: 0 10px;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          background: #fff;
          font-weight: 900;
          box-shadow: 0 6px 14px rgba(0,0,0,.05);
          white-space: nowrap;
        }

        .ps-chip--zero{
          opacity: .55;
          background: var(--surface-muted);
        }

        .ps-chip--plant{
          border-color: color-mix(in srgb, var(--brand) 45%, #e5e7eb);
          background: color-mix(in srgb, var(--brand) 10%, #fff);
        }

        .ps-row--month .ps-date{
          border-color: color-mix(in srgb, var(--brand) 45%, #e5e7eb);
          background: color-mix(in srgb, var(--brand) 12%, #fff);
        }

        .ps-chip--month{
          border-color: color-mix(in srgb, var(--brand) 45%, #e5e7eb);
          background: color-mix(in srgb, var(--brand) 14%, #fff);
        }

        .ps-pill{
          display:inline-flex;
          align-items:center;
          gap:8px;
          padding: 7px 10px;
          border-radius: 999px;
          border: 1px solid color-mix(in srgb, var(--brand) 45%, #e5e7eb);
          background: color-mix(in srgb, var(--brand) 16%, #fff);
          font-weight: 1000;
          white-space: nowrap;
        }
        .ps-pill__dot{
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: var(--brand);
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--brand) 22%, transparent);
        }

        .ps-row--total .ps-date{
          border-color: color-mix(in srgb, var(--state-done) 45%, #e5e7eb);
          background: color-mix(in srgb, var(--state-done) 14%, #fff);
        }
        .ps-row--total .ps-chip{
          border-color: color-mix(in srgb, var(--state-done) 45%, #e5e7eb);
          background: color-mix(in srgb, var(--state-done) 16%, #fff);
        }

        .ps-panel{
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          background: var(--surface);
          padding: 12px;
          box-shadow: 0 10px 26px rgba(0,0,0,.06);
        }

        .ps-cols{
          display:grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 8px 12px;
          margin-top: 8px;
        }

        .ps-colItem{
          display:flex;
          align-items:center;
          gap: 10px;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 8px 10px;
          background: #fff;
        }

        .ps-note{
          font-size: 12px;
          opacity: .75;
          margin-top: 6px;
        }
      `}</style>

      <div className="page__header">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 className="h1" style={{ background: 'var(--surface-muted)' }}>
            Conteo Portones
          </h2>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" type="button" onClick={exportCsv} disabled={loading || !!err}>
              Exportar CSV
            </button>
            <button className="btn" type="button" onClick={() => setColsOpen(v => !v)} disabled={loading || !!err}>
              Columnas ({visibleStages.length})
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontWeight: 800 }}>Desde</span>
            <input className="btn" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontWeight: 800 }}>Hasta</span>
            <input className="btn" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontWeight: 800 }}>Vista</span>
            <select className="btn" value={view} onChange={(e) => setView(e.target.value)}>
              <option value="daily+monthly">Diaria + Totales Mensuales</option>
              <option value="daily">Solo diaria</option>
              <option value="monthly">Solo mensual</option>
            </select>
          </label>

          <button className="btn" type="button" onClick={() => { setFrom(''); setTo(''); }}>
            Limpiar filtros
          </button>
        </div>

        {colsOpen && (
          <div className="ps-panel" style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ fontWeight: 1000 }}>Columnas visibles</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn" type="button" onClick={setAllCols}>Todas</button>
                <button className="btn" type="button" onClick={() => setColsOpen(false)}>Cerrar</button>
              </div>
            </div>

            <div className="ps-cols">
              {STAGE_DEFS.map((s) => (
                <label key={s.key} className="ps-colItem">
                  <input
                    type="checkbox"
                    checked={visibleCols.includes(s.key)}
                    onChange={() => {
                      const next = visibleCols.includes(s.key)
                        ? visibleCols.filter(x => x !== s.key)
                        : [...visibleCols, s.key];

                      const safe = next.length ? next : loadVisibleColsDefault();
                      setVisibleCols(safe);
                      saveVisibleCols(safe);
                    }}
                  />
                  <span style={{ fontWeight: 900 }}>{s.label}</span>
                </label>
              ))}
            </div>

            <div className="ps-note">Se guarda automáticamente en tu navegador</div>
          </div>
        )}

        <div className="ps-panel" style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ fontWeight: 1000 }}>Total en planta</div>

            <button className="btn" type="button" onClick={loadPlantaBase} disabled={plantaLoading}>
              {plantaLoading ? 'Cargando…' : 'Recargar base'}
            </button>
          </div>

          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
            {plantaBase ? (
              <>
                Base actual: <b>{plantaBase.qty}</b> desde <b>{fmtAR(plantaBase.date)}</b>.{' '}
                Total = base + (<b>{PLANT_IN_KEY}</b>) − (<b>{PLANT_OUT_KEY}</b>).
              </>
            ) : (
              <>Base actual: <b>sin datos</b>. (Cargá una base con “Guardar (POST)”).</>
            )}
          </div>

          {(plantaErr || plantaOk) && (
            <div style={{ marginTop: 8, fontWeight: 900, color: plantaErr ? 'crimson' : 'var(--brand)' }}>
              {plantaErr || plantaOk}
            </div>
          )}

          <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontWeight: 900 }}>Fecha</span>
              <input
                className="btn"
                type="date"
                value={newPlantaDate}
                onChange={(e) => setNewPlantaDate(e.target.value)}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontWeight: 900 }}>Cantidad</span>
              <input
                className="btn"
                inputMode="numeric"
                placeholder="Ej: 120"
                value={newPlantaQty}
                onChange={(e) => setNewPlantaQty(e.target.value)}
              />
            </label>

            <button className="btn btn--brand" type="button" onClick={savePlantaBase} disabled={plantaLoading}>
              {plantaLoading ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>

        {loading && <div style={{ marginTop: 12, opacity: 0.8 }}>Cargando…</div>}
        {err && <div style={{ marginTop: 12, color: 'crimson', fontWeight: 900 }}>{err}</div>}
      </div>

      <div className="grid-scroll" style={{ padding: 16 }}>
        {!loading && !err && (
          <div className="ps-wrap">
            <div className="ps-scrollX">
              <table className="ps-table">
                <colgroup>
                  <col style={{ width: 150 }} />
                  <col style={{ width: 170 }} />
                  {visibleStages.map((s) => (
                    <col key={s.key} style={{ width: 140 }} />
                  ))}
                </colgroup>

                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th title={`Total en planta = base + ${PLANT_IN_KEY} acumulado − ${PLANT_OUT_KEY} acumulado`}>
                      Total en planta
                    </th>
                    {visibleStages.map((s) => (
                      <th key={s.key}>{s.label}</th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {view === 'monthly' && (
                    monthlyRows.length === 0 ? (
                      <tr>
                        <td colSpan={2 + visibleStages.length} style={{ padding: 12, opacity: 0.7 }}>
                          Sin datos mensuales para el rango seleccionado.
                        </td>
                      </tr>
                    ) : (
                      monthlyRows.map((m, idx) => {
                        const plantEnd = plantSeries.byMonthEnd.get(m.month);
                        const plantText = Number.isFinite(plantEnd) ? String(plantEnd) : '';

                        return (
                          <tr key={`m-${m.month}-${idx}`} className="ps-row ps-row--month">
                            <td className="ps-date">
                              <span className="ps-pill">
                                <span className="ps-pill__dot" />
                                TOTAL MES {monthLabel(m.month)}
                              </span>
                            </td>

                            <td className="ps-num">
                              <span className={plantText ? 'ps-chip ps-chip--month ps-chip--plant' : 'ps-chip ps-chip--month ps-chip--zero'}>
                                {plantText || '—'}
                              </span>
                            </td>

                            {visibleStages.map((s) => (
                              <td key={s.key} className="ps-num">
                                <span className="ps-chip ps-chip--month">{String(m.counts?.[s.key] || 0)}</span>
                              </td>
                            ))}
                          </tr>
                        );
                      })
                    )
                  )}

                  {view === 'daily' && (
                    dailyRows.length === 0 ? (
                      <tr>
                        <td colSpan={2 + visibleStages.length} style={{ padding: 12, opacity: 0.7 }}>
                          Sin datos diarios para el rango seleccionado.
                        </td>
                      </tr>
                    ) : (
                      dailyRows.map((r, idx) => {
                        const plant = plantSeries.byDate.get(r.date);
                        const showPlant = plantSeries.baseDate && r.date >= plantSeries.baseDate;
                        const plantText = showPlant ? String(plant ?? '') : '';

                        return (
                          <tr key={`d-${r.date}-${idx}`}>
                            <td className="ps-date">{fmtAR(r.date)}</td>

                            <td className="ps-num">
                              <span className={plantText ? 'ps-chip ps-chip--plant' : 'ps-chip ps-chip--zero'}>
                                {plantText || '—'}
                              </span>
                            </td>

                            {visibleStages.map((s) => {
                              const v = Number(r.counts?.[s.key] || 0);
                              return (
                                <td key={s.key} className="ps-num">
                                  <span className={v ? 'ps-chip' : 'ps-chip ps-chip--zero'}>{String(v)}</span>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    )
                  )}

                  {view === 'daily+monthly' && (
                    dailyPlusMonthlyRows.length === 0 ? (
                      <tr>
                        <td colSpan={2 + visibleStages.length} style={{ padding: 12, opacity: 0.7 }}>
                          Sin datos para el rango seleccionado.
                        </td>
                      </tr>
                    ) : (
                      dailyPlusMonthlyRows.map((x, idx) => {
                        if (x.__type === 'month') {
                          const plantEnd = plantSeries.byMonthEnd.get(x.month);
                          const plantText = Number.isFinite(plantEnd) ? String(plantEnd) : '';

                          return (
                            <tr key={`mx-${x.month}-${idx}`} className="ps-row ps-row--month">
                              <td className="ps-date">
                                <span className="ps-pill">
                                  <span className="ps-pill__dot" />
                                  TOTAL MES {monthLabel(x.month)}
                                </span>
                              </td>

                              <td className="ps-num">
                                <span className={plantText ? 'ps-chip ps-chip--month ps-chip--plant' : 'ps-chip ps-chip--month ps-chip--zero'}>
                                  {plantText || '—'}
                                </span>
                              </td>

                              {visibleStages.map((s) => (
                                <td key={s.key} className="ps-num">
                                  <span className="ps-chip ps-chip--month">{String(x.counts?.[s.key] || 0)}</span>
                                </td>
                              ))}
                            </tr>
                          );
                        }

                        const plant = plantSeries.byDate.get(x.date);
                        const showPlant = plantSeries.baseDate && x.date >= plantSeries.baseDate;
                        const plantText = showPlant ? String(plant ?? '') : '';

                        return (
                          <tr key={`dx-${x.date}-${idx}`}>
                            <td className="ps-date">{fmtAR(x.date)}</td>

                            <td className="ps-num">
                              <span className={plantText ? 'ps-chip ps-chip--plant' : 'ps-chip ps-chip--zero'}>
                                {plantText || '—'}
                              </span>
                            </td>

                            {visibleStages.map((s) => {
                              const v = Number(x.counts?.[s.key] || 0);
                              return (
                                <td key={s.key} className="ps-num">
                                  <span className={v ? 'ps-chip' : 'ps-chip ps-chip--zero'}>{String(v)}</span>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    )
                  )}
                </tbody>

                <tfoot>
                  <tr className="ps-row ps-row--total">
                    <td className="ps-date">
                      <span
                        className="ps-pill"
                        style={{
                          borderColor: 'color-mix(in srgb, var(--state-done) 45%, #e5e7eb)',
                          background: 'color-mix(in srgb, var(--state-done) 16%, #fff)',
                        }}
                      >
                        <span
                          className="ps-pill__dot"
                          style={{
                            background: 'var(--state-done)',
                            boxShadow: '0 0 0 4px color-mix(in srgb, var(--state-done) 22%, transparent)',
                          }}
                        />
                        TOTAL (todo)
                      </span>
                    </td>

                    <td className="ps-num">
                      {(() => {
                        const last = dailyRows.length ? dailyRows[dailyRows.length - 1].date : null;
                        const v = last ? plantSeries.byDate.get(last) : null;
                        const show = last && plantSeries.baseDate && last >= plantSeries.baseDate;
                        return (
                          <span className={show ? 'ps-chip ps-chip--plant' : 'ps-chip ps-chip--zero'}>
                            {show && Number.isFinite(v) ? String(v) : '—'}
                          </span>
                        );
                      })()}
                    </td>

                    {visibleStages.map((s) => (
                      <td key={s.key} className="ps-num">
                        <span className="ps-chip">{String(totalsAll[s.key] || 0)}</span>
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

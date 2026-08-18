// src/components/InformeSemanalPortones.jsx
// Pestaña "Reporte semanal" de Información Excel: digitaliza la planilla en
// papel de producción (NV, cliente, distribuidor, color, revestimiento,
// medidas y estado de las 5 etapas clave), filtrando por semana de
// producción o de despacho.
import { useMemo, useState } from 'react';

function pad2(n) {
  return String(n).padStart(2, '0');
}

// Mismo parser tolerante que StageColumn.jsx (varios formatos de fecha).
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
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  return '';
}

// Mismo criterio que StageColumn.jsx (getProdDate10/getSalidaDate10): la
// planta ya usa estos fallbacks para "Producción: Semana N°" / "Despacho:
// Semana N°" en las tarjetas, así que este reporte usa la misma fecha.
function getProdDate10(item) {
  const raw =
    item?.fecha_prod ?? item?.Fecha_Prod ?? item?.fecha_produccion ?? item?.Fecha_Produccion ??
    item?.inicio_prod ?? item?.Inicio_Prod ?? item?.inicio_prod_imput ?? item?.Inicio_Prod_Imput ?? null;
  return toISODate10(raw);
}
function getSalidaDate10(item) {
  const raw =
    item?.fecha_salida_imput ?? item?.Fecha_Salida_Imput ?? item?.fecha_entrega_imput ?? item?.Fecha_Entrega_Imput ??
    item?.fecha_plan_entrega ?? item?.Fecha_Plan_Entrega ?? item?.fecha_plan ?? item?.Fecha_Plan ??
    item?.fecha_salida ?? item?.Fecha_Salida ?? item?.fecha_entrega ?? item?.Fecha_Entrega ?? null;
  return toISODate10(raw);
}

// Mismo algoritmo que PreproduccionValoresTable.jsx (semana ISO-8601,
// lunes a lunes, semana 1 = la que contiene el 4 de enero).
function isoWeekLabelFromDate(dateLike) {
  const date10 = toISODate10(dateLike);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date10)) return '';
  const d = new Date(`${date10}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDay = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((d - firstThu) / (7 * 24 * 3600 * 1000));
  const year = d.getUTCFullYear();
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function isoWeekStartEndFromLabel(weekLabel) {
  const m = String(weekLabel || '').match(/^(\d{4})-W(\d{2})$/);
  if (!m) return { start: '', end: '' };
  const year = Number(m[1]);
  const week = Number(m[2]);

  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const week1Mon = new Date(jan4);
  week1Mon.setUTCDate(jan4.getUTCDate() - jan4Day);

  const startDt = new Date(week1Mon);
  startDt.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7);
  const endDt = new Date(startDt);
  endDt.setUTCDate(startDt.getUTCDate() + 7);

  const start = `${startDt.getUTCFullYear()}-${pad2(startDt.getUTCMonth() + 1)}-${pad2(startDt.getUTCDate())}`;
  const end = `${endDt.getUTCFullYear()}-${pad2(endDt.getUTCMonth() + 1)}-${pad2(endDt.getUTCDate())}`;
  return { start, end };
}

function formatDMY(date10) {
  const m = String(date10 || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function weekNumberFromLabel(weekLabel) {
  const m = String(weekLabel || '').match(/^\d{4}-W(\d{2})$/);
  return m ? String(Number(m[1])) : '';
}

// Igual que medidasDisplayFromRow (PreproduccionValoresTable.jsx), pero en
// orden Ancho x Alto (pedido puntual de este reporte).
function toMmHeuristic(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return x < 50 ? Math.round(x * 1000) : Math.round(x);
}
function medidasAnchoAlto(item) {
  const anchoRaw = item?.Ancho ?? item?.ancho ?? item?.Puerta_Ancho ?? item?.puerta_ancho;
  const altoRaw = item?.Alto ?? item?.alto ?? item?.Puerta_Alto ?? item?.puerta_alto;
  const anchoMm = toMmHeuristic(anchoRaw);
  const altoMm = toMmHeuristic(altoRaw);
  return anchoMm != null && altoMm != null ? `${anchoMm} x ${altoMm}` : '';
}

function trimOrEmpty(v) {
  return v == null ? '' : String(v).trim();
}

// Semana de despacho: las etapas finales, de cara al armado/pintura/envío.
const STATUS_STAGES_DESPACHO = [
  { key: 'armado_primario', label: 'Arm. Prim.' },
  { key: 'revestimiento', label: 'Revest.' },
  { key: 'pintura', label: 'Pintura' },
  { key: 'inyeccion', label: 'Inyec.' },
  { key: 'armado_final', label: 'Arm. Final' },
];

// Semana de producción: las etapas tempranas (corte/plegado/prefabricado),
// que es lo que a Producción le interesa seguir semana a semana.
const STATUS_STAGES_PRODUCCION = [
  { key: 'diseno', label: 'Diseño Tubos' },
  { key: 'laser', label: 'Laser' },
  { key: 'guillotina', label: 'Corte Piernas' },
  { key: 'corte_revest', label: 'Corte Revest.' },
  { key: 'plegadora', label: 'Plegado Piernas' },
  { key: 'plegado_revest', label: 'Plegado Revest.' },
  { key: 'armado_piernas', label: 'Prefabricado' },
  { key: 'armado_marco_piernas', label: 'Arm. Marco Piernas' },
  { key: 'armado_hojas', label: 'Arm. Hojas' },
  { key: 'armado_primario', label: 'Arm. Primario' },
];

function statusStyle(estadoRaw) {
  const s = String(estadoRaw || '').trim().toLowerCase();
  if (s === 'finalizado') return { bg: '#dcfce7', fg: '#15803d', border: '#86efac', label: 'Finalizado' };
  if (s === 'en proceso') return { bg: '#fffbeb', fg: '#92400e', border: '#f59e0b', label: 'En Proceso' };
  if (s === 'pendiente') return { bg: '#f1f5f9', fg: '#475569', border: '#cbd5e1', label: 'Pendiente' };
  return { bg: 'transparent', fg: '#cbd5e1', border: '#e2e8f0', label: '—' };
}

// Etapa "compuerta" que, una vez Finalizada, saca por defecto al portón del
// reporte (ya pasó el punto que le interesa seguir a Producción/Despacho).
const GATE_STAGE_BY_MODO = {
  produccion: 'armado_primario',
  despacho: 'armado_final',
};

export default function InformeSemanalPortones({ portones, loading, err, refresh, refreshing }) {
  const [modo, setModo] = useState('produccion'); // 'produccion' | 'despacho'
  const [weekLabel, setWeekLabel] = useState(() => isoWeekLabelFromDate(new Date().toISOString()));
  const [exporting, setExporting] = useState(false);
  const [mostrarFinalizados, setMostrarFinalizados] = useState(false);

  const { start, end } = useMemo(() => isoWeekStartEndFromLabel(weekLabel), [weekLabel]);
  const weekNum = weekNumberFromLabel(weekLabel);
  const statusStages = modo === 'despacho' ? STATUS_STAGES_DESPACHO : STATUS_STAGES_PRODUCCION;
  const gateStageKey = GATE_STAGE_BY_MODO[modo];
  const gateStageLabel = statusStages.find((s) => s.key === gateStageKey)?.label || gateStageKey;

  const filas = useMemo(() => {
    if (!Array.isArray(portones) || !start || !end) return [];
    const out = [];
    for (const p of portones) {
      const date10 = modo === 'despacho' ? getSalidaDate10(p) : getProdDate10(p);
      if (!date10 || date10 < start || date10 >= end) continue;

      if (!mostrarFinalizados) {
        const gateEstado = String(p[gateStageKey] ?? '').trim().toLowerCase();
        if (gateEstado === 'finalizado') continue;
      }

      out.push({
        nv: p.nv ?? p.NV ?? '',
        cliente: trimOrEmpty(p.nombre_cliente),
        distribuidor: trimOrEmpty(p.RazSoc ?? p.distribuidor_nombre),
        color: trimOrEmpty(p.Color_Sistema),
        revestimiento: trimOrEmpty(p.sistema),
        medidas: medidasAnchoAlto(p),
        estados: Object.fromEntries(statusStages.map((s) => [s.key, p[s.key] ?? null])),
      });
    }
    out.sort((a, b) => (Number(a.nv) || 0) - (Number(b.nv) || 0));
    return out;
  }, [portones, modo, start, end, statusStages, gateStageKey, mostrarFinalizados]);

  async function handleExport() {
    if (!filas.length) return;
    setExporting(true);
    try {
      const xlsxMod = await import('xlsx');
      const XLSX = xlsxMod.default || xlsxMod;

      const semanaLabel = modo === 'despacho' ? 'Semana Despacho' : 'Semana Producción';
      const header = [
        'NV', semanaLabel, 'Nombre Cliente', 'Distribuidor', 'Color', 'Revestimiento', 'Medidas (Ancho x Alto mm)',
        ...statusStages.map((s) => s.label),
      ];
      const dataRows = filas.map((f) => [
        f.nv, weekNum, f.cliente, f.distribuidor, f.color, f.revestimiento, f.medidas,
        ...statusStages.map((s) => statusStyle(f.estados[s.key]).label),
      ]);

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
      ws['!cols'] = [
        { wch: 8 }, { wch: 14 }, { wch: 26 }, { wch: 20 }, { wch: 14 }, { wch: 22 }, { wch: 20 },
        ...statusStages.map(() => ({ wch: 12 })),
      ];
      const modoLabel = modo === 'despacho' ? 'Despacho' : 'Producción';
      XLSX.utils.book_append_sheet(wb, ws, `Semana ${weekNum || ''}`.trim());

      const pad = (n) => String(n).padStart(2, '0');
      const now = new Date();
      const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
      XLSX.writeFile(wb, `reporte_semanal_${modoLabel.toLowerCase()}_semana${weekNum || ''}_${stamp}.xlsx`);
    } catch (e) {
      alert(e?.message || 'Error exportando el Excel');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <div style={{ opacity: 0.75, marginBottom: 14 }}>
        Elegí semana de producción o de despacho y una semana puntual: se arma la misma tabla que hoy se lleva en papel, con el estado de cada etapa.
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className={`btn${modo === 'produccion' ? ' btn--brand' : ''}`} onClick={() => setModo('produccion')}>
            Semana de producción
          </button>
          <button type="button" className={`btn${modo === 'despacho' ? ' btn--brand' : ''}`} onClick={() => setModo('despacho')}>
            Semana de despacho
          </button>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontWeight: 800, fontSize: 13 }}>Semana</span>
          <input className="btn" type="week" value={weekLabel} onChange={(e) => setWeekLabel(e.target.value)} />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={mostrarFinalizados}
            onChange={(e) => setMostrarFinalizados(e.target.checked)}
          />
          Mostrar también los que ya tienen <b>{gateStageLabel}</b> Finalizado
        </label>

        <button type="button" className="btn" onClick={refresh} disabled={refreshing}>
          {refreshing ? 'Actualizando…' : 'Refrescar datos'}
        </button>

        <button type="button" className="btn btn--brand" onClick={handleExport} disabled={exporting || !filas.length}>
          {exporting ? 'Exportando…' : 'Exportar a Excel'}
        </button>
      </div>

      {start && end ? (
        <div style={{ fontWeight: 800, marginBottom: 10 }}>
          Semana {weekNum} · {formatDMY(start)} al {formatDMY(new Date(new Date(end).getTime() - 86400000).toISOString().slice(0, 10))}
          <span style={{ fontWeight: 500, opacity: 0.75 }}> — {filas.length} NV</span>
        </div>
      ) : null}

      {err && <div style={{ color: 'crimson', marginBottom: 10 }}>Error: {err}</div>}

      {loading ? (
        <div>Cargando…</div>
      ) : filas.length === 0 ? (
        <div style={{ opacity: 0.75 }}>No hay portones para esta semana.</div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>NV</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>
                  {modo === 'despacho' ? 'Semana Despacho' : 'Semana Producción'}
                </th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Nombre Cliente</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Distribuidor</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Color</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Revestimiento</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Medidas</th>
                {statusStages.map((s) => (
                  <th key={s.key} style={{ textAlign: 'center', padding: 8, borderBottom: '1px solid var(--border)' }}>{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.nv}>
                  <td style={{ padding: 8, borderBottom: '1px solid #eee', fontWeight: 800 }}>{f.nv}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{weekNum}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{f.cliente}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{f.distribuidor}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{f.color}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{f.revestimiento}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{f.medidas}</td>
                  {statusStages.map((s) => {
                    const st = statusStyle(f.estados[s.key]);
                    return (
                      <td key={s.key} style={{ padding: 4, borderBottom: '1px solid #eee', textAlign: 'center' }}>
                        <div
                          title={st.label}
                          style={{
                            background: st.bg, color: st.fg, border: `1px solid ${st.border}`,
                            borderRadius: 6, padding: '4px 6px', fontWeight: 700, fontSize: 11,
                          }}
                        >
                          {st.label === '—' ? '—' : st.label}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

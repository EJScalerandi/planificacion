import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchIpanelPreproduccionValores,
  updateIpanelPreproduccionValor,
  enviarIpanelPreproduccionAProduccion,
} from '../api';

function toStr(v) {
  if (v == null) return '';
  return String(v);
}

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

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  return '';
}

function formatDMY(v) {
  const iso = toISODate10(v);
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function dataOf(row) {
  return row?.data && typeof row.data === 'object' ? row.data : {};
}

function getAny(obj, keys) {
  if (!obj) return '';
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null) return obj[k];
  }
  const byLow = {};
  for (const k of Object.keys(obj)) byLow[String(k).toLowerCase()] = k;
  for (const k of keys) {
    const real = byLow[String(k).toLowerCase()];
    if (real && obj[real] != null) return obj[real];
  }
  return '';
}

function field(row, keys) {
  const d = dataOf(row);
  return getAny(row, keys) || getAny(d, keys);
}

function RowStatus({ row }) {
  const sent = row?.produccion_enviada === true || !!row?.ipanel_id;
  if (sent) {
    return (
      <span style={{ padding: '3px 8px', borderRadius: 999, background: '#dcfce7', color: '#166534', fontWeight: 800, whiteSpace: 'nowrap' }}>
        En producción{row?.ipanel_id ? ` #${row.ipanel_id}` : ''}
      </span>
    );
  }
  return (
    <span style={{ padding: '3px 8px', borderRadius: 999, background: '#fef3c7', color: '#92400e', fontWeight: 800, whiteSpace: 'nowrap' }}>
      Pendiente
    </span>
  );
}

export default function IpanelPreproduccionValoresTable() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [onlyPending, setOnlyPending] = useState(false);
  const [drafts, setDrafts] = useState({});

  const setDraft = useCallback((id, key, value) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [key]: value,
      },
    }));
  }, []);

  const getDraftValue = useCallback((row, key) => {
    const d = drafts[row.id] || {};
    if (Object.prototype.hasOwnProperty.call(d, key)) return d[key] || '';
    return toISODate10(row?.[key]);
  }, [drafts]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErr('');
      const { data } = await fetchIpanelPreproduccionValores({
        q: q.trim() || undefined,
        onlyPending: onlyPending ? 1 : undefined,
      });
      setRows(Array.isArray(data) ? data : []);
      setDrafts({});
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || 'Error cargando iPanels');
    } finally {
      setLoading(false);
    }
  }, [q, onlyPending]);

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const total = rows.length;
    const sent = rows.filter((r) => r?.produccion_enviada === true || !!r?.ipanel_id).length;
    return { total, sent, pending: total - sent };
  }, [rows]);

  async function saveDates(row) {
    try {
      setSavingId(row.id);
      setErr('');
      const fecha_prod = getDraftValue(row, 'fecha_prod') || null;
      const fecha_plan_entrega = getDraftValue(row, 'fecha_plan_entrega') || null;
      const { data } = await updateIpanelPreproduccionValor(row.id, { fecha_prod, fecha_plan_entrega });
      setRows((prev) => prev.map((r) => (r.id === row.id ? data : r)));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || 'Error guardando fechas');
    } finally {
      setSavingId(null);
    }
  }

  async function sendToProduction(row) {
    const savedFechaProd = toISODate10(row?.fecha_prod);
    const savedFechaEntrega = toISODate10(row?.fecha_plan_entrega);

    if (!savedFechaProd) {
      alert('Primero guardá la Fecha Producción.');
      return;
    }

    const draft = drafts[row.id] || {};
    const hasUnsavedDraft =
      Object.prototype.hasOwnProperty.call(draft, 'fecha_prod') ||
      Object.prototype.hasOwnProperty.call(draft, 'fecha_plan_entrega');

    if (hasUnsavedDraft) {
      alert('Hay cambios de fecha sin guardar. Guardá las fechas antes de enviar a producción.');
      return;
    }

    const partida = row?.partida || field(row, ['numero']);
    const ok = window.confirm(`¿Enviar iPanel partida ${partida || row.id} a producción?`);
    if (!ok) return;

    try {
      setSavingId(row.id);
      setErr('');
      const { data } = await enviarIpanelPreproduccionAProduccion(row.id, {
        fecha_prod: savedFechaProd,
        fecha_plan_entrega: savedFechaEntrega || null,
      });
      const updated = data?.preproduccion || row;
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || 'Error enviando a producción');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div style={{ padding: 14 }}>
      <div className="header-row" style={{ marginBottom: 12, alignItems: 'flex-start' }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>Preproducción iPanels</h1>
          <div style={{ opacity: 0.75, marginTop: 4 }}>
            Origen: <b>preproduccion_valores_ipanels</b>. Al enviar a producción se crea/actualiza en <b>public.ipanel</b>.
          </div>
        </div>
        <button className="btn btn--brand" type="button" onClick={load} disabled={loading}>
          {loading ? 'Cargando…' : 'Actualizar'}
        </button>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); load(); }}
        style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}
      >
        <input
          className="btn"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por partida, NV, cliente, nombre, localidad u OC"
          style={{ minWidth: 360 }}
        />
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontWeight: 800 }}>
          <input
            type="checkbox"
            checked={onlyPending}
            onChange={(e) => setOnlyPending(e.target.checked)}
          />
          Solo pendientes
        </label>
        <button className="btn btn--brand" type="submit" disabled={loading}>Buscar</button>
        <button
          className="btn"
          type="button"
          disabled={loading}
          onClick={() => { setQ(''); setOnlyPending(false); setTimeout(load, 0); }}
        >
          Limpiar
        </button>
        <div style={{ fontWeight: 800, opacity: 0.75 }}>
          Total: {counts.total} · Pendientes: {counts.pending} · En producción: {counts.sent}
        </div>
      </form>

      {err && (
        <div style={{ color: 'crimson', fontWeight: 800, marginBottom: 10, border: '1px solid #fecaca', padding: 10, borderRadius: 10 }}>
          {err}
        </div>
      )}

      <div style={{ overflow: 'auto', border: '1px solid var(--border, #e5e7eb)', borderRadius: 12, background: 'white' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={th}>Estado</th>
              <th style={th}>Partida</th>
              <th style={th}>NV</th>
              <th style={th}>Fecha NV</th>
              <th style={th}>Cliente</th>
              <th style={th}>Nombre</th>
              <th style={th}>Localidad</th>
              <th style={th}>Fecha Producción</th>
              <th style={th}>Fecha Entrega</th>
              <th style={th}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const d = dataOf(row);
              const sent = row?.produccion_enviada === true || !!row?.ipanel_id;
              const disabled = savingId === row.id || sent;
              const savedFechaProd = toISODate10(row?.fecha_prod);
              const draft = drafts[row.id] || {};
              const hasUnsavedDraft =
                Object.prototype.hasOwnProperty.call(draft, 'fecha_prod') ||
                Object.prototype.hasOwnProperty.call(draft, 'fecha_plan_entrega');
              const canSendToProduction = !disabled && !!savedFechaProd && !hasUnsavedDraft;
              const sendTitle = sent
                ? 'Este iPanel ya está en producción'
                : !savedFechaProd
                  ? 'Primero guardá la Fecha Producción'
                  : hasUnsavedDraft
                    ? 'Guardá los cambios de fecha antes de enviar a producción'
                    : 'Enviar a producción';

              return (
                <tr key={row.id}>
                  <td style={td}><RowStatus row={row} /></td>
                  <td style={td}>{toStr(row.partida || d.partida || d.numero)}</td>
                  <td style={td}>{toStr(row.nv || d.nv || d.numero)}</td>
                  <td style={td}>{formatDMY(row.fecha_nv || d.fecha_nv || d.fecha)}</td>
                  <td style={td}>{toStr(field(row, ['cliente', 'Cliente']))}</td>
                  <td style={td}>{toStr(field(row, ['nombre', 'Nombre']))}</td>
                  <td style={td}>{toStr(field(row, ['localidad', 'Localidad']))}</td>
                  <td style={td}>
                    <input
                      className="btn"
                      type="date"
                      value={getDraftValue(row, 'fecha_prod')}
                      onChange={(e) => setDraft(row.id, 'fecha_prod', e.target.value)}
                      disabled={sent}
                      style={{ minWidth: 140 }}
                    />
                    {hasUnsavedDraft && !sent ? (
                      <div style={{ fontSize: 11, color: '#92400e', marginTop: 4 }}>Cambios sin guardar</div>
                    ) : null}
                  </td>
                  <td style={td}>
                    <input
                      className="btn"
                      type="date"
                      value={getDraftValue(row, 'fecha_plan_entrega')}
                      onChange={(e) => setDraft(row.id, 'fecha_plan_entrega', e.target.value)}
                      disabled={sent}
                      style={{ minWidth: 140 }}
                    />
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn" type="button" onClick={() => saveDates(row)} disabled={disabled}>
                        Guardar fechas
                      </button>
                      <button
                        className="btn btn--brand"
                        type="button"
                        onClick={() => sendToProduction(row)}
                        disabled={!canSendToProduction}
                        title={sendTitle}
                      >
                        {sent ? 'En producción' : 'Enviar a producción'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {!loading && rows.length === 0 && (
              <tr>
                <td style={{ ...td, textAlign: 'center', padding: 20 }} colSpan={10}>
                  No hay iPanels para mostrar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th = {
  textAlign: 'left',
  padding: '10px 8px',
  borderBottom: '1px solid #e5e7eb',
  whiteSpace: 'nowrap',
};

const td = {
  padding: '8px',
  borderBottom: '1px solid #eef2f7',
  verticalAlign: 'middle',
};

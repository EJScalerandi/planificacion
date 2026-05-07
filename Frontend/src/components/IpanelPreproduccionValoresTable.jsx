import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api';

function toStr(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
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
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  return '';
}

function formatDate(v) {
  const iso = toISODate10(v);
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function getData(row) {
  return row?.data && typeof row.data === 'object' ? row.data : {};
}

function getAny(obj, keys) {
  for (const k of keys) {
    if (obj?.[k] != null && String(obj[k]).trim() !== '') return obj[k];
  }
  const lower = {};
  for (const k of Object.keys(obj || {})) lower[k.toLowerCase()] = k;
  for (const k of keys) {
    const real = lower[String(k).toLowerCase()];
    if (real && obj?.[real] != null && String(obj[real]).trim() !== '') return obj[real];
  }
  return '';
}

function getNombre(row) {
  const d = getData(row);
  return toStr(row?.nombre ?? getAny(d, ['nombre', 'Nombre']));
}

function getCliente(row) {
  const d = getData(row);
  return toStr(row?.cliente ?? getAny(d, ['cliente', 'Cliente']));
}

function getDescripcion(row) {
  const d = getData(row);
  return toStr(
    row?.descripcion ??
      d.descripcion ??
      d.producto_descripcion ??
      d.producto_descripciones ??
      d.descripcion_producto
  );
}

function rowKey(row) {
  return String(row?.id ?? row?.partida ?? row?.nv ?? Math.random());
}

export default function IpanelPreproduccionValoresTable() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [onlyPending, setOnlyPending] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [sendingId, setSendingId] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErr('');
      const { data } = await api.get('/preproduccion-valores-ipanels', {
        params: { q: q.trim() || undefined, onlyPending: onlyPending ? 1 : undefined },
        headers: { 'Cache-Control': 'no-cache' },
      });
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || 'Error cargando iPanels');
    } finally {
      setLoading(false);
    }
  }, [q, onlyPending]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rowById = useMemo(() => {
    const m = new Map();
    for (const r of rows || []) m.set(String(r.id), r);
    return m;
  }, [rows]);

  function getDraft(row, field) {
    const id = String(row?.id);
    if (drafts[id] && Object.prototype.hasOwnProperty.call(drafts[id], field)) return drafts[id][field];
    return toISODate10(row?.[field]);
  }

  function isDirty(row) {
    const id = String(row?.id);
    const d = drafts[id];
    if (!d) return false;
    if (Object.prototype.hasOwnProperty.call(d, 'fecha_prod') && toISODate10(d.fecha_prod) !== toISODate10(row?.fecha_prod)) return true;
    if (Object.prototype.hasOwnProperty.call(d, 'fecha_plan_entrega') && toISODate10(d.fecha_plan_entrega) !== toISODate10(row?.fecha_plan_entrega)) return true;
    return false;
  }

  function setDraft(row, field, value) {
    const id = String(row?.id);
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } }));
  }

  async function saveDates(row) {
    const id = row?.id;
    if (!id) return;

    const fechaProd = toISODate10(getDraft(row, 'fecha_prod')) || null;
    const fechaPlanEntrega = toISODate10(getDraft(row, 'fecha_plan_entrega')) || null;

    try {
      setSavingId(id);
      setErr('');
      const { data: updated } = await api.patch(`/preproduccion-valores-ipanels/${id}`, {
        fecha_prod: fechaProd,
        fecha_plan_entrega: fechaPlanEntrega,
      });
      setRows((prev) => prev.map((r) => (String(r.id) === String(id) ? updated : r)));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[String(id)];
        return next;
      });
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || 'Error guardando fechas');
    } finally {
      setSavingId(null);
    }
  }

  async function sendToProduction(row) {
    const id = row?.id;
    if (!id) return;

    const fresh = rowById.get(String(id)) || row;
    if (isDirty(fresh)) {
      window.alert('Primero guardá las fechas antes de enviar a producción.');
      return;
    }
    if (!toISODate10(fresh.fecha_prod)) {
      window.alert('Para enviar a producción primero cargá y guardá Fecha Producción.');
      return;
    }

    const ok = window.confirm(`¿Enviar iPanel partida ${fresh.partida || '-'} a producción?`);
    if (!ok) return;

    try {
      setSendingId(id);
      setErr('');
      const { data } = await api.post(`/preproduccion-valores-ipanels/${id}/enviar-produccion`, {});
      const updated = data?.preproduccion;
      if (updated) setRows((prev) => prev.map((r) => (String(r.id) === String(id) ? updated : r)));
      else await load();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || 'Error enviando a producción');
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Preproducción iPanels</h1>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Origen: preproduccion_valores_ipanels. Producción: public.ipanel.</div>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); load(); }}
          style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
        >
          <input
            className="btn"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar partida, NV, cliente, descripción..."
            style={{ minWidth: 280 }}
          />
          <label className="btn" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />
            Solo pendientes
          </label>
          <button className="btn btn--brand" type="submit" disabled={loading}>{loading ? 'Cargando...' : 'Buscar'}</button>
          <button className="btn" type="button" onClick={() => { setQ(''); setOnlyPending(false); setTimeout(load, 0); }}>Limpiar</button>
        </form>
      </div>

      {err && <div style={{ color: 'crimson', fontWeight: 800, marginTop: 12 }}>{err}</div>}

      <div style={{ marginTop: 12, overflow: 'auto', border: '1px solid var(--border, #ddd)', borderRadius: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1180 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={th}>Partida</th>
              <th style={th}>NV</th>
              <th style={th}>Cliente</th>
              <th style={th}>Nombre</th>
              <th style={th}>Descripción</th>
              <th style={th}>Fecha producción</th>
              <th style={th}>Fecha entrega</th>
              <th style={th}>Estado</th>
              <th style={th}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((r) => {
              const dirty = isDirty(r);
              const hasFechaProd = !!toISODate10(r.fecha_prod);
              const enviado = r.produccion_enviada === true || !!r.ipanel_id;
              const id = r.id;

              return (
                <tr key={rowKey(r)}>
                  <td style={td}>{toStr(r.partida)}</td>
                  <td style={td}>{toStr(r.nv)}</td>
                  <td style={td}>{getCliente(r)}</td>
                  <td style={td}>{getNombre(r)}</td>
                  <td style={{ ...td, maxWidth: 420, whiteSpace: 'pre-wrap' }}>{getDescripcion(r)}</td>
                  <td style={td}>
                    <input
                      type="date"
                      className="btn"
                      value={getDraft(r, 'fecha_prod')}
                      onChange={(e) => setDraft(r, 'fecha_prod', e.target.value)}
                      disabled={enviado || savingId === id || sendingId === id}
                    />
                    {r.fecha_prod ? <div style={hint}>Guardada: {formatDate(r.fecha_prod)}</div> : null}
                  </td>
                  <td style={td}>
                    <input
                      type="date"
                      className="btn"
                      value={getDraft(r, 'fecha_plan_entrega')}
                      onChange={(e) => setDraft(r, 'fecha_plan_entrega', e.target.value)}
                      disabled={enviado || savingId === id || sendingId === id}
                    />
                    {r.fecha_plan_entrega ? <div style={hint}>Guardada: {formatDate(r.fecha_plan_entrega)}</div> : null}
                  </td>
                  <td style={td}>
                    {enviado ? <span style={pillOk}>En producción</span> : dirty ? <span style={pillWarn}>Sin guardar</span> : <span style={pill}>Pendiente</span>}
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => saveDates(r)}
                        disabled={enviado || !dirty || savingId === id || sendingId === id}
                      >
                        {savingId === id ? 'Guardando...' : 'Guardar fecha'}
                      </button>
                      <button
                        className="btn btn--brand"
                        type="button"
                        onClick={() => sendToProduction(r)}
                        disabled={enviado || dirty || !hasFechaProd || savingId === id || sendingId === id}
                        title={!hasFechaProd ? 'Primero guardá Fecha Producción' : dirty ? 'Primero guardá los cambios' : ''}
                      >
                        {sendingId === id ? 'Enviando...' : 'Enviar a producción'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {!loading && (!rows || !rows.length) ? (
              <tr><td style={td} colSpan={9}>No hay iPanels para mostrar.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th = { padding: 8, borderBottom: '1px solid #e5e7eb', textAlign: 'left', fontSize: 13 };
const td = { padding: 8, borderBottom: '1px solid #e5e7eb', verticalAlign: 'top', fontSize: 13 };
const hint = { fontSize: 11, opacity: 0.7, marginTop: 4 };
const pill = { display: 'inline-block', padding: '3px 8px', borderRadius: 999, border: '1px solid #d1d5db', background: '#fff' };
const pillOk = { ...pill, borderColor: '#86efac', background: '#f0fdf4', color: '#166534', fontWeight: 800 };
const pillWarn = { ...pill, borderColor: '#fcd34d', background: '#fffbeb', color: '#92400e', fontWeight: 800 };

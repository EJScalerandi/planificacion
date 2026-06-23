import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api, { getAdminToken } from '../api';
import AdminAuthModal from './modals/AdminAuthModal';

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

function isTruthySi(v) {
  if (v === true) return true;
  const s = String(v ?? '').trim().toLowerCase();
  return ['si', 'sí', 'true', '1', 'yes'].includes(s);
}

function parseJwt(token) {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function normalizeScopes(scopesRaw) {
  if (Array.isArray(scopesRaw)) return scopesRaw.map((s) => String(s || '').trim()).filter(Boolean);
  if (typeof scopesRaw === 'string') {
    return scopesRaw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function getCurrentScopes() {
  const payload = parseJwt(getAdminToken()) || {};
  return normalizeScopes(payload.scopes ?? payload.scope ?? payload.permissions ?? []);
}

function hasAny(scopes, needed) {
  const set = new Set((scopes || []).map((s) => String(s || '').trim()));
  return (needed || []).some((n) => set.has(n));
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
    row?.descripcion_simple ??
      row?.DescripcionSimple ??
      d.descripcion_simple ??
      d.DescripcionSimple
  );
}

function isAdminAutorizado(row) {
  const d = getData(row);
  return isTruthySi(row?.auth_admin ?? d.auth_admin);
}

function hasAdminAcciones(row) {
  const d = getData(row);
  return isTruthySi(row?.admin_acciones ?? d.admin_acciones) || Boolean(getAdminAccionesDetalle(row));
}

function getAdminAccionesDetalle(row) {
  const d = getData(row);
  return toStr(
    row?.admin_acciones_detalle ??
      row?.admin_acciones_observacion ??
      row?.acciones_detalle ??
      d.admin_acciones_detalle ??
      d.admin_acciones_observacion ??
      d.admin_acciones_observacion_imput ??
      d.acciones_detalle ??
      d.acciones_observacion
  );
}

function makeAuthModalRow(row) {
  return { ...row, data: { ...(getData(row) || {}) } };
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
  const [expandedAcciones, setExpandedAcciones] = useState(() => new Set());

  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminModalRow, setAdminModalRow] = useState(null);
  const [adminModalBusy, setAdminModalBusy] = useState(false);

  const userScopes = useMemo(() => getCurrentScopes(), []);
  const canAdminAuth = useMemo(() => hasAny(userScopes, ['preproduccion:admin']), [userScopes]);

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

  function openAdminModal(row) {
    if (!canAdminAuth) return;
    setAdminModalRow(makeAuthModalRow(row));
    setAdminModalOpen(true);
  }

  function closeAdminModal() {
    if (adminModalBusy) return;
    setAdminModalOpen(false);
    setAdminModalRow(null);
  }

  async function submitAdminAuth(patch) {
    if (!canAdminAuth) {
      window.alert('No tenés permiso para autorizar iPanels.');
      return;
    }
    const id = adminModalRow?.id;
    if (!id) return;
    try {
      setAdminModalBusy(true);
      const { data: updated } = await api.patch(`/preproduccion-valores-ipanels/${id}`, patch);
      setRows((prev) => prev.map((r) => (String(r.id) === String(id) ? updated : r)));
      closeAdminModal();
    } catch (e) {
      window.alert(e?.response?.data?.error || e.message || 'Error guardando autorización administrativa');
    } finally {
      setAdminModalBusy(false);
    }
  }

  function toggleAcciones(row) {
    const key = rowKey(row);
    setExpandedAcciones((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function renderAccionesAdmin(row) {
    const detalle = getAdminAccionesDetalle(row);
    const hasAcciones = hasAdminAcciones(row);
    const expanded = expandedAcciones.has(rowKey(row));

    if (!hasAcciones) return <span className="pp-badge pp-badge--muted">Sin acciones</span>;

    return (
      <button
        type="button"
        onClick={() => toggleAcciones(row)}
        title={expanded ? 'Click para contraer' : 'Click para ver completo'}
        className={expanded ? 'pp-accionBtn pp-accionBtn--expanded' : 'pp-accionBtn'}
      >
        {detalle || 'Acciones: Sí'}
      </button>
    );
  }

  return (
    <div className="pp-page">
      <div className="pp-headerRow">
        <div>
          <h2 className="pp-title">Preproducción iPanels</h2>
          <p className="pp-hint" style={{ margin: '4px 0 0' }}>Origen: preproduccion_valores_ipanels. Producción: public.ipanel.</p>
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

      {err && <div className="pp-errorBox" style={{ marginTop: 8 }}>{err}</div>}

      <div className="pp-tableWrap" style={{ marginTop: 12 }}>
        <table className="pp-table" style={{ minWidth: canAdminAuth ? 1380 : 1180 }}>
          <thead>
            <tr>
              <th className="pp-th">Partida</th>
              <th className="pp-th">NV</th>
              <th className="pp-th">Cliente</th>
              <th className="pp-th">Nombre</th>
              <th className="pp-th">Descripción</th>
              <th className="pp-th">Fecha producción</th>
              <th className="pp-th">Fecha despacho</th>
              {canAdminAuth ? <th className="pp-th">Aut. Admin</th> : null}
              {canAdminAuth ? <th className="pp-th" style={{ width: 190 }}>Acciones admin</th> : null}
              <th className="pp-th">Estado</th>
              <th className="pp-th">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((r) => {
              const dirty = isDirty(r);
              const hasFechaProd = !!toISODate10(r.fecha_prod);
              const enviado = r.produccion_enviada === true || !!r.ipanel_id;
              const id = r.id;
              const authAdmin = isAdminAutorizado(r);
              const isBusy = savingId === id || sendingId === id;

              return (
                <tr key={rowKey(r)}>
                  <td>{toStr(r.partida)}</td>
                  <td>{toStr(r.nv)}</td>
                  <td>{getCliente(r)}</td>
                  <td>{getNombre(r)}</td>
                  <td style={{ maxWidth: 360, whiteSpace: 'pre-wrap' }}>{getDescripcion(r)}</td>
                  <td>
                    <input
                      type="date"
                      className="btn"
                      value={getDraft(r, 'fecha_prod')}
                      onChange={(e) => setDraft(r, 'fecha_prod', e.target.value)}
                      disabled={enviado || isBusy}
                    />
                    {r.fecha_prod ? <div className="pp-hint">Guardada: {formatDate(r.fecha_prod)}</div> : null}
                  </td>
                  <td style={td}>
                    <input
                      type="date"
                      className="btn"
                      value={getDraft(r, 'fecha_plan_entrega')}
                      onChange={(e) => setDraft(r, 'fecha_plan_entrega', e.target.value)}
                      disabled={isBusy}
                    />
                    {r.fecha_plan_entrega ? <div className="pp-hint">Guardada: {formatDate(r.fecha_plan_entrega)}</div> : null}
                  </td>
                  {canAdminAuth ? (
                    <td>
                      {authAdmin ? (
                        <span className="pp-badge pp-badge--ok">Autorizado</span>
                      ) : (
                        <button className="btn btn--brand" type="button" onClick={() => openAdminModal(r)} disabled={savingId === id || sendingId === id}>
                          Autorizar
                        </button>
                      )}
                    </td>
                  ) : null}
                  {canAdminAuth ? <td style={{ width: 190, maxWidth: 190 }}>{renderAccionesAdmin(r)}</td> : null}
                  <td>
                    {dirty ? <span className="pp-badge pp-badge--warn">Sin guardar</span> : enviado ? <span className="pp-badge pp-badge--ok">En producción</span> : <span className="pp-badge pp-badge--muted">Pendiente</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => saveDates(r)}
                        disabled={!dirty || isBusy}
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
              <tr><td colSpan={canAdminAuth ? 11 : 9} style={{ padding: 12, color: '#6b7280', fontSize: 12 }}>No hay iPanels para mostrar.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {canAdminAuth ? (
        <AdminAuthModal
          open={adminModalOpen}
          row={adminModalRow}
          busy={adminModalBusy}
          onClose={closeAdminModal}
          onSubmit={submitAdminAuth}
        />
      ) : null}
    </div>
  );
}


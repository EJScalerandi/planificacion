// src/components/UserAdminDashboard.jsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchUsers, createUser, updateUser, setUserPassword, fetchScopes } from '../api';

import UserUpsertModal from './modals/UserUpsertModal';
import ChangePasswordModal from './modals/ChangePasswordModal';

function ciIncludes(haystack, needle) {
  return String(haystack || '').toLowerCase().includes(String(needle || '').toLowerCase());
}

function toBool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  const s = String(v ?? '').trim().toLowerCase();
  if (['true', '1', 'si', 'sí', 'yes', 'y'].includes(s)) return true;
  if (['false', '0', 'no', 'n'].includes(s)) return false;
  return false;
}

function scopeToStr(s) {
  if (s == null) return '';
  if (typeof s === 'string') return s.trim();
  if (typeof s === 'number' || typeof s === 'boolean') return String(s);
  // objetos típicos: { key }, { code }, { stage_key }, { scope }, etc.
  const cand =
    s.key ??
    s.code ??
    s.scope ??
    s.stage_key ??
    s.name ??
    s.label ??
    s.id;
  return String(cand ?? '').trim();
}

function normalizeUser(u) {
  const obj = u || {};

  // Activo: soporta active / is_active / isActive
  const activeRaw =
    obj.active !== undefined ? obj.active : obj.is_active !== undefined ? obj.is_active : obj.isActive;
  const active = toBool(activeRaw);

  // Nombre: soporta full_name / name
  const full_name = obj.full_name ?? obj.name ?? '';

  // Scopes: soporta array de strings u objetos
  let scopes = [];
  if (Array.isArray(obj.scopes)) {
    scopes = obj.scopes.map(scopeToStr).filter(Boolean);
  }

  return {
    ...obj,
    full_name,
    active,
    scopes,
    // opcional: dejamos también is_active por compatibilidad visual/debug
    is_active: obj.is_active ?? active,
    isActive: obj.isActive ?? active,
  };
}

export default function UserAdminDashboard() {
  const [users, setUsers] = useState([]);
  const [scopes, setScopes] = useState([]);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const [q, setQ] = useState('');
  const [onlyActive, setOnlyActive] = useState(false);

  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  // Modales
  const [upsertOpen, setUpsertOpen] = useState(false);
  const [upsertMode, setUpsertMode] = useState('create'); // create|edit
  const [upsertUser, setUpsertUser] = useState(null);
  const [upsertBusy, setUpsertBusy] = useState(false);

  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwdUser, setPwdUser] = useState(null);
  const [pwdBusy, setPwdBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [uRes, sRes] = await Promise.all([fetchUsers(), fetchScopes()]);
      const list = Array.isArray(uRes?.data) ? uRes.data : uRes?.data ? [uRes.data] : [];
      setUsers(list.map(normalizeUser));

      const scopesList = Array.isArray(sRes?.data) ? sRes.data : sRes?.data ? [sRes.data] : [];
      setScopes(scopesList);
    } catch (e) {
      setErr(e?.response?.data?.error || e?.message || 'Error cargando usuarios');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = String(q || '').trim().toLowerCase();
    return (users || []).filter((u) => {
      const nu = normalizeUser(u);

      if (onlyActive && !nu.active) return false;
      if (!needle) return true;

      const scopesText = Array.isArray(nu.scopes) ? nu.scopes.join(' ') : '';
      return (
        ciIncludes(nu.username, needle) ||
        ciIncludes(nu.full_name, needle) ||
        ciIncludes(nu.email, needle) ||
        ciIncludes(scopesText, needle)
      );
    });
  }, [users, q, onlyActive]);

  useEffect(() => setPage(1), [q, onlyActive, pageSize]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const startIdx = (safePage - 1) * pageSize;
  const endIdx = Math.min(total, startIdx + pageSize);
  const paged = useMemo(() => filtered.slice(startIdx, endIdx), [filtered, startIdx, endIdx]);

  const openCreate = () => {
    setUpsertMode('create');
    setUpsertUser(null);
    setUpsertOpen(true);
  };

  const openEdit = (u) => {
    setUpsertMode('edit');
    setUpsertUser(normalizeUser(u));
    setUpsertOpen(true);
  };

  const closeUpsert = () => {
    if (upsertBusy) return;
    setUpsertOpen(false);
    setUpsertUser(null);
  };

  const submitUpsert = async (payload) => {
    setUpsertBusy(true);
    try {
      const safeScopes = Array.isArray(payload?.scopes) ? payload.scopes.map(scopeToStr).filter(Boolean) : [];

      if (upsertMode === 'create') {
        // mandamos variantes por compatibilidad
        const createPayload = {
          ...payload,
          full_name: payload?.full_name ?? payload?.name ?? '',
          name: payload?.name ?? payload?.full_name ?? '',
          active: Boolean(payload?.active),
          is_active: Boolean(payload?.active),
          isActive: Boolean(payload?.active),
          scopes: safeScopes,
        };

        const res = await createUser(createPayload);
        const created = normalizeUser(res?.data);
        setUsers((prev) => [created, ...(prev || [])]);
      } else {
        const id = upsertUser?.id;
        if (!id) return;

        const patch = {
          full_name: payload?.full_name ?? payload?.name ?? '',
          name: payload?.name ?? payload?.full_name ?? '',
          email: payload?.email ?? null,

          // mandamos variantes por compatibilidad
          active: Boolean(payload?.active),
          is_active: Boolean(payload?.active),
          isActive: Boolean(payload?.active),

          scopes: safeScopes,
        };

        const res = await updateUser(id, patch);
        const updated = normalizeUser(res?.data);
        setUsers((prev) => (prev || []).map((x) => (x.id === id ? updated : x)));
      }

      closeUpsert();
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || 'Error guardando usuario');
    } finally {
      setUpsertBusy(false);
    }
  };

  const openChangePassword = (u) => {
    setPwdUser(normalizeUser(u));
    setPwdOpen(true);
  };

  const closePwd = () => {
    if (pwdBusy) return;
    setPwdOpen(false);
    setPwdUser(null);
  };

  const submitPwd = async (payload) => {
    const id = pwdUser?.id;
    if (!id) return;

    setPwdBusy(true);
    try {
      await setUserPassword(id, payload);
      closePwd();
      alert('Contraseña actualizada.');
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || 'Error cambiando contraseña');
    } finally {
      setPwdBusy(false);
    }
  };

  const toggleActive = async (u) => {
    const nu = normalizeUser(u);
    const id = nu?.id;
    if (!id) return;

    const next = !Boolean(nu.active);
    try {
      const res = await updateUser(id, { active: next, is_active: next, isActive: next });
      const updated = normalizeUser(res?.data);
      setUsers((prev) => (prev || []).map((x) => (x.id === id ? updated : x)));
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || 'Error cambiando estado');
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <div className="ua-card">
        <div className="ua-headerRow">
          <h2 className="ua-title">Administración de Usuarios</h2>

          <div className="ua-headerActions">
            <button className="btn" onClick={load} disabled={loading}>
              Recargar
            </button>
            <button className="btn btn--brand" onClick={openCreate} disabled={loading}>
              Crear usuario
            </button>
          </div>
        </div>

        {err ? (
          <div className="ua-alert">
            <b>Error:</b> {err}
          </div>
        ) : null}

        <div className="ua-filtersRow">
          <input
            className="ua-input"
            style={{ width: 320 }}
            placeholder="Buscar por usuario, nombre, email o scope…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <label className="ua-toggle">
            <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
            <span>Solo activos</span>
          </label>

          <div style={{ marginLeft: 'auto', fontSize: 12, color: '#374151' }}>
            {loading ? 'Cargando…' : `Usuarios: ${total}`}
          </div>
        </div>

        <div className="ua-tableWrap">
          <table className="ua-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Nombre</th>
                <th>Email</th>
                <th>Scopes</th>
                <th>Estado</th>
                <th style={{ width: 280 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((u0) => {
                const u = normalizeUser(u0);

                return (
                  <tr key={u.id}>
                    <td className="ua-mono">{u.username}</td>
                    <td>{u.full_name || '-'}</td>
                    <td>{u.email || '-'}</td>
                    <td>
                      {Array.isArray(u.scopes) && u.scopes.length ? (
                        <div className="ua-scopesInline">
                          {u.scopes.map((s) => (
                            <span key={s} className="ua-pill">
                              {s}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="ua-muted">Sin scopes</span>
                      )}
                    </td>
                    <td>
                      {u.active ? (
                        <span className="ua-badge ua-badge--ok">Activo</span>
                      ) : (
                        <span className="ua-badge">Inactivo</span>
                      )}
                    </td>
                    <td>
                      <div className="ua-actions">
                        <button className="btn" onClick={() => openEdit(u)}>
                          Editar
                        </button>
                        <button className="btn" onClick={() => openChangePassword(u)}>
                          Cambiar contraseña
                        </button>
                        <button className="btn" onClick={() => toggleActive(u)}>
                          {u.active ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!loading && paged.length === 0 ? (
                <tr>
                  <td colSpan={6} className="ua-empty">
                    No hay usuarios para mostrar.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="ua-footerRow">
          <div style={{ fontSize: 12, color: '#374151' }}>
            Mostrando <b>{total ? startIdx + 1 : 0}</b>–<b>{endIdx}</b> de <b>{total}</b>
          </div>

          <label style={{ fontSize: 12 }}>
            Tamaño
            <select
              className="ua-select"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              style={{ width: 120, marginLeft: 8 }}
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <button className="btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}>
            Anterior
          </button>

          <div style={{ fontSize: 12, color: '#374151' }}>
            Página <b>{safePage}</b> / <b>{pageCount}</b>
          </div>

          <button
            className="btn"
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={safePage >= pageCount}
          >
            Siguiente
          </button>
        </div>
      </div>

      {/* Modales */}
      <UserUpsertModal
        open={upsertOpen}
        mode={upsertMode}
        user={upsertUser}
        scopes={scopes}
        busy={upsertBusy}
        onClose={closeUpsert}
        onSubmit={submitUpsert}
      />

      <ChangePasswordModal open={pwdOpen} user={pwdUser} busy={pwdBusy} onClose={closePwd} onSubmit={submitPwd} />
    </div>
  );
}

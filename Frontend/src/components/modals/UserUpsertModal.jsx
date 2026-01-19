// src/components/modals/UserUpsertModal.jsx
import React, { useEffect, useMemo, useState } from 'react';

function isNonEmpty(s) {
  return String(s || '').trim().length > 0;
}

export default function UserUpsertModal({ open, mode, user, scopes, busy, onClose, onSubmit }) {
  // mode: 'create' | 'edit'
  const isCreate = mode === 'create';

  const initial = useMemo(() => {
    const u = user || {};
    return {
      username: u.username || '',
      full_name: u.full_name || '',
      email: u.email || '',
      active: u.active ?? true,
      scopes: Array.isArray(u.scopes) ? u.scopes : [],
      // solo en create
      password: '',
      password2: '',
    };
  }, [user]);

  const [form, setForm] = useState(initial);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial);
      setTouched(false);
    }
  }, [open, initial]);

  if (!open) return null;

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const errors = {};
  if (isCreate) {
    if (!isNonEmpty(form.username)) errors.username = 'Obligatorio';
    if (!isNonEmpty(form.full_name)) errors.full_name = 'Obligatorio';
    if (!isNonEmpty(form.password)) errors.password = 'Obligatorio';
    if (String(form.password || '').length < 6) errors.password = 'Mínimo 6 caracteres';
    if (form.password !== form.password2) errors.password2 = 'No coincide';
  } else {
    // edit
    if (!isNonEmpty(form.full_name)) errors.full_name = 'Obligatorio';
  }

  const canSubmit = Object.keys(errors).length === 0 && !busy;

  const submit = () => {
    setTouched(true);
    if (!canSubmit) return;

    const payload = {
      username: String(form.username || '').trim(),
      full_name: String(form.full_name || '').trim(),
      email: String(form.email || '').trim() || null,
      active: Boolean(form.active),
      scopes: Array.isArray(form.scopes) ? form.scopes : [],
    };

    if (isCreate) {
      payload.password = form.password;
    }

    onSubmit?.(payload);
  };

  return (
    <div className="ua-modalOverlay" onMouseDown={onClose}>
      <div className="ua-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ua-modalHeader">
          <div className="ua-modalTitle">{isCreate ? 'Crear usuario' : 'Editar usuario'}</div>
          <button className="btn" onClick={onClose} disabled={busy}>
            Cerrar
          </button>
        </div>

        <div className="ua-modalBody">
          {isCreate ? (
            <div className="ua-field">
              <label className="ua-label">Usuario (login) *</label>
              <input
                className="ua-input"
                value={form.username}
                onChange={(e) => setField('username', e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder="ej: jgomez"
                disabled={busy}
              />
              {touched && errors.username ? <div className="ua-error">{errors.username}</div> : null}
            </div>
          ) : (
            <div className="ua-field">
              <label className="ua-label">Usuario (login)</label>
              <input className="ua-input" value={form.username} disabled />
              <div className="ua-hint">No se modifica el username.</div>
            </div>
          )}

          <div className="ua-grid2">
            <div className="ua-field">
              <label className="ua-label">Nombre completo *</label>
              <input
                className="ua-input"
                value={form.full_name}
                onChange={(e) => setField('full_name', e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder="Nombre y apellido"
                disabled={busy}
              />
              {touched && errors.full_name ? <div className="ua-error">{errors.full_name}</div> : null}
            </div>

            <div className="ua-field">
              <label className="ua-label">Email</label>
              <input
                className="ua-input"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
                placeholder="opcional"
                disabled={busy}
              />
            </div>
          </div>

          <div className="ua-field">
            <label className="ua-label">Alcances (scopes)</label>
            <div className="ua-scopesBox">
              {(scopes || []).map((s) => {
                const checked = form.scopes.includes(s);
                return (
                  <label key={s} className="ua-scopeItem">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? Array.from(new Set([...form.scopes, s]))
                          : form.scopes.filter((x) => x !== s);
                        setField('scopes', next);
                      }}
                      disabled={busy}
                    />
                    <span>{s}</span>
                  </label>
                );
              })}
              {!scopes?.length ? <div className="ua-hint">No hay scopes disponibles.</div> : null}
            </div>
          </div>

          <div className="ua-field">
            <label className="ua-label">Estado</label>
            <label className="ua-toggle">
              <input
                type="checkbox"
                checked={Boolean(form.active)}
                onChange={(e) => setField('active', e.target.checked)}
                disabled={busy}
              />
              <span>{form.active ? 'Activo' : 'Inactivo'}</span>
            </label>
          </div>

          {isCreate ? (
            <div className="ua-grid2">
              <div className="ua-field">
                <label className="ua-label">Password inicial *</label>
                <input
                  className="ua-input"
                  type="password"
                  value={form.password}
                  onChange={(e) => setField('password', e.target.value)}
                  onBlur={() => setTouched(true)}
                  disabled={busy}
                />
                {touched && errors.password ? <div className="ua-error">{errors.password}</div> : null}
              </div>

              <div className="ua-field">
                <label className="ua-label">Repetir password *</label>
                <input
                  className="ua-input"
                  type="password"
                  value={form.password2}
                  onChange={(e) => setField('password2', e.target.value)}
                  onBlur={() => setTouched(true)}
                  disabled={busy}
                />
                {touched && errors.password2 ? <div className="ua-error">{errors.password2}</div> : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="ua-modalFooter">
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="btn btn--brand" onClick={submit} disabled={!canSubmit}>
            {busy ? 'Guardando…' : isCreate ? 'Crear' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

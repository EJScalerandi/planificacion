// src/components/modals/ChangePasswordModal.jsx
import React, { useEffect, useMemo, useState } from 'react';

function isNonEmpty(s) {
  return String(s || '').trim().length > 0;
}

export default function ChangePasswordModal({ open, user, busy, onClose, onSubmit }) {
  const initial = useMemo(() => ({ password: '', password2: '' }), []);
  const [form, setForm] = useState(initial);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial);
      setTouched(false);
    }
  }, [open, initial]);

  if (!open) return null;

  const errors = {};
  if (!isNonEmpty(form.password)) errors.password = 'Obligatorio';
  if (String(form.password || '').length < 6) errors.password = 'Mínimo 6 caracteres';
  if (form.password !== form.password2) errors.password2 = 'No coincide';

  const canSubmit = Object.keys(errors).length === 0 && !busy;

  const submit = () => {
    setTouched(true);
    if (!canSubmit) return;
    onSubmit?.({ password: form.password });
  };

  return (
    <div className="ua-modalOverlay" onMouseDown={onClose}>
      <div className="ua-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ua-modalHeader">
          <div className="ua-modalTitle">Cambiar contraseña</div>
          <button className="btn" onClick={onClose} disabled={busy}>
            Cerrar
          </button>
        </div>

        <div className="ua-modalBody">
          <div className="ua-hint" style={{ marginBottom: 10 }}>
            Usuario: <b>{user?.username || '-'}</b>
          </div>

          <div className="ua-grid2">
            <div className="ua-field">
              <label className="ua-label">Nueva contraseña *</label>
              <input
                className="ua-input"
                type="password"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                onBlur={() => setTouched(true)}
                disabled={busy}
              />
              {touched && errors.password ? <div className="ua-error">{errors.password}</div> : null}
            </div>

            <div className="ua-field">
              <label className="ua-label">Repetir contraseña *</label>
              <input
                className="ua-input"
                type="password"
                value={form.password2}
                onChange={(e) => setForm((p) => ({ ...p, password2: e.target.value }))}
                onBlur={() => setTouched(true)}
                disabled={busy}
              />
              {touched && errors.password2 ? <div className="ua-error">{errors.password2}</div> : null}
            </div>
          </div>
        </div>

        <div className="ua-modalFooter">
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="btn btn--brand" onClick={submit} disabled={!canSubmit}>
            {busy ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
      </div>
    </div>
  );
}

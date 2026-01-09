import React, { useEffect, useMemo, useState } from 'react';
import BaseModal from './BaseModal';

export default function AdminAuthModal({ open, row, onClose, onSubmit, busy }) {
  const data = row?.data || {};

  // Key persistido para la respuesta del form
  const KEYS = useMemo(
    () => ({
      enRegla: 'admin_cliente_en_regla', // boolean
    }),
    []
  );

  const [enRegla, setEnRegla] = useState(false);
  const [touched, setTouched] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;

    // Prefill: si ya estaba guardado, lo traemos
    setEnRegla(Boolean(data[KEYS.enRegla]));
    setTouched(false);
    setFormError('');
  }, [open, data, KEYS]);

  const canAuthorize = Boolean(enRegla);

  const submit = async () => {
    setFormError('');
    setTouched(true);

    if (!canAuthorize) {
      setFormError('Para autorizar, el cliente debe estar en regla (responder “Sí”).');
      return;
    }

    const patch = {
      [KEYS.enRegla]: true,

      // bandera final
      auth_admin: true,

      // auditoría opcional
      auth_admin_at: new Date().toISOString(),
    };

    await onSubmit?.(patch);
  };

  return (
    <BaseModal
      open={open}
      onClose={busy ? undefined : onClose}
      title="Autorización Administración"
      subtitle={row?.id ? `ID: ${row.id}` : ''}
    >
      <form
        className="pp-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="pp-field">
          <div className="pp-label">
            ¿El cliente tiene todo en regla para poder comenzar el despacho del producto? <span className="pp-req">*</span>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`pp-btnCell ${enRegla ? 'pp-btnCell--brand' : ''}`}
              onClick={() => {
                setEnRegla(true);
                setTouched(true);
                setFormError('');
              }}
              disabled={busy}
              title="Sí, está en regla"
            >
              Sí
            </button>

            <button
              type="button"
              className={`pp-btnCell ${!enRegla ? 'pp-btnCell--danger' : ''}`}
              onClick={() => {
                setEnRegla(false);
                setTouched(true);
              }}
              disabled={busy}
              title="No está en regla"
            >
              No
            </button>
          </div>

          <div className="pp-help">
            Solo se puede autorizar si la respuesta es <b>Sí</b>.
          </div>

          {touched && !enRegla ? (
            <div className="pp-errorText">Debe estar marcado “Sí” para autorizar.</div>
          ) : null}
        </div>

        {formError ? <div className="pp-errorText">{formError}</div> : null}

        <div className="pp-modal__footer">
          <button type="button" className="btn pp-btnCell" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--brand pp-btnCell" disabled={busy || !canAuthorize}>
            {busy ? 'Guardando…' : 'Autorizar'}
          </button>
        </div>
      </form>
    </BaseModal>
  );
}

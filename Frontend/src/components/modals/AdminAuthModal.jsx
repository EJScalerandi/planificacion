import React, { useEffect, useMemo, useState } from 'react';
import BaseModal from './BaseModal';

export default function AdminAuthModal({ open, row, onClose, onSubmit, busy }) {
  const data = row?.data || {};

  // Keys persistidas para la respuesta del form
  const KEYS = useMemo(
    () => ({
      enRegla: 'admin_cliente_en_regla', // boolean
      acciones: 'admin_acciones', // boolean
      accionesDetalle: 'admin_acciones_detalle', // string | null
    }),
    []
  );

  const [enRegla, setEnRegla] = useState(false);
  const [acciones, setAcciones] = useState(false);
  const [accionesDetalle, setAccionesDetalle] = useState('');
  const [touched, setTouched] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;

    // Prefill: si ya estaba guardado, lo traemos.
    // Acciones queda por defecto en No cuando no existe dato previo.
    setEnRegla(Boolean(data[KEYS.enRegla]));
    setAcciones(Boolean(data[KEYS.acciones]));
    setAccionesDetalle(String(data[KEYS.accionesDetalle] ?? ''));
    setTouched(false);
    setFormError('');
  }, [open, data, KEYS]);

  const detalleAcciones = acciones ? String(accionesDetalle || '').trim() : '';
  const canAuthorize = Boolean(enRegla) && (!acciones || Boolean(detalleAcciones));

  const submit = async () => {
    setFormError('');
    setTouched(true);

    if (!enRegla) {
      setFormError('Para autorizar, el cliente debe estar en regla (responder “Sí”).');
      return;
    }

    if (acciones && !detalleAcciones) {
      setFormError('Si marcás Acciones en “Sí”, cargá el detalle.');
      return;
    }

    const patch = {
      [KEYS.enRegla]: true,
      [KEYS.acciones]: Boolean(acciones),
      [KEYS.accionesDetalle]: acciones ? detalleAcciones : null,

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

        <div className="pp-field">
          <div className="pp-label">Acciones</div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`pp-btnCell ${acciones ? 'pp-btnCell--brand' : ''}`}
              onClick={() => {
                setAcciones(true);
                setTouched(true);
                setFormError('');
              }}
              disabled={busy}
              title="Sí, requiere acciones"
            >
              Sí
            </button>

            <button
              type="button"
              className={`pp-btnCell ${!acciones ? 'pp-btnCell--danger' : ''}`}
              onClick={() => {
                setAcciones(false);
                setAccionesDetalle('');
                setTouched(true);
                setFormError('');
              }}
              disabled={busy}
              title="No requiere acciones"
            >
              No
            </button>
          </div>

          <div className="pp-help">
            Por defecto queda en <b>No</b>. Si se marca <b>Sí</b>, se habilita el detalle.
          </div>

          {acciones ? (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
              <span className="pp-label" style={{ margin: 0 }}>
                Detalle / observación de acciones <span className="pp-req">*</span>
              </span>
              <textarea
                className="pp-input"
                value={accionesDetalle}
                onChange={(e) => setAccionesDetalle(e.target.value)}
                disabled={busy}
                rows={4}
                placeholder="Escribí el detalle de las acciones administrativas..."
                style={{ width: '100%', resize: 'vertical', minHeight: 84 }}
              />
            </label>
          ) : null}

          {touched && acciones && !detalleAcciones ? (
            <div className="pp-errorText">Cargá el detalle para guardar Acciones en “Sí”.</div>
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

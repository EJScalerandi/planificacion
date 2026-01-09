import React, { useEffect, useMemo, useState } from 'react';
import BaseModal from './BaseModal';

function isEmailLike(s) {
  const v = String(s || '').trim();
  if (!v) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function isUrlLike(s) {
  const v = String(s || '').trim();
  if (!v) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function LogisticaAuthModal({ open, row, onClose, onSubmit, busy }) {
  const data = row?.data || {};

  // Keys donde vamos a guardar (persistencia en preproduccion via patch)
  const KEYS = useMemo(
    () => ({
      nombreCliente: 'logistica_nombre_cliente',
      fechaContacto: 'logistica_fecha_contacto',
      mapsUrl: 'logistica_maps_url',
      email: 'logistica_email',
    }),
    []
  );

  const [nombreCliente, setNombreCliente] = useState('');
  const [fechaContacto, setFechaContacto] = useState('');
  const [mapsUrl, setMapsUrl] = useState('');
  const [email, setEmail] = useState('');

  const [touched, setTouched] = useState({});
  const [formError, setFormError] = useState('');

  // Prefill cuando abre
  useEffect(() => {
    if (!open) return;

    setNombreCliente(String(data[KEYS.nombreCliente] ?? ''));
    setFechaContacto(String(data[KEYS.fechaContacto] ?? ''));
    setMapsUrl(String(data[KEYS.mapsUrl] ?? ''));
    setEmail(String(data[KEYS.email] ?? ''));

    setTouched({});
    setFormError('');
  }, [open, row, KEYS, data]);

  const errors = useMemo(() => {
    const e = {};

    if (!String(nombreCliente || '').trim()) e.nombreCliente = 'Obligatorio';
    if (!String(fechaContacto || '').trim()) e.fechaContacto = 'Obligatorio';

    // maps url obligatorio y con formato válido
    if (!String(mapsUrl || '').trim()) e.mapsUrl = 'Obligatorio';
    else if (!isUrlLike(mapsUrl)) e.mapsUrl = 'Debe ser una URL válida (https://...)';

    if (!String(email || '').trim()) e.email = 'Obligatorio';
    else if (!isEmailLike(email)) e.email = 'Email inválido';

    return e;
  }, [nombreCliente, fechaContacto, mapsUrl, email]);

  const hasErrors = Object.keys(errors).length > 0;

  const submit = async () => {
    setFormError('');

    // marcar todo como tocado para mostrar errores
    setTouched({ nombreCliente: true, fechaContacto: true, mapsUrl: true, email: true });

    if (hasErrors) {
      setFormError('Revisá los campos obligatorios.');
      return;
    }

    const patch = {
      [KEYS.nombreCliente]: String(nombreCliente).trim(),
      [KEYS.fechaContacto]: String(fechaContacto).trim(), // 'YYYY-MM-DD'
      [KEYS.mapsUrl]: String(mapsUrl).trim(),
      [KEYS.email]: String(email).trim(),

      // bandera final
      auth_logistica: true,

      // opcional: auditoría
      auth_logistica_at: new Date().toISOString(),
    };

    await onSubmit?.(patch);
  };

  const fieldClass = (key, base = 'pp-input') =>
    `${base}${touched[key] && errors[key] ? ` ${base}--error pp-input--error` : ''}`.replace(/\s+/g, ' ').trim();

  return (
    <BaseModal
      open={open}
      onClose={busy ? undefined : onClose}
      title="Autorización Logística"
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
            Nombre del cliente <span className="pp-req">*</span>
          </div>
          <input
            className={fieldClass('nombreCliente')}
            value={nombreCliente}
            onChange={(e) => setNombreCliente(e.target.value)}
            onBlur={() => setTouched((p) => ({ ...p, nombreCliente: true }))}
            placeholder="Ej: Juan Pérez / Empresa SA"
          />
          {touched.nombreCliente && errors.nombreCliente ? <div className="pp-errorText">{errors.nombreCliente}</div> : null}
        </div>

        <div className="pp-field">
          <div className="pp-label">
            Fecha de contacto con el cliente <span className="pp-req">*</span>
          </div>
          <input
            type="date"
            className={fieldClass('fechaContacto')}
            value={fechaContacto}
            onChange={(e) => setFechaContacto(e.target.value)}
            onBlur={() => setTouched((p) => ({ ...p, fechaContacto: true }))}
          />
          {touched.fechaContacto && errors.fechaContacto ? <div className="pp-errorText">{errors.fechaContacto}</div> : null}
        </div>

        <div className="pp-field">
          <div className="pp-label">
            Punto ubicación (URL Google Maps) <span className="pp-req">*</span>
          </div>
          <input
            className={fieldClass('mapsUrl')}
            value={mapsUrl}
            onChange={(e) => setMapsUrl(e.target.value)}
            onBlur={() => setTouched((p) => ({ ...p, mapsUrl: true }))}
            placeholder="https://maps.google.com/?q=..."
          />
          <div className="pp-help">Pegá el link completo de Google Maps (https://...).</div>
          {touched.mapsUrl && errors.mapsUrl ? <div className="pp-errorText">{errors.mapsUrl}</div> : null}
        </div>

        <div className="pp-field">
          <div className="pp-label">
            Dirección de Email <span className="pp-req">*</span>
          </div>
          <input
            className={fieldClass('email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched((p) => ({ ...p, email: true }))}
            placeholder="cliente@dominio.com"
          />
          {touched.email && errors.email ? <div className="pp-errorText">{errors.email}</div> : null}
        </div>

        {formError ? <div className="pp-errorText">{formError}</div> : null}

        <div className="pp-modal__footer">
          <button type="button" className="btn pp-btnCell" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--brand pp-btnCell" disabled={busy}>
            {busy ? 'Guardando…' : 'Autorizar'}
          </button>
        </div>
      </form>
    </BaseModal>
  );
}

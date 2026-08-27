// src/components/modals/LogisticaMensajeViajeModal.jsx
//
// Mensaje de texto (borrador) para mandarle a la cuadrilla de un viaje por
// WhatsApp - transitorio, mientras la cuadrilla no tenga la info directo en
// una app propia. Es editable: hay datos (teléfono del distribuidor, notas
// puntuales de una parada) que no están sistematizados en ningún lado, el
// usuario los completa a mano antes de copiar/mandar.
import React, { useEffect, useState } from 'react';
import { fetchLogisticaMensajeViaje } from '../../api';

export default function LogisticaMensajeViajeModal({ open, viajeId, titulo, onClose }) {
  const [texto, setTexto] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!open || !viajeId) return;
    setErr('');
    setCopiado(false);
    setLoading(true);
    fetchLogisticaMensajeViaje(viajeId)
      .then((data) => setTexto(data?.texto || ''))
      .catch((e) => setErr(e?.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, [open, viajeId]);

  if (!open) return null;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErr('No se pudo copiar automáticamente - seleccioná el texto a mano.');
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div style={{ width: 'min(560px, 100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.25)', padding: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 900 }}>📋 Mensaje para la cuadrilla{titulo ? ` · ${titulo}` : ''}</div>
          <button className="btn" style={{ marginLeft: 'auto' }} onClick={onClose}>Cerrar</button>
        </div>

        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 8 }}>
          Borrador armado con los datos ya cargados. Revisalo antes de mandarlo — hay cosas que no están
          sistematizadas (ej. teléfono del distribuidor, notas puntuales de una parada) y quedan para completar a mano.
        </div>

        {err ? <div style={{ color: 'crimson', fontWeight: 800, fontSize: 12, marginBottom: 8 }}>{err}</div> : null}

        {loading ? (
          <div style={{ opacity: 0.75, fontSize: 13 }}>Armando el mensaje…</div>
        ) : (
          <>
            <textarea
              className="pp-input"
              style={{ flex: '1 1 auto', minHeight: 360, fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5, resize: 'vertical', whiteSpace: 'pre' }}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            <div style={{ marginTop: 10 }}>
              <button className="btn btn--brand" onClick={copiar}>{copiado ? '✅ Copiado' : '📋 Copiar'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

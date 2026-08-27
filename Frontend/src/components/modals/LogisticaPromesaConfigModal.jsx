// src/components/modals/LogisticaPromesaConfigModal.jsx
//
// Config de "semana prometida": cuántas semanas después de la semana de
// producción ya reservada por el Presupuestador (production_delivery_week,
// lo mismo que se le muestra al cliente como "Fin de producción estimada")
// se considera que toca el viaje.
import React, { useEffect, useState } from 'react';
import { fetchLogisticaPromesaConfig, updateLogisticaPromesaConfig } from '../../api';

export default function LogisticaPromesaConfigModal({ open, onClose, onChanged }) {
  const [semanas, setSemanas] = useState('1');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErr('');
    setSaved(false);
    setLoading(true);
    fetchLogisticaPromesaConfig()
      .then((data) => setSemanas(String(data?.config?.semanas_despues_produccion ?? 1)))
      .catch((e) => setErr(e?.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const guardar = async () => {
    setBusy(true);
    setErr('');
    setSaved(false);
    try {
      await updateLogisticaPromesaConfig({ semanas_despues_produccion: Number(semanas) });
      setSaved(true);
      onChanged?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div style={{ width: 'min(480px, 100%)', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.18)', padding: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 900 }}>📅 Config de "semana prometida"</div>
          <button className="btn" style={{ marginLeft: 'auto' }} onClick={onClose}>Cerrar</button>
        </div>

        <div style={{ fontSize: 12, color: 'var(--muted, #6b7280)', marginBottom: 12 }}>
          La "semana prometida" del viaje de un NV es la semana de producción que ya calculó y reservó el
          Presupuestador (lo mismo que se le muestra al cliente como "Fin de producción estimada") más este
          margen. Con margen 1, un NV con producción reservada para la semana 40 aparece en la semana 41.
        </div>

        {err ? <div style={{ color: 'crimson', fontWeight: 800, fontSize: 12, marginBottom: 8 }}>{err}</div> : null}
        {saved ? <div style={{ color: '#0a6a33', fontWeight: 800, fontSize: 12, marginBottom: 8 }}>Guardado.</div> : null}

        {loading ? (
          <div style={{ opacity: 0.75, fontSize: 13 }}>Cargando…</div>
        ) : (
          <>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, marginBottom: 12 }}>
              Semanas de margen después de producción
              <input className="pp-input" type="number" min={0} style={{ width: 120 }} value={semanas} onChange={(e) => setSemanas(e.target.value)} />
            </label>
            <button className="btn btn--brand" disabled={busy} onClick={guardar}>{busy ? 'Guardando…' : 'Guardar'}</button>
          </>
        )}
      </div>
    </div>
  );
}

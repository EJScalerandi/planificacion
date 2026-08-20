// src/components/modals/ServicioTecnicoIaConfigModal.jsx
//
// Espejo de LogisticaIaConfigModal.jsx: prompt del sistema (criterio de la
// IA) + parámetros operativos (modelo, velocidad de viaje, horas por
// visita/medición) para el motor de recomendación de rutas de Técnica.
import React, { useEffect, useState } from 'react';
import { fetchStIaConfig, updateStIaConfig } from '../../api';

const MODELOS = [
  { value: 'claude-sonnet-5', label: 'Sonnet 5 (recomendado - buen balance costo/calidad)' },
  { value: 'claude-opus-5', label: 'Opus 5 (mejor razonamiento, más caro)' },
];

export default function ServicioTecnicoIaConfigModal({ open, onClose }) {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErr('');
    setSaved(false);
    setLoading(true);
    fetchStIaConfig()
      .then((data) => setForm(data?.config || null))
      .catch((e) => setErr(e?.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const guardar = async () => {
    setBusy(true);
    setErr('');
    setSaved(false);
    try {
      const data = await updateStIaConfig({
        prompt_sistema: form.prompt_sistema,
        modelo: form.modelo,
        velocidad_kmh: Number(form.velocidad_kmh),
        horas_por_visita: Number(form.horas_por_visita),
      });
      setForm(data?.config || form);
      setSaved(true);
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
      <div style={{ width: 'min(760px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.18)', padding: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 900 }}>🤖 Config de IA de Técnica (recomendación de rutas)</div>
          <button className="btn" style={{ marginLeft: 'auto' }} onClick={onClose}>Cerrar</button>
        </div>

        <div style={{ fontSize: 12, color: 'var(--muted, #6b7280)', marginBottom: 10 }}>
          El prompt define cómo razona la IA al recomendar un viaje sobre las solicitudes/mediciones que
          selecciones. Los datos concretos (ubicación, zona, distancias) se calculan siempre en código y se le
          pasan como dato — el prompt es para el criterio, no para los números.
        </div>

        {err ? <div style={{ color: 'crimson', fontWeight: 800, fontSize: 12, marginBottom: 8 }}>{err}</div> : null}
        {saved ? <div style={{ color: '#0a6a33', fontWeight: 800, fontSize: 12, marginBottom: 8 }}>Guardado.</div> : null}

        {loading || !form ? (
          <div style={{ opacity: 0.75, fontSize: 13 }}>Cargando…</div>
        ) : (
          <>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, marginBottom: 10 }}>
              Prompt del sistema
              <textarea
                className="pp-input"
                style={{ minHeight: 260, fontFamily: 'monospace', fontSize: 12, lineHeight: 1.4, resize: 'vertical' }}
                value={form.prompt_sistema}
                onChange={(e) => setForm((f) => ({ ...f, prompt_sistema: e.target.value }))}
              />
            </label>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
                Modelo
                <select className="pp-select" style={{ minWidth: 260 }} value={form.modelo} onChange={(e) => setForm((f) => ({ ...f, modelo: e.target.value }))}>
                  {MODELOS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
                Velocidad de viaje (km/h)
                <input className="pp-input" type="number" style={{ width: 110 }} value={form.velocidad_kmh} onChange={(e) => setForm((f) => ({ ...f, velocidad_kmh: e.target.value }))} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
                Horas por visita/medición
                <input className="pp-input" type="number" style={{ width: 110 }} value={form.horas_por_visita} onChange={(e) => setForm((f) => ({ ...f, horas_por_visita: e.target.value }))} />
              </label>
            </div>

            <div style={{ marginTop: 12 }}>
              <button className="btn btn--brand" disabled={busy} onClick={guardar}>{busy ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

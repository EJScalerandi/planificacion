import { useEffect, useState } from 'react';

export default function PruebaLaserModal({ open, onClose, nextNumero, onCreate }) {
  const [detalle, setDetalle] = useState('');
  const [pasoPorPlegadora, setPasoPorPlegadora] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setDetalle('');
    setPasoPorPlegadora(false);
    setSaving(false);
    setErr('');
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    const destino = pasoPorPlegadora ? 'Corte piernas y después Plegado piernas' : 'Corte piernas';
    if (!window.confirm(`¿Confirmás generar PRUEBA ${nextNumero} en ${destino}?`)) return;
    try {
      setSaving(true);
      setErr('');
      await onCreate?.(detalle.trim(), pasoPorPlegadora);
      onClose?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || 'Error creando la prueba');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 9999 }}
    >
      <div style={{ width: 'min(420px, 100%)', background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', boxShadow: '0 18px 55px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: '#f8fafc' }}>
          <div style={{ fontWeight: 900 }}>Generar Prueba Laser Plano</div>
          <button className="btn" type="button" onClick={onClose}>Cerrar</button>
        </div>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {err && <div style={{ color: 'crimson', fontWeight: 800 }}>{err}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontWeight: 800 }}>Número</span>
            <div style={{ fontSize: 24, fontWeight: 900 }}>PRUEBA {nextNumero}</div>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontWeight: 800 }}>Detalle</span>
            <textarea
              className="btn"
              rows={3}
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              placeholder="Qué se va a probar…"
              style={{ resize: 'vertical' }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={pasoPorPlegadora}
              onChange={(e) => setPasoPorPlegadora(e.target.checked)}
            />
            <span style={{ fontWeight: 800 }}>Paso por Plegadora</span>
          </label>
          <div style={{ opacity: 0.7, fontSize: 12 }}>
            {pasoPorPlegadora
              ? 'Va a generar una orden en Corte piernas y, cuando se apruebe ahí, sigue a Plegado piernas. Recién desaparece cuando también se apruebe ahí.'
              : 'Va a generar una orden en Corte piernas. Cuando se termine y se apruebe el QC ahí, desaparece sola — no sigue a ninguna otra sección.'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn--brand" type="button" onClick={submit} disabled={saving}>
              {saving ? 'Generando…' : 'Generar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

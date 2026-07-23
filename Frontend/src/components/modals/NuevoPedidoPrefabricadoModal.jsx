import { useEffect, useState } from 'react';

export default function NuevoPedidoPrefabricadoModal({ open, onClose, tipos = [], seccion, onCreate }) {
  const [tipoId, setTipoId] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setTipoId(tipos?.[0]?.id != null ? String(tipos[0].id) : '');
    setCantidad(1);
    setSaving(false);
    setErr('');
  }, [open, tipos]);

  if (!open) return null;

  const submit = async () => {
    const id = Number(tipoId);
    const nCantidad = Number(cantidad);
    if (!Number.isInteger(id)) {
      setErr('Elegí un tipo de prefabricado.');
      return;
    }
    if (!Number.isInteger(nCantidad) || nCantidad <= 0) {
      setErr('Ingresá una cantidad válida (entero mayor a 0).');
      return;
    }
    try {
      setSaving(true);
      setErr('');
      await onCreate?.(id, seccion, nCantidad);
      onClose?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || 'Error creando el pedido');
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
      <div style={{ width: 'min(480px, 100%)', background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', boxShadow: '0 18px 55px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: '#f8fafc' }}>
          <div style={{ fontWeight: 900 }}>Nuevo pedido de prefabricado</div>
          <button className="btn" type="button" onClick={onClose}>Cerrar</button>
        </div>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {err && <div style={{ color: 'crimson', fontWeight: 800 }}>{err}</div>}
          {tipos.length === 0 ? (
            <div style={{ opacity: 0.75 }}>No hay tipos de prefabricado habilitados para esta sección.</div>
          ) : (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontWeight: 800 }}>Tipo de prefabricado</span>
              <select className="btn" value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
                {tipos.map((t) => (
                  <option key={t.id} value={String(t.id)}>{t.nombre}</option>
                ))}
              </select>
            </label>
          )}
          {tipos.length > 0 ? (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontWeight: 800 }}>Cantidad</span>
              <input
                className="btn"
                type="number"
                min={1}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
              />
            </label>
          ) : null}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn--brand" type="button" onClick={submit} disabled={saving || !tipos.length}>
              {saving ? 'Creando…' : 'Crear pedido'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

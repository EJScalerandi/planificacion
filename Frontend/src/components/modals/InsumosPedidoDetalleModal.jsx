import { useEffect, useState } from 'react';
import { adminGetInsumosPedido, adminUpdateInsumosPedidoItem } from '../../api';

function formatQty(n) {
  const v = Number(n || 0);
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

const STATUS_LABELS = {
  ABIERTO: 'Abierto',
  CONFIRMADO: 'Confirmado',
  CERRADO: 'Cerrado',
  CERRADO_VACIO: 'Cerrado (vacío — no se confirmó a tiempo)',
};

export default function InsumosPedidoDetalleModal({ open, onClose, pedidoId, onChanged }) {
  const [pedido, setPedido] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [savingItemId, setSavingItemId] = useState(null);

  async function reload() {
    if (!pedidoId) return;
    setLoading(true);
    setErr('');
    try {
      const { data } = await adminGetInsumosPedido(pedidoId);
      setPedido(data);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || 'Error cargando el pedido');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pedidoId]);

  if (!open) return null;

  async function guardarItem(item, patch) {
    try {
      setSavingItemId(item.id);
      setErr('');
      const { data } = await adminUpdateInsumosPedidoItem(pedido.id, item.id, patch);
      setPedido(data);
      onChanged?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || 'Error guardando el cambio');
    } finally {
      setSavingItemId(null);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 9999 }}
    >
      <div style={{ width: 'min(720px, 100%)', maxHeight: '90vh', overflow: 'auto', background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', boxShadow: '0 18px 55px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: '#f8fafc', position: 'sticky', top: 0 }}>
          <div style={{ fontWeight: 900 }}>
            Pedido #{pedido?.id ?? pedidoId} {pedido ? `· ${pedido.seccion} · ${String(pedido.fecha).slice(0, 10)}` : ''}
          </div>
          <button className="btn" type="button" onClick={onClose}>Cerrar</button>
        </div>

        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {err && <div style={{ color: 'crimson', fontWeight: 800 }}>{err}</div>}
          {loading || !pedido ? <div>Cargando…</div> : (
            <>
              <div style={{ fontWeight: 800 }}>
                Estado: {STATUS_LABELS[pedido.status] || pedido.status}
                {pedido.confirmed_by_name ? (
                  <span style={{ opacity: 0.75, fontWeight: 600 }}>
                    {' '}— confirmado por {pedido.confirmed_by_name} a las{' '}
                    {pedido.confirmed_at ? new Date(pedido.confirmed_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </span>
                ) : null}
              </div>

              {(pedido.items || []).length === 0 ? (
                <div style={{ opacity: 0.75 }}>Este pedido no tiene items.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pedido.items.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: 'grid', gridTemplateColumns: '1fr auto auto auto', alignItems: 'center', gap: 10,
                        padding: '8px 10px',
                        border: `1px solid ${item.no_disponible ? '#fecaca' : '#e5e7eb'}`,
                        background: item.no_disponible ? '#fef2f2' : '#fff',
                        borderRadius: 10,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800 }}>{item.producto_nombre}</div>
                        {item.producto_codigo ? <div style={{ fontSize: 12, opacity: 0.7 }}>{item.producto_codigo}</div> : null}
                        {item.is_carryover ? <div style={{ fontSize: 12, color: '#b91c1c', fontWeight: 700 }}>Arrastrado de un pedido anterior</div> : null}
                      </div>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                        <span style={{ fontWeight: 700 }}>Pedido</span>
                        <input
                          className="btn"
                          type="number" min={0} step="any"
                          defaultValue={formatQty(item.cantidad_pedida)}
                          onBlur={(e) => guardarItem(item, { cantidad_pedida: Number(e.target.value) })}
                          style={{ width: 80, textAlign: 'right' }}
                        />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                        <span style={{ fontWeight: 700 }}>Entregado</span>
                        <input
                          className="btn"
                          type="number" min={0} step="any"
                          defaultValue={item.cantidad_entregada != null ? formatQty(item.cantidad_entregada) : ''}
                          onBlur={(e) => guardarItem(item, { cantidad_entregada: e.target.value === '' ? null : Number(e.target.value) })}
                          style={{ width: 80, textAlign: 'right' }}
                        />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
                        <input
                          type="checkbox"
                          checked={!!item.no_disponible}
                          disabled={savingItemId === item.id}
                          onChange={(e) => guardarItem(item, { no_disponible: e.target.checked })}
                        />
                        No disponible
                      </label>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                Marcar "No disponible" hace que ese insumo reaparezca mañana en rojo en el pedido de la misma sección, con la cantidad pendiente (pedido − entregado) pre-cargada.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

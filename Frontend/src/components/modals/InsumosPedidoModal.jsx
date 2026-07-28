import { useEffect, useMemo, useState } from 'react';
import {
  fetchInsumosProductos,
  fetchInsumosPedidoHoy,
  upsertInsumosPedidoItem,
  deleteInsumosPedidoItem,
  confirmInsumosPedido,
} from '../../api';

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

export default function InsumosPedidoModal({ open, onClose, seccion }) {
  const [pedido, setPedido] = useState(null);
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const [productoId, setProductoId] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [savingItem, setSavingItem] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [confirming, setConfirming] = useState(false);

  async function loadAll() {
    setLoading(true);
    setErr('');
    try {
      const [pedidoRes, productosRes] = await Promise.all([
        fetchInsumosPedidoHoy(seccion),
        fetchInsumosProductos(seccion),
      ]);
      setPedido(pedidoRes.data);
      setProductos(productosRes.data || []);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || 'Error cargando el pedido');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setConfirmOpen(false);
    setPin('');
    setErr('');
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seccion]);

  useEffect(() => {
    if (!productos.length) { setProductoId(''); return; }
    setProductoId(String(productos[0].producto_odoo_id));
  }, [productos]);

  const productoSeleccionado = useMemo(
    () => productos.find((p) => String(p.producto_odoo_id) === String(productoId)),
    [productos, productoId]
  );

  if (!open) return null;

  const isAbierto = pedido?.status === 'ABIERTO';
  const items = Array.isArray(pedido?.items) ? pedido.items : [];

  async function handleAgregar() {
    const qty = Number(cantidad);
    if (!productoSeleccionado) { setErr('Elegí un producto.'); return; }
    if (!Number.isFinite(qty) || qty <= 0) { setErr('Ingresá una cantidad válida.'); return; }
    try {
      setSavingItem(true);
      setErr('');
      const { data } = await upsertInsumosPedidoItem(pedido.id, {
        producto_odoo_id: productoSeleccionado.producto_odoo_id,
        producto_nombre: productoSeleccionado.producto_nombre,
        producto_codigo: productoSeleccionado.producto_codigo,
        unidad: productoSeleccionado.unidad,
        categoria_odoo_id: productoSeleccionado.categoria_odoo_id,
        cantidad: qty,
      });
      setPedido(data);
      setCantidad(1);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || 'Error agregando el producto');
    } finally {
      setSavingItem(false);
    }
  }

  async function handleCambiarCantidad(item, nuevaQty) {
    const qty = Number(nuevaQty);
    if (!Number.isFinite(qty) || qty < 0) return;
    try {
      const { data } = await upsertInsumosPedidoItem(pedido.id, {
        producto_odoo_id: item.producto_odoo_id,
        producto_nombre: item.producto_nombre,
        producto_codigo: item.producto_codigo,
        unidad: item.unidad,
        categoria_odoo_id: item.categoria_odoo_id,
        cantidad: qty,
      });
      setPedido(data);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || 'Error actualizando la cantidad');
    }
  }

  async function handleQuitar(item) {
    try {
      const { data } = await deleteInsumosPedidoItem(pedido.id, item.id);
      setPedido(data);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || 'Error quitando el producto');
    }
  }

  async function handleConfirmar() {
    if (!/^\d{3,10}$/.test(String(pin).trim())) { setErr('PIN inválido (solo numérico).'); return; }
    try {
      setConfirming(true);
      setErr('');
      const { data } = await confirmInsumosPedido(pedido.id, pin.trim());
      setPedido(data);
      setConfirmOpen(false);
      setPin('');
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || 'Error confirmando el pedido');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 9999 }}
    >
      <div style={{ width: 'min(640px, 100%)', maxHeight: '90vh', overflow: 'auto', background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', boxShadow: '0 18px 55px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: '#f8fafc', position: 'sticky', top: 0 }}>
          <div style={{ fontWeight: 900 }}>Pedido de insumos del día</div>
          <button className="btn" type="button" onClick={onClose}>Cerrar</button>
        </div>

        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {err && <div style={{ color: 'crimson', fontWeight: 800 }}>{err}</div>}
          {loading ? <div>Cargando…</div> : null}

          {!loading && pedido ? (
            <>
              <div style={{ fontWeight: 800 }}>
                Estado: <span style={{ color: isAbierto ? '#0f766e' : '#334155' }}>{STATUS_LABELS[pedido.status] || pedido.status}</span>
                {pedido.confirmed_by_name ? (
                  <span style={{ opacity: 0.75, fontWeight: 600 }}>
                    {' '}— confirmado por {pedido.confirmed_by_name} a las{' '}
                    {new Date(pedido.confirmed_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                ) : null}
              </div>

              {items.length === 0 ? (
                <div style={{ opacity: 0.75 }}>Todavía no agregaste ningún insumo.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {items.map((item) => {
                    const pendiente = item.is_carryover || item.no_disponible;
                    return (
                      <div
                        key={item.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                          border: `1px solid ${pendiente ? '#fecaca' : '#e5e7eb'}`,
                          background: pendiente ? '#fef2f2' : '#fff',
                          borderRadius: 10,
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 800, color: pendiente ? '#b91c1c' : '#0f172a' }}>{item.producto_nombre}</div>
                          {pendiente ? (
                            <div style={{ fontSize: 12, color: '#b91c1c', fontWeight: 700 }}>
                              Pendiente de entrega anterior — no se entregó la última vez
                            </div>
                          ) : null}
                          {item.producto_codigo ? <div style={{ fontSize: 12, opacity: 0.7 }}>{item.producto_codigo}</div> : null}
                        </div>
                        {isAbierto ? (
                          <input
                            className="btn"
                            type="number"
                            min={0}
                            step="any"
                            defaultValue={formatQty(item.cantidad_pedida)}
                            onBlur={(e) => handleCambiarCantidad(item, e.target.value)}
                            style={{ width: 90, textAlign: 'right' }}
                          />
                        ) : (
                          <div style={{ fontWeight: 800 }}>{formatQty(item.cantidad_pedida)}</div>
                        )}
                        <div style={{ opacity: 0.7, minWidth: 60 }}>{item.unidad || ''}</div>
                        {isAbierto ? (
                          <button className="btn" type="button" onClick={() => handleQuitar(item)} title="Quitar">✕</button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}

              {isAbierto ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap', borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 200 }}>
                    <span style={{ fontWeight: 800 }}>Producto</span>
                    <select className="btn" value={productoId} onChange={(e) => setProductoId(e.target.value)} disabled={!productos.length}>
                      {productos.length === 0 ? <option value="">No hay productos configurados para esta sección</option> : null}
                      {productos.map((p) => (
                        <option key={p.producto_odoo_id} value={String(p.producto_odoo_id)}>{p.producto_nombre}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 100 }}>
                    <span style={{ fontWeight: 800 }}>Cantidad</span>
                    <input className="btn" type="number" min={0} step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
                  </label>
                  <button className="btn btn--brand" type="button" onClick={handleAgregar} disabled={savingItem || !productos.length}>
                    {savingItem ? 'Agregando…' : 'Agregar'}
                  </button>
                </div>
              ) : null}

              {isAbierto ? (
                confirmOpen ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap', borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontWeight: 800 }}>PIN</span>
                      <input
                        className="btn"
                        type="password"
                        inputMode="numeric"
                        autoComplete="off"
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        placeholder="Ej: 1234"
                      />
                    </label>
                    <button className="btn btn--brand" type="button" onClick={handleConfirmar} disabled={confirming}>
                      {confirming ? 'Confirmando…' : 'Confirmar con PIN'}
                    </button>
                    <button className="btn" type="button" onClick={() => setConfirmOpen(false)}>Cancelar</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
                    <button className="btn btn--brand" type="button" onClick={() => setConfirmOpen(true)} disabled={!items.length}>
                      Confirmar pedido
                    </button>
                  </div>
                )
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

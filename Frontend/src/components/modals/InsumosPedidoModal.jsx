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

// Remanente a mostrar/precargar para un item pendiente: en un pedido ABIERTO
// (el unico caso donde esta tabla es editable) un pendiente siempre viene de
// arrastre (is_carryover), con cantidad_pedida YA igual al remanente y
// cantidad_entregada todavia null - restar igual cubre tambien el caso de
// solo-lectura (pedido ya confirmado con una entrega parcial registrada).
function cantidadPendienteDe(item) {
  return Math.max(0, Number(item.cantidad_pedida || 0) - Number(item.cantidad_entregada || 0));
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

  // drafts[producto_odoo_id] = cantidad (string) que se esta editando en la
  // tabla. Se arma una sola vez por producto nuevo (ver efecto abajo) y no se
  // vuelve a pisar con lo que llega del servidor, para no perder lo que el
  // usuario esta tipeando a mitad de guardar otra fila.
  const [drafts, setDrafts] = useState({});

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
    setDrafts({});
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seccion]);

  const items = Array.isArray(pedido?.items) ? pedido.items : [];

  // Catalogo ordenado + items del pedido que ya no esten en el catalogo
  // actual (p. ej. un arrastre de una categoria que despues se desasigno de
  // la seccion) para no hacer desaparecer un pendiente real.
  const filas = useMemo(() => {
    const porCatalogo = [...productos]
      .sort((a, b) => a.producto_nombre.localeCompare(b.producto_nombre))
      .map((p) => ({ producto: p, item: items.find((i) => i.producto_odoo_id === p.producto_odoo_id) || null }));
    const idsCatalogo = new Set(productos.map((p) => p.producto_odoo_id));
    const huerfanas = items
      .filter((i) => !idsCatalogo.has(i.producto_odoo_id))
      .map((i) => ({
        producto: {
          producto_odoo_id: i.producto_odoo_id,
          producto_nombre: i.producto_nombre,
          producto_codigo: i.producto_codigo,
          unidad: i.unidad,
          categoria_odoo_id: i.categoria_odoo_id,
        },
        item: i,
      }));
    return [...porCatalogo, ...huerfanas];
  }, [productos, items]);

  // Arma el draft de cada producto nuevo (precarga el remanente si esta
  // pendiente, o lo ya pedido, o vacio si nunca se pidio). No pisa un draft
  // que ya existe - asi no se pierde una edicion sin guardar todavia.
  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const { producto, item } of filas) {
        const key = String(producto.producto_odoo_id);
        if (next[key] !== undefined) continue;
        if (!item) { next[key] = ''; continue; }
        const pendiente = item.is_carryover || item.no_disponible;
        next[key] = formatQty(pendiente ? cantidadPendienteDe(item) : item.cantidad_pedida);
      }
      return next;
    });
  }, [filas]);

  if (!open) return null;

  const isAbierto = pedido?.status === 'ABIERTO';

  async function handleBlurCantidad(producto) {
    const key = String(producto.producto_odoo_id);
    const raw = drafts[key];
    const newQty = raw === '' || raw === undefined ? 0 : Number(raw);
    if (!Number.isFinite(newQty) || newQty < 0) { setErr('Cantidad inválida.'); return; }

    const existingItem = items.find((i) => i.producto_odoo_id === producto.producto_odoo_id);
    const yaGuardado = existingItem ? Number(existingItem.cantidad_pedida) : 0;
    if (newQty === yaGuardado) return;

    try {
      setErr('');
      if (newQty === 0) {
        if (existingItem) {
          const { data } = await deleteInsumosPedidoItem(pedido.id, existingItem.id);
          setPedido(data);
        }
        return;
      }
      const { data } = await upsertInsumosPedidoItem(pedido.id, {
        producto_odoo_id: producto.producto_odoo_id,
        producto_nombre: producto.producto_nombre,
        producto_codigo: producto.producto_codigo,
        unidad: producto.unidad,
        categoria_odoo_id: producto.categoria_odoo_id,
        cantidad: newQty,
      });
      setPedido(data);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || 'Error guardando la cantidad');
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
      <div style={{ width: 'min(760px, 100%)', maxHeight: '90vh', overflow: 'auto', background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', boxShadow: '0 18px 55px rgba(0,0,0,0.25)' }}>
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

              {isAbierto ? (
                filas.length === 0 ? (
                  <div style={{ opacity: 0.75 }}>No hay productos configurados para esta sección.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: 13, opacity: 0.8 }}>
                      Ingresá la cantidad a pedir de cada insumo. Dejá en 0 los que no necesites hoy.
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {filas.map(({ producto, item }) => {
                        const pendiente = item && (item.is_carryover || item.no_disponible);
                        return (
                          <div
                            key={producto.producto_odoo_id}
                            style={{
                              display: 'grid', gridTemplateColumns: '1fr 90px 50px', alignItems: 'center', gap: 8,
                              padding: '8px 4px', borderBottom: '1px solid #f1f5f9',
                              background: pendiente ? '#fef2f2' : 'transparent',
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 700, color: pendiente ? '#b91c1c' : '#0f172a' }}>{producto.producto_nombre}</div>
                              {pendiente ? (
                                <div style={{ fontSize: 11, color: '#b91c1c', fontWeight: 700 }}>
                                  {item.is_carryover ? 'Pendiente de entrega anterior' : 'Entrega parcial anterior'}
                                </div>
                              ) : null}
                              {producto.producto_codigo ? <div style={{ fontSize: 11, opacity: 0.7 }}>{producto.producto_codigo}</div> : null}
                            </div>
                            <input
                              className="btn"
                              type="number"
                              min={0}
                              step="any"
                              value={drafts[String(producto.producto_odoo_id)] ?? ''}
                              onChange={(e) => {
                                const v = e.target.value;
                                setDrafts((prev) => ({ ...prev, [String(producto.producto_odoo_id)]: v }));
                              }}
                              onBlur={() => handleBlurCantidad(producto)}
                              style={{
                                width: 90, textAlign: 'right',
                                borderColor: pendiente ? '#fca5a5' : undefined,
                                color: pendiente ? '#b91c1c' : undefined,
                                fontWeight: pendiente ? 800 : undefined,
                              }}
                            />
                            <div style={{ opacity: 0.7, fontSize: 12 }}>{producto.unidad || ''}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )
              ) : items.length === 0 ? (
                <div style={{ opacity: 0.75 }}>No se agregó ningún insumo.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {items.map((item) => {
                    const pendiente = item.is_carryover || item.no_disponible;
                    const cantidadMostrada = pendiente ? cantidadPendienteDe(item) : Number(item.cantidad_pedida || 0);
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
                              {item.is_carryover
                                ? 'Pendiente de entrega anterior — no se entregó la última vez'
                                : `Entrega parcial — todavía faltan ${formatQty(cantidadMostrada)} ${item.unidad || ''}`}
                            </div>
                          ) : null}
                          {item.producto_codigo ? <div style={{ fontSize: 12, opacity: 0.7 }}>{item.producto_codigo}</div> : null}
                        </div>
                        <div style={{ fontWeight: 800 }}>{formatQty(cantidadMostrada)}</div>
                        <div style={{ opacity: 0.7, minWidth: 60 }}>{item.unidad || ''}</div>
                      </div>
                    );
                  })}
                </div>
              )}

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

// pages/admin/InsumosEntregasPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  getAdminToken,
  clearAdminToken,
  adminListInsumosItems,
  adminUpdateInsumosPedidoItem,
  fetchInsumosSecciones,
} from '../../src/api';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatQty(n) {
  const v = Number(n || 0);
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

export default function InsumosEntregasPage() {
  const nav = useNavigate();

  useEffect(() => {
    const t = getAdminToken();
    if (!t) nav('/admin/login', { replace: true });
  }, [nav]);

  const [secciones, setSecciones] = useState([]);
  const [seccion, setSeccion] = useState('');
  const [fecha, setFecha] = useState(todayStr());
  const [modoRango, setModoRango] = useState(false);
  const [desde, setDesde] = useState(todayStr());
  const [hasta, setHasta] = useState(todayStr());

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [entregando, setEntregando] = useState(false);
  // drafts[producto_odoo_id] = { qty: string, sinStock: boolean } - global, sin
  // distinguir seccion (para eso esta el filtro de arriba). Se arma de nuevo
  // solo para productos nuevos que aparecen, sin pisar lo que ya se esta
  // editando en pantalla.
  const [drafts, setDrafts] = useState({});

  useEffect(() => {
    fetchInsumosSecciones().then(({ data }) => setSecciones(data || [])).catch(() => {});
  }, []);

  const reload = async () => {
    setErr('');
    setLoading(true);
    try {
      const params = {};
      if (seccion) params.seccion = seccion;
      if (modoRango) {
        params.desde = desde;
        params.hasta = hasta;
      } else {
        params.fecha = fecha;
      }
      const { data } = await adminListInsumosItems(params);
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seccion, fecha, modoRango, desde, hasta]);

  // Un item por producto (sumando todas las secciones que aparezcan con el
  // filtro actual). Guarda tambien los items originales de ese producto para
  // poder repartir la entrega entre ellos al guardar.
  const resumen = useMemo(() => {
    const byProducto = new Map();
    for (const it of items) {
      const key = it.producto_odoo_id;
      if (!byProducto.has(key)) {
        byProducto.set(key, {
          producto_odoo_id: key,
          producto_nombre: it.producto_nombre,
          unidad: it.unidad,
          totalPedido: 0,
          items: [],
        });
      }
      const acc = byProducto.get(key);
      acc.totalPedido += Number(it.cantidad_pedida || 0);
      acc.items.push(it);
    }
    return [...byProducto.values()].sort((a, b) => a.producto_nombre.localeCompare(b.producto_nombre));
  }, [items]);

  // Arma el draft de cada producto nuevo que aparece (por default asume
  // preparar el total pedido). A los que YA tenian un draft no los pisa - si
  // no, cambiar el filtro a mitad de editar borraba ediciones sin guardar.
  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const r of resumen) {
        if (next[r.producto_odoo_id] !== undefined) continue;
        next[r.producto_odoo_id] = { qty: formatQty(r.totalPedido), sinStock: false };
      }
      for (const id of Object.keys(next)) {
        if (!resumen.some((r) => String(r.producto_odoo_id) === id)) delete next[id];
      }
      return next;
    });
  }, [resumen]);

  function setDraftQty(productoId, value) {
    setDrafts((prev) => ({ ...prev, [productoId]: { ...prev[productoId], qty: value } }));
  }

  function toggleSinStock(row, checked) {
    setDrafts((prev) => ({
      ...prev,
      [row.producto_odoo_id]: { sinStock: checked, qty: checked ? '0' : formatQty(row.totalPedido) },
    }));
  }

  async function entregarTodo() {
    const invalido = resumen.some((r) => {
      const raw = drafts[r.producto_odoo_id]?.qty;
      return raw === '' || raw === undefined || !Number.isFinite(Number(raw)) || Number(raw) < 0;
    });
    if (invalido) {
      setErr('Hay cantidades a preparar inválidas o vacías.');
      return;
    }
    try {
      setEntregando(true);
      setErr('');
      const calls = [];
      for (const r of resumen) {
        const draft = drafts[r.producto_odoo_id] || { qty: formatQty(r.totalPedido), sinStock: false };
        const totalAEntregar = Math.min(Number(draft.qty), r.totalPedido);
        // Proporcion sobre el total pedido de este producto (entre todas las
        // secciones que entren en el filtro actual) - si hay una sola sección
        // (por el filtro de arriba, o porque solo una la pidió), da exacto.
        const ratio = r.totalPedido > 0 ? totalAEntregar / r.totalPedido : 0;
        for (const it of r.items) {
          const entregadoItem = Math.round(Number(it.cantidad_pedida || 0) * ratio * 100) / 100;
          calls.push(
            adminUpdateInsumosPedidoItem(it.pedido_id, it.id, {
              cantidad_entregada: entregadoItem,
              no_disponible: draft.sinStock || ratio < 1,
            })
          );
        }
      }
      await Promise.all(calls);
      await reload();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || 'Error guardando las entregas');
    } finally {
      setEntregando(false);
    }
  }

  const logout = () => {
    clearAdminToken();
    nav('/admin/login', { replace: true });
  };

  return (
    <div className="container" style={{ maxWidth: 900 }}>
      <div className="header-row" style={{ alignItems: 'center' }}>
        <h2 className="h1">Compras · Entregas de Insumos</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn" to="/admin/insumos">Ver pedidos</Link>
          <Link className="btn" to="/">Inicio</Link>
          <button className="btn" onClick={logout}>Salir</button>
        </div>
      </div>

      {err && <div style={{ color: 'crimson', fontWeight: 800, marginTop: 10 }}>{err}</div>}

      <div style={{ marginTop: 12, fontSize: 13, opacity: 0.85 }}>
        Resumen global para preparar el pedido (todas las secciones ya confirmadas juntas). Si querés ver/entregar una sección puntual, usá el filtro de sección.
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap', border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--surface)' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontWeight: 800 }}>Sección</span>
          <select className="btn" value={seccion} onChange={(e) => setSeccion(e.target.value)}>
            <option value="">Todas</option>
            {secciones.map((s) => <option key={s.slug} value={s.slug}>{s.label}</option>)}
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={modoRango} onChange={(e) => setModoRango(e.target.checked)} />
          <span style={{ fontWeight: 800 }}>Ver rango de fechas</span>
        </label>

        {modoRango ? (
          <>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontWeight: 800 }}>Desde</span>
              <input className="btn" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontWeight: 800 }}>Hasta</span>
              <input className="btn" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </label>
          </>
        ) : (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontWeight: 800 }}>Fecha</span>
            <input className="btn" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>
        )}

        <button className="btn btn--brand" type="button" onClick={reload} disabled={loading}>
          {loading ? 'Cargando…' : 'Refrescar'}
        </button>
      </div>

      {loading ? <div style={{ marginTop: 16 }}>Cargando…</div> : (
        <>
          <div style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>Resumen global</div>
            {resumen.length === 0 ? (
              <div style={{ opacity: 0.75 }}>No hay insumos confirmados para este filtro.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {resumen.map((r) => {
                  const draft = drafts[r.producto_odoo_id] || { qty: '', sinStock: false };
                  return (
                    <div
                      key={r.producto_odoo_id}
                      style={{
                        display: 'grid', gridTemplateColumns: '1fr auto auto auto', alignItems: 'center', gap: 12,
                        padding: '8px 10px',
                        border: `1px solid ${draft.sinStock ? '#fecaca' : 'var(--border)'}`,
                        background: draft.sinStock ? '#fef2f2' : 'var(--surface)',
                        borderRadius: 10,
                      }}
                    >
                      <div style={{ fontWeight: 800 }}>{r.producto_nombre}</div>
                      <div style={{ fontSize: 13, textAlign: 'right' }}>
                        <div style={{ opacity: 0.7, fontSize: 11 }}>Cant. pedida</div>
                        <div style={{ fontWeight: 800 }}>{formatQty(r.totalPedido)} {r.unidad || ''}</div>
                      </div>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
                        <span style={{ opacity: 0.7 }}>Cant. a preparar</span>
                        <input
                          className="btn"
                          type="number" min={0} step="any"
                          value={draft.qty}
                          disabled={draft.sinStock || entregando}
                          onChange={(e) => setDraftQty(r.producto_odoo_id, e.target.value)}
                          style={{ width: 90, textAlign: 'right' }}
                        />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
                        <input
                          type="checkbox"
                          checked={draft.sinStock}
                          disabled={entregando}
                          onChange={(e) => toggleSinStock(r, e.target.checked)}
                        />
                        Sin stock
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {resumen.length > 0 ? (
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn--brand" type="button" onClick={entregarTodo} disabled={entregando}>
                {entregando ? 'Entregando…' : 'Entregar'}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

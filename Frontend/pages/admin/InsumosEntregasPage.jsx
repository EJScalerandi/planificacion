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
  // drafts[item.id] = { qty: string, sinStock: boolean } - se arma de nuevo cada
  // vez que llegan items del server, se edita libre en pantalla, y recien se
  // manda todo junto al apretar el boton "Entregar" de abajo de todo.
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

  // Arma el draft de cada item nuevo que aparece (por default asume entrega
  // completa = lo pedido, salvo que ya haya quedado algo cargado de antes).
  // A los items que YA tenian un draft no los pisa - si no, cambiar el filtro
  // de sección a mitad de editar borraba ediciones sin guardar de otros items.
  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const it of items) {
        if (next[it.id] !== undefined) continue;
        const yaEntregado = it.cantidad_entregada != null ? Number(it.cantidad_entregada) : Number(it.cantidad_pedida || 0);
        next[it.id] = {
          qty: it.no_disponible ? formatQty(it.cantidad_entregada ?? 0) : formatQty(yaEntregado),
          sinStock: !!it.no_disponible,
        };
      }
      for (const id of Object.keys(next)) {
        if (!items.some((it) => String(it.id) === id)) delete next[id];
      }
      return next;
    });
  }, [items]);

  const seccionLabel = useMemo(() => {
    const map = new Map(secciones.map((s) => [s.slug, s.label]));
    return (slug) => map.get(slug) || slug;
  }, [secciones]);

  const resumen = useMemo(() => {
    const byProducto = new Map();
    for (const it of items) {
      const key = it.producto_odoo_id;
      if (!byProducto.has(key)) {
        byProducto.set(key, {
          producto_nombre: it.producto_nombre,
          unidad: it.unidad,
          totalPedido: 0,
          totalEntregado: 0,
          secciones: new Set(),
          pendientes: 0,
        });
      }
      const acc = byProducto.get(key);
      acc.totalPedido += Number(it.cantidad_pedida || 0);
      acc.totalEntregado += Number(it.cantidad_entregada || 0);
      acc.secciones.add(it.seccion);
      if (it.no_disponible) acc.pendientes += 1;
    }
    return [...byProducto.values()].sort((a, b) => a.producto_nombre.localeCompare(b.producto_nombre));
  }, [items]);

  function setDraftQty(itemId, value) {
    setDrafts((prev) => ({ ...prev, [itemId]: { ...prev[itemId], qty: value } }));
  }

  function toggleSinStock(item, checked) {
    setDrafts((prev) => ({
      ...prev,
      [item.id]: {
        sinStock: checked,
        qty: checked ? '0' : formatQty(item.cantidad_pedida),
      },
    }));
  }

  async function entregarTodo() {
    const pendientesInvalidos = items.some((it) => {
      const raw = drafts[it.id]?.qty;
      return raw === '' || raw === undefined || !Number.isFinite(Number(raw)) || Number(raw) < 0;
    });
    if (pendientesInvalidos) {
      setErr('Hay cantidades a entregar inválidas o vacías.');
      return;
    }
    try {
      setEntregando(true);
      setErr('');
      await Promise.all(
        items.map((it) => {
          const draft = drafts[it.id] || {};
          return adminUpdateInsumosPedidoItem(it.pedido_id, it.id, {
            cantidad_entregada: Number(draft.qty),
            no_disponible: !!draft.sinStock,
          });
        })
      );
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
    <div className="container" style={{ maxWidth: 1100 }}>
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
        Vista para preparar y repartir: junta los insumos de todas las secciones ya confirmados en un solo lugar. Marcá "No disponible" o ajustá lo entregado a medida que repartís.
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
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>Resumen a preparar</div>
            {resumen.length === 0 ? (
              <div style={{ opacity: 0.75 }}>No hay insumos confirmados para este filtro.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)' }}>
                      <th style={{ padding: '6px 8px' }}>Producto</th>
                      <th style={{ padding: '6px 8px' }}>Total pedido</th>
                      <th style={{ padding: '6px 8px' }}>Total entregado</th>
                      <th style={{ padding: '6px 8px' }}>Secciones</th>
                      <th style={{ padding: '6px 8px' }}>No disponible en</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.map((r) => (
                      <tr key={r.producto_nombre} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 800 }}>{r.producto_nombre}</td>
                        <td style={{ padding: '6px 8px' }}>{formatQty(r.totalPedido)} {r.unidad || ''}</td>
                        <td style={{ padding: '6px 8px' }}>{formatQty(r.totalEntregado)} {r.unidad || ''}</td>
                        <td style={{ padding: '6px 8px' }}>{r.secciones.size}</td>
                        <td style={{ padding: '6px 8px', color: r.pendientes > 0 ? '#b91c1c' : undefined, fontWeight: r.pendientes > 0 ? 800 : 400 }}>
                          {r.pendientes > 0 ? `${r.pendientes} sección(es)` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={{ marginTop: 24 }}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>Detalle por sección</div>
            {items.length === 0 ? (
              <div style={{ opacity: 0.75 }}>No hay items para este filtro.</div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {items.map((item) => {
                    const draft = drafts[item.id] || { qty: '', sinStock: false };
                    return (
                      <div
                        key={item.id}
                        style={{
                          display: 'grid', gridTemplateColumns: '120px 1fr auto auto auto', alignItems: 'center', gap: 12,
                          padding: '8px 10px',
                          border: `1px solid ${draft.sinStock ? '#fecaca' : 'var(--border)'}`,
                          background: draft.sinStock ? '#fef2f2' : 'var(--surface)',
                          borderRadius: 10,
                        }}
                      >
                        <span style={{ fontSize: 11, fontWeight: 900, padding: '3px 8px', borderRadius: 999, background: 'var(--brand)', color: '#fff', justifySelf: 'start' }}>
                          {seccionLabel(item.seccion)}
                        </span>
                        <div>
                          <div style={{ fontWeight: 800 }}>{item.producto_nombre}</div>
                          {item.is_carryover ? <div style={{ fontSize: 12, color: '#b91c1c', fontWeight: 700 }}>Arrastrado de un pedido anterior</div> : null}
                        </div>
                        <div style={{ fontSize: 13, textAlign: 'right' }}>
                          <div style={{ opacity: 0.7, fontSize: 11 }}>Pedido</div>
                          <div style={{ fontWeight: 800 }}>{formatQty(item.cantidad_pedida)} {item.unidad || ''}</div>
                        </div>
                        <input
                          className="btn"
                          type="number" min={0} step="any"
                          value={draft.qty}
                          disabled={draft.sinStock || entregando}
                          onChange={(e) => setDraftQty(item.id, e.target.value)}
                          style={{ width: 90, textAlign: 'right' }}
                          title="Cantidad a entregar"
                        />
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
                          <input
                            type="checkbox"
                            checked={draft.sinStock}
                            disabled={entregando}
                            onChange={(e) => toggleSinStock(item, e.target.checked)}
                          />
                          Sin stock
                        </label>
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn btn--brand" type="button" onClick={entregarTodo} disabled={entregando}>
                    {entregando ? 'Entregando…' : 'Entregar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

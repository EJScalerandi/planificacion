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
  const [savingId, setSavingId] = useState(null);

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

  async function guardarItem(item, patch) {
    try {
      setSavingId(item.id);
      setErr('');
      await adminUpdateInsumosPedidoItem(item.pedido_id, item.id, patch);
      await reload();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || 'Error guardando el cambio');
    } finally {
      setSavingId(null);
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'grid', gridTemplateColumns: '120px 1fr auto auto auto', alignItems: 'center', gap: 10,
                      padding: '8px 10px',
                      border: `1px solid ${item.no_disponible ? '#fecaca' : 'var(--border)'}`,
                      background: item.no_disponible ? '#fef2f2' : 'var(--surface)',
                      borderRadius: 10,
                    }}
                  >
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 900, padding: '3px 8px', borderRadius: 999, background: 'var(--brand)', color: '#fff' }}>
                        {seccionLabel(item.seccion)}
                      </span>
                    </div>
                    <div>
                      <div style={{ fontWeight: 800 }}>{item.producto_nombre}</div>
                      {item.producto_codigo ? <div style={{ fontSize: 12, opacity: 0.7 }}>{item.producto_codigo}</div> : null}
                      {item.is_carryover ? <div style={{ fontSize: 12, color: '#b91c1c', fontWeight: 700 }}>Arrastrado de un pedido anterior</div> : null}
                    </div>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                      <span style={{ fontWeight: 700 }}>Pedido</span>
                      <div style={{ fontWeight: 800, textAlign: 'right', minWidth: 60 }}>{formatQty(item.cantidad_pedida)} {item.unidad || ''}</div>
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                      <span style={{ fontWeight: 700 }}>Entregado</span>
                      <input
                        className="btn"
                        type="number" min={0} step="any"
                        defaultValue={item.cantidad_entregada != null ? formatQty(item.cantidad_entregada) : ''}
                        disabled={savingId === item.id}
                        onBlur={(e) => guardarItem(item, { cantidad_entregada: e.target.value === '' ? null : Number(e.target.value) })}
                        style={{ width: 80, textAlign: 'right' }}
                      />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
                      <input
                        type="checkbox"
                        checked={!!item.no_disponible}
                        disabled={savingId === item.id}
                        onChange={(e) => guardarItem(item, { no_disponible: e.target.checked })}
                      />
                      No disponible
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

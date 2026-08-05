// pages/admin/InsumosConfigPage.jsx
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  getAdminToken,
  clearAdminToken,
  adminFetchInsumosCategorias,
  adminFetchInsumosCategoriaMap,
  adminSaveInsumosCategoriaMap,
  adminFetchInsumosCategoriaProductos,
  adminSetInsumoProductoNombre,
  fetchInsumosSecciones,
} from '../../src/api';
import InsumosHistorialModal from '../../src/components/modals/InsumosHistorialModal';

export default function InsumosConfigPage() {
  const nav = useNavigate();

  useEffect(() => {
    const t = getAdminToken();
    if (!t) nav('/admin/login', { replace: true });
  }, [nav]);

  const [secciones, setSecciones] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [asignaciones, setAsignaciones] = useState({}); // categ_id -> string[] de secciones ([] = sin asignar)
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [openCategId, setOpenCategId] = useState(null);
  const [expandedCategId, setExpandedCategId] = useState(null);
  // productosPorCategoria[categId] = string[] | null (null = todavia no se pidio)
  const [productosPorCategoria, setProductosPorCategoria] = useState({});
  const [loadingProductosId, setLoadingProductosId] = useState(null);
  const [historialOpen, setHistorialOpen] = useState(false);

  // Edición inline del nombre a mostrar de un insumo puntual.
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);

  const reload = async ({ refresh = false } = {}) => {
    setErr('');
    setOk('');
    setLoading(true);
    if (refresh) setRefreshing(true);
    try {
      const [seccionesRes, categoriasRes, mapRes] = await Promise.all([
        fetchInsumosSecciones(),
        adminFetchInsumosCategorias(refresh),
        adminFetchInsumosCategoriaMap(),
      ]);
      setSecciones(seccionesRes.data || []);
      setCategorias(categoriasRes.data || []);
      const map = {};
      for (const row of mapRes.data || []) {
        if (!map[row.categ_id]) map[row.categ_id] = [];
        map[row.categ_id].push(row.seccion);
      }
      setAsignaciones(map);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const asignadasCount = Object.values(asignaciones).filter((arr) => arr && arr.length > 0).length;

  function toggleSeccion(categId, slug) {
    setAsignaciones((a) => {
      const current = a[categId] || [];
      const next = current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug];
      return { ...a, [categId]: next };
    });
  }

  function seccionLabelFor(slug) {
    return secciones.find((s) => s.slug === slug)?.label || slug;
  }

  async function toggleExpandCategoria(categId) {
    if (expandedCategId === categId) {
      setExpandedCategId(null);
      return;
    }
    setExpandedCategId(categId);
    if (productosPorCategoria[categId] !== undefined) return;
    setLoadingProductosId(categId);
    try {
      const { data } = await adminFetchInsumosCategoriaProductos(categId);
      setProductosPorCategoria((prev) => ({ ...prev, [categId]: data || [] }));
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
      setProductosPorCategoria((prev) => ({ ...prev, [categId]: [] }));
    } finally {
      setLoadingProductosId(null);
    }
  }

  function startRename(producto) {
    setRenamingId(producto.producto_odoo_id);
    setRenameValue(producto.producto_nombre || '');
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue('');
  }

  async function saveRename(categId, producto) {
    const nombre = renameValue.trim();
    setErr('');
    setRenameSaving(true);
    try {
      await adminSetInsumoProductoNombre(producto.producto_odoo_id, nombre);
      // Si queda vacío, volvemos a mostrar el nombre real de Odoo.
      const nombreFinal = nombre || producto.producto_nombre_odoo || producto.producto_nombre;
      setProductosPorCategoria((prev) => {
        const lista = prev[categId] || [];
        return {
          ...prev,
          [categId]: lista.map((p) =>
            p.producto_odoo_id === producto.producto_odoo_id ? { ...p, producto_nombre: nombreFinal } : p
          ),
        };
      });
      setRenamingId(null);
      setRenameValue('');
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setRenameSaving(false);
    }
  }

  const onSave = async () => {
    setErr('');
    setOk('');
    try {
      setSaving(true);
      const entries = categorias.flatMap((c) =>
        (asignaciones[c.id] || []).map((seccion) => ({ categ_id: c.id, categ_nombre: c.name, seccion }))
      );
      await adminSaveInsumosCategoriaMap(entries);
      setOk('Mapeo guardado correctamente.');
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const logout = () => {
    clearAdminToken();
    nav('/admin/login', { replace: true });
  };

  if (loading) return <div className="container">Cargando categorías de Odoo…</div>;

  return (
    <div className="container" style={{ maxWidth: 900 }}>
      <div className="header-row" style={{ alignItems: 'center' }}>
        <h2 className="h1">Compras · Config. categorías Odoo ↔ sección</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" type="button" onClick={() => setHistorialOpen(true)}>Ver historial</button>
          <Link className="btn" to="/admin/insumos">Volver a pedidos</Link>
          <Link className="btn" to="/">Inicio</Link>
          <button className="btn" onClick={logout}>Salir</button>
        </div>
      </div>

      {err && <div style={{ color: 'crimson', fontWeight: 800, marginTop: 10 }}>{err}</div>}
      {ok && <div style={{ color: '#15803d', fontWeight: 800, marginTop: 10 }}>{ok}</div>}

      <div style={{ marginTop: 12, fontSize: 13, opacity: 0.85 }}>
        Elegí a qué sección (tablet) le corresponde cada categoría de producto de Odoo. Los insumos de esa categoría van a aparecer para pedir en esa sección. Podés asignar varias categorías a la misma sección; {asignadasCount} de {categorias.length} categorías tienen sección asignada.
      </div>

      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn" type="button" onClick={() => reload({ refresh: true })} disabled={refreshing}>
          {refreshing ? 'Actualizando…' : 'Refrescar categorías desde Odoo'}
        </button>
        <button className="btn btn--brand" type="button" onClick={onSave} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar mapeo'}
        </button>
      </div>

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {categorias.map((c) => {
          const seleccionadas = asignaciones[c.id] || [];
          const expandida = expandedCategId === c.id;
          const productos = productosPorCategoria[c.id];
          const cargandoProductos = loadingProductosId === c.id;
          return (
            <div
              key={c.id}
              style={{
                border: '1px solid var(--border)', borderRadius: 12, padding: 10, background: 'var(--surface)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div
                  onClick={() => toggleExpandCategoria(c.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpandCategoria(c.id); } }}
                  style={{ cursor: 'pointer' }}
                  title="Ver insumos de esta categoría"
                >
                  <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, opacity: 0.6 }}>{expandida ? '▼' : '▶'}</span>
                    {c.name}
                  </div>
                  {c.complete_name && c.complete_name !== c.name ? (
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{c.complete_name}</div>
                  ) : null}
                </div>
                <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setOpenCategId((cur) => (cur === c.id ? null : c.id))}
                  style={{
                    minWidth: 220, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    fontWeight: seleccionadas.length ? 900 : 500,
                    background: seleccionadas.length ? 'var(--brand)' : undefined,
                    color: seleccionadas.length ? '#fff' : undefined,
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {seleccionadas.length === 0 ? '— Sin asignar —' : seleccionadas.map(seccionLabelFor).join(', ')}
                  </span>
                  <span style={{ fontSize: 10, opacity: 0.8 }}>{openCategId === c.id ? '▲' : '▼'}</span>
                </button>

                {openCategId === c.id ? (
                  <>
                    <div
                      onClick={() => setOpenCategId(null)}
                      style={{ position: 'fixed', inset: 0, zIndex: 20 }}
                    />
                    <div
                      style={{
                        position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 21,
                        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
                        boxShadow: '0 10px 30px rgba(0,0,0,0.2)', padding: 8, minWidth: 220,
                        maxHeight: 260, overflowY: 'auto',
                        display: 'flex', flexDirection: 'column', gap: 2,
                      }}
                    >
                      {secciones.map((s) => (
                        <label
                          key={s.slug}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '5px 6px', borderRadius: 6 }}
                        >
                          <input
                            type="checkbox"
                            checked={seleccionadas.includes(s.slug)}
                            onChange={() => toggleSeccion(c.id, s.slug)}
                          />
                          {s.label}
                        </label>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
              </div>

              {expandida ? (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.75, marginBottom: 6 }}>Insumos de esta categoría</div>
                  {cargandoProductos ? (
                    <div style={{ fontSize: 13, opacity: 0.75 }}>Cargando…</div>
                  ) : !productos || productos.length === 0 ? (
                    <div style={{ fontSize: 13, opacity: 0.75 }}>Esta categoría no tiene insumos cargados en Odoo.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {productos.map((p) => {
                        const editando = renamingId === p.producto_odoo_id;
                        const personalizado = p.producto_nombre_odoo && p.producto_nombre !== p.producto_nombre_odoo;
                        if (editando) {
                          return (
                            <div key={p.producto_odoo_id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '4px 0' }}>
                              <input
                                className="btn"
                                autoFocus
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveRename(c.id, p);
                                  if (e.key === 'Escape') cancelRename();
                                }}
                                placeholder={p.producto_nombre_odoo}
                                style={{ flex: 1 }}
                              />
                              <button className="btn btn--brand" type="button" disabled={renameSaving} onClick={() => saveRename(c.id, p)}>
                                {renameSaving ? 'Guardando…' : 'Guardar'}
                              </button>
                              <button className="btn" type="button" disabled={renameSaving} onClick={cancelRename}>Cancelar</button>
                            </div>
                          );
                        }
                        return (
                          <div
                            key={p.producto_odoo_id}
                            onClick={() => startRename(p)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startRename(p); } }}
                            title="Click para cambiar el nombre con el que se ve en el planificador"
                            style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '3px 4px', cursor: 'pointer', borderRadius: 6 }}
                          >
                            <span>
                              {p.producto_nombre}{p.producto_codigo ? ` (${p.producto_codigo})` : ''}
                              {personalizado ? (
                                <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.6 }} title={`Nombre en Odoo: ${p.producto_nombre_odoo}`}>
                                  ✎ personalizado
                                </span>
                              ) : null}
                            </span>
                            {p.unidad ? <span style={{ opacity: 0.6 }}>{p.unidad}</span> : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn--brand" type="button" onClick={onSave} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar mapeo'}
        </button>
      </div>

      <InsumosHistorialModal open={historialOpen} onClose={() => setHistorialOpen(false)} />
    </div>
  );
}

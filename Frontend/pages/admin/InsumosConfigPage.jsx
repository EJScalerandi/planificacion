// pages/admin/InsumosConfigPage.jsx
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  getAdminToken,
  clearAdminToken,
  adminFetchInsumosCategorias,
  adminFetchInsumosCategoriaMap,
  adminSaveInsumosCategoriaMap,
  fetchInsumosSecciones,
} from '../../src/api';

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
          return (
            <div
              key={c.id}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                border: '1px solid var(--border)', borderRadius: 12, padding: 10, background: 'var(--surface)',
              }}
            >
              <div>
                <div style={{ fontWeight: 800 }}>{c.name}</div>
                {c.complete_name && c.complete_name !== c.name ? (
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{c.complete_name}</div>
                ) : null}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {secciones.map((s) => (
                  <label
                    key={s.slug}
                    className="btn"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                      background: seleccionadas.includes(s.slug) ? 'var(--brand)' : undefined,
                      color: seleccionadas.includes(s.slug) ? '#fff' : undefined,
                      fontWeight: seleccionadas.includes(s.slug) ? 900 : 500,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={seleccionadas.includes(s.slug)}
                      onChange={() => toggleSeccion(c.id, s.slug)}
                      style={{ margin: 0 }}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn--brand" type="button" onClick={onSave} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar mapeo'}
        </button>
      </div>
    </div>
  );
}

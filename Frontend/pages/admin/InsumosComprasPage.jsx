// pages/admin/InsumosComprasPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  getAdminToken,
  clearAdminToken,
  adminListInsumosPedidos,
  fetchInsumosSecciones,
} from '../../src/api';
import InsumosPedidoDetalleModal from '../../src/components/modals/InsumosPedidoDetalleModal';

const STATUS_LABELS = {
  ABIERTO: 'Abierto',
  CONFIRMADO: 'Confirmado',
  CERRADO: 'Cerrado',
  CERRADO_VACIO: 'Cerrado (vacío)',
};

function statusColor(status) {
  if (status === 'ABIERTO') return '#f59e0b';
  if (status === 'CONFIRMADO') return '#0ea5e9';
  if (status === 'CERRADO') return '#16a34a';
  return '#94a3b8';
}

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export default function InsumosComprasPage() {
  const nav = useNavigate();

  useEffect(() => {
    const t = getAdminToken();
    if (!t) nav('/admin/login', { replace: true });
  }, [nav]);

  const [secciones, setSecciones] = useState([]);
  const [seccion, setSeccion] = useState('');
  const [fecha, setFecha] = useState(todayStr());
  const [modoHistorial, setModoHistorial] = useState(false);
  const [desde, setDesde] = useState(todayStr());
  const [hasta, setHasta] = useState(todayStr());

  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [detalleId, setDetalleId] = useState(null);

  useEffect(() => {
    fetchInsumosSecciones().then(({ data }) => setSecciones(data || [])).catch(() => {});
  }, []);

  const reload = async () => {
    setErr('');
    setLoading(true);
    try {
      const params = {};
      if (seccion) params.seccion = seccion;
      if (modoHistorial) {
        params.desde = desde;
        params.hasta = hasta;
      } else {
        params.fecha = fecha;
      }
      const { data } = await adminListInsumosPedidos(params);
      setPedidos(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seccion, fecha, modoHistorial, desde, hasta]);

  const seccionLabel = useMemo(() => {
    const map = new Map(secciones.map((s) => [s.slug, s.label]));
    return (slug) => map.get(slug) || slug;
  }, [secciones]);

  const logout = () => {
    clearAdminToken();
    nav('/admin/login', { replace: true });
  };

  return (
    <div className="container" style={{ maxWidth: 1100 }}>
      <div className="header-row" style={{ alignItems: 'center' }}>
        <h2 className="h1">Compras · Pedidos de Insumos</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn" to="/admin/insumos/config">Config. categorías↔sección</Link>
          <Link className="btn" to="/admin">Volver</Link>
          <Link className="btn" to="/">Inicio</Link>
          <button className="btn" onClick={logout}>Salir</button>
        </div>
      </div>

      {err && <div style={{ color: 'crimson', fontWeight: 800, marginTop: 10 }}>{err}</div>}

      <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap', border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--surface)' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontWeight: 800 }}>Sección</span>
          <select className="btn" value={seccion} onChange={(e) => setSeccion(e.target.value)}>
            <option value="">Todas (vista global)</option>
            {secciones.map((s) => <option key={s.slug} value={s.slug}>{s.label}</option>)}
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={modoHistorial} onChange={(e) => setModoHistorial(e.target.checked)} />
          <span style={{ fontWeight: 800 }}>Ver rango (histórico)</span>
        </label>

        {modoHistorial ? (
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

      <div style={{ marginTop: 20 }}>
        {loading ? <div>Cargando…</div> : pedidos.length === 0 ? (
          <div style={{ opacity: 0.75 }}>No hay pedidos para este filtro.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pedidos.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setDetalleId(p.id)}
                style={{
                  textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                  border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--surface)', cursor: 'pointer',
                }}
              >
                <div>
                  <div style={{ fontWeight: 900 }}>
                    {seccionLabel(p.seccion)} · {String(p.fecha).slice(0, 10)}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>
                    {p.items_count} item(s)
                    {p.confirmed_by_name ? ` · Confirmado por ${p.confirmed_by_name} a las ${new Date(p.confirmed_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : ''}
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 900, padding: '3px 10px', borderRadius: 999, background: statusColor(p.status), color: '#fff' }}>
                  {STATUS_LABELS[p.status] || p.status}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <InsumosPedidoDetalleModal
        open={!!detalleId}
        pedidoId={detalleId}
        onClose={() => setDetalleId(null)}
        onChanged={reload}
      />
    </div>
  );
}

// pages/admin/ServicioTecnicoPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  getAdminToken,
  clearAdminToken,
  adminListStOrdenes,
  adminCreateStOrden,
} from '../../src/api';
import OrderedStagePicker from '../../src/components/OrderedStagePicker';
import { sectionLabel } from '../../src/constants/sections';

const emptyForm = { nv: '', cantidad: 1, descripcion: '', workflow_stages: [] };

function stageBadgeStyle(estado) {
  const st = String(estado || '').trim().toLowerCase();
  if (st === 'finalizado') return { background: '#16a34a', color: '#fff', border: '1px solid #15803d' };
  if (st === 'en proceso') return { background: '#f59e0b', color: '#fff', border: '1px solid #b45309' };
  if (st === 'pendiente') return { background: '#ef4444', color: '#fff', border: '1px solid #b91c1c' };
  // Todavía no llegó a esta etapa.
  return { background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' };
}

export default function ServicioTecnicoPage() {
  const nav = useNavigate();

  useEffect(() => {
    const t = getAdminToken();
    if (!t) nav('/admin/login', { replace: true });
  }, [nav]);

  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState(emptyForm);

  const reload = async () => {
    setErr('');
    setLoading(true);
    try {
      const { data } = await adminListStOrdenes();
      setOrdenes(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const canSave = useMemo(() => {
    const nNv = Number(form.nv);
    const nCant = Number(form.cantidad);
    return Number.isInteger(nNv) && Number.isInteger(nCant) && nCant > 0
      && form.descripcion.trim() && form.workflow_stages.length > 0;
  }, [form]);

  const onSave = async () => {
    setErr('');
    try {
      setSaving(true);
      await adminCreateStOrden({
        nv: Number(form.nv),
        cantidad: Number(form.cantidad),
        descripcion: form.descripcion.trim(),
        workflow_stages: form.workflow_stages,
      });
      await reload();
      setForm(emptyForm);
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

  if (loading) return <div className="container">Cargando servicio técnico…</div>;

  return (
    <div className="container" style={{ maxWidth: 1000 }}>
      <div className="header-row" style={{ alignItems: 'center' }}>
        <h2 className="h1">Servicio Técnico</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn" to="/admin">Volver</Link>
          <Link className="btn" to="/">Inicio</Link>
          <button className="btn" onClick={logout}>Salir</button>
        </div>
      </div>

      {err && <div style={{ color: 'crimson', fontWeight: 800, marginTop: 10 }}>{err}</div>}

      <div style={{ marginTop: 16, border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--surface)' }}>
        <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>Nueva orden de Servicio Técnico</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontWeight: 800 }}>NV del portón</span>
            <input
              className="btn"
              type="text"
              inputMode="numeric"
              value={form.nv}
              onChange={(e) => setForm((f) => ({ ...f, nv: e.target.value }))}
              placeholder="Ej: 3995"
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontWeight: 800 }}>Cantidad</span>
            <input
              className="btn"
              type="number"
              min={1}
              value={form.cantidad}
              onChange={(e) => setForm((f) => ({ ...f, cantidad: e.target.value }))}
            />
          </label>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          <span style={{ fontWeight: 800 }}>Qué debe producir</span>
          <input
            className="btn"
            type="text"
            value={form.descripcion}
            onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
            placeholder="Ej: Cambio de motor + brazo derecho"
          />
        </label>

        <div style={{ marginBottom: 12 }}>
          <OrderedStagePicker
            value={form.workflow_stages}
            onChange={(v) => setForm((f) => ({ ...f, workflow_stages: v }))}
          />
        </div>

        <button className="btn btn--brand" onClick={onSave} disabled={saving || !canSave}>
          {saving ? 'Creando…' : 'Crear orden'}
        </button>
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>Órdenes existentes</div>
        {ordenes.length === 0 ? (
          <div style={{ opacity: 0.75 }}>Todavía no hay órdenes de servicio técnico.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ordenes.map((o) => (
              <div key={o.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--surface)' }}>
                <div style={{ fontWeight: 900 }}>ST {o.nv} · Cant. {o.cantidad}</div>
                <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>{o.descripcion}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {(o.workflow_stages || []).map((k, idx) => {
                    const estado = o.etapas_estado?.[k];
                    return (
                      <span
                        key={`${k}-${idx}`}
                        title={estado || 'Todavía no llegó a esta etapa'}
                        style={{ fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 999, ...stageBadgeStyle(estado) }}
                      >
                        {sectionLabel(k)}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

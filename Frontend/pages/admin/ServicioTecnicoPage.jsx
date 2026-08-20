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

const emptyForm = { tipo: 'ST', nv: '', cantidad: 1, descripcion: '', workflow_stages: [] };

function stageBadgeStyle(estado) {
  const st = String(estado || '').trim().toLowerCase();
  if (st === 'finalizado') return { background: '#16a34a', color: '#fff', border: '1px solid #15803d' };
  if (st === 'en proceso') return { background: '#f59e0b', color: '#fff', border: '1px solid #b45309' };
  if (st === 'pendiente') return { background: '#ef4444', color: '#fff', border: '1px solid #b91c1c' };
  // Todavía no llegó a esta etapa.
  return { background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' };
}

function orderLabel(o) {
  if (o?.tipo === 'OE') return `OE ${o?.numero ?? '-'}`;
  if (o?.tipo === 'REFAB') return `REFAB ${o?.nv ?? '-'}`;
  return `ST ${o?.nv ?? '-'}`;
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
    const nCant = Number(form.cantidad);
    const baseOk = Number.isInteger(nCant) && nCant > 0
      && form.descripcion.trim() && form.workflow_stages.length > 0;
    if (!baseOk) return false;
    if (form.tipo === 'ST' || form.tipo === 'REFAB') return Number.isInteger(Number(form.nv));
    return true;
  }, [form]);

  const onSave = async () => {
    setErr('');
    try {
      setSaving(true);
      await adminCreateStOrden({
        tipo: form.tipo,
        nv: (form.tipo === 'ST' || form.tipo === 'REFAB') ? Number(form.nv) : undefined,
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
        <h2 className="h1">Servicio Técnico, Órdenes Externas y Refabricado</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn" to="/admin/servicio-tecnico-solicitudes">Solicitudes (antes de producción)</Link>
          <Link className="btn" to="/admin">Volver</Link>
          <Link className="btn" to="/">Inicio</Link>
          <button className="btn" onClick={logout}>Salir</button>
        </div>
      </div>

      {err && <div style={{ color: 'crimson', fontWeight: 800, marginTop: 10 }}>{err}</div>}

      <div style={{ marginTop: 16, border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--surface)' }}>
        <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>Nueva orden</div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>Tipo de orden</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { key: 'ST', label: 'Servicio Técnico (ST)' },
              { key: 'OE', label: 'Orden Externa (OE)' },
              { key: 'REFAB', label: 'Refabricado' },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                className="btn"
                onClick={() => setForm((f) => ({ ...f, tipo: t.key }))}
                style={{
                  fontWeight: 900,
                  background: form.tipo === t.key ? 'var(--brand)' : undefined,
                  color: form.tipo === t.key ? '#fff' : undefined,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: (form.tipo === 'ST' || form.tipo === 'REFAB') ? '1fr 1fr' : '1fr', gap: 12, marginBottom: 12 }}>
          {(form.tipo === 'ST' || form.tipo === 'REFAB') ? (
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
          ) : null}
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
          <div style={{ opacity: 0.75 }}>Todavía no hay órdenes creadas.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ordenes.map((o) => (
              <div key={o.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--surface)' }}>
                <div style={{ fontWeight: 900 }}>{orderLabel(o)} · Cant. {o.cantidad}</div>
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

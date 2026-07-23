// pages/admin/PrefabricadosConfigPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  getAdminToken,
  clearAdminToken,
  adminListPrefabricadoTipos,
  adminCreatePrefabricadoTipo,
  adminUpdatePrefabricadoTipo,
} from '../../src/api';
import OrderedStagePicker from '../../src/components/OrderedStagePicker';
import { SECTION_KEYS, sectionLabel } from '../../src/constants/sections';

const emptyForm = { nombre: '', seccion_solicitante: [], workflow_stages: [], enabled: true };

export default function PrefabricadosConfigPage() {
  const nav = useNavigate();

  useEffect(() => {
    const t = getAdminToken();
    if (!t) nav('/admin/login', { replace: true });
  }, [nav]);

  const [tipos, setTipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const reload = async () => {
    setErr('');
    setLoading(true);
    try {
      const { data } = await adminListPrefabricadoTipos();
      setTipos(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const startEdit = (t) => {
    setEditingId(t.id);
    setForm({
      nombre: t.nombre || '',
      seccion_solicitante: Array.isArray(t.seccion_solicitante) ? t.seccion_solicitante : [],
      workflow_stages: Array.isArray(t.workflow_stages) ? t.workflow_stages : [],
      enabled: t.enabled !== false,
    });
  };

  const startNew = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const toggleSeccionSolicitante = (key) => {
    setForm((f) => {
      const has = f.seccion_solicitante.includes(key);
      return {
        ...f,
        seccion_solicitante: has
          ? f.seccion_solicitante.filter((k) => k !== key)
          : [...f.seccion_solicitante, key],
      };
    });
  };

  const canSave = useMemo(
    () => form.nombre.trim() && form.workflow_stages.length > 0,
    [form]
  );

  const onSave = async () => {
    setErr('');
    try {
      setSaving(true);
      const payload = {
        nombre: form.nombre.trim(),
        seccion_solicitante: form.seccion_solicitante,
        workflow_stages: form.workflow_stages,
        enabled: form.enabled,
      };
      if (editingId) {
        await adminUpdatePrefabricadoTipo(editingId, payload);
      } else {
        await adminCreatePrefabricadoTipo(payload);
      }
      await reload();
      startNew();
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

  if (loading) return <div className="container">Cargando prefabricados…</div>;

  return (
    <div className="container" style={{ maxWidth: 1000 }}>
      <div className="header-row" style={{ alignItems: 'center' }}>
        <h2 className="h1">Prefabricados</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn" to="/admin">Volver</Link>
          <Link className="btn" to="/">Inicio</Link>
          <button className="btn" onClick={logout}>Salir</button>
        </div>
      </div>

      {err && <div style={{ color: 'crimson', fontWeight: 800, marginTop: 10 }}>{err}</div>}

      <div style={{ marginTop: 16, border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--surface)' }}>
        <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>
          {editingId ? `Editar tipo #${editingId}` : 'Nuevo tipo de prefabricado'}
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          <span style={{ fontWeight: 800 }}>Nombre</span>
          <input
            className="btn"
            type="text"
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            placeholder="Ej: Cabezal 75mm"
          />
        </label>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>Sección(es) solicitante(s)</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SECTION_KEYS.map((k) => (
              <label
                key={k}
                className="btn"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                  background: form.seccion_solicitante.includes(k) ? 'var(--brand)' : undefined,
                  color: form.seccion_solicitante.includes(k) ? '#fff' : undefined,
                }}
              >
                <input
                  type="checkbox"
                  checked={form.seccion_solicitante.includes(k)}
                  onChange={() => toggleSeccionSolicitante(k)}
                  style={{ margin: 0 }}
                />
                {sectionLabel(k)}
              </label>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <OrderedStagePicker
            value={form.workflow_stages}
            onChange={(v) => setForm((f) => ({ ...f, workflow_stages: v }))}
          />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
          />
          <span style={{ fontWeight: 800 }}>Habilitado</span>
        </label>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn--brand" onClick={onSave} disabled={saving || !canSave}>
            {saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear tipo'}
          </button>
          {editingId ? (
            <button className="btn" onClick={startNew} disabled={saving}>Cancelar edición</button>
          ) : null}
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>Tipos configurados</div>
        {tipos.length === 0 ? (
          <div style={{ opacity: 0.75 }}>Todavía no hay tipos de prefabricado configurados.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tipos.map((t) => (
              <div
                key={t.id}
                style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
              >
                <div>
                  <div style={{ fontWeight: 900 }}>
                    {t.nombre} {t.enabled === false ? <span style={{ fontSize: 11, opacity: 0.7 }}>(deshabilitado)</span> : null}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>
                    Solicitan: {(t.seccion_solicitante || []).map(sectionLabel).join(', ') || '—'}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>
                    Workflow: {(t.workflow_stages || []).map(sectionLabel).join(' → ') || '—'}
                  </div>
                </div>
                <button className="btn" onClick={() => startEdit(t)}>Editar</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

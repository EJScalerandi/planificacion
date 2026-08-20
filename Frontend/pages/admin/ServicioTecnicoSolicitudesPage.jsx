// pages/admin/ServicioTecnicoSolicitudesPage.jsx
//
// Fase 0 del módulo de Servicio Técnico: el paso ANTES de generar una orden
// de producción (/admin/servicio-tecnico). Diego carga acá las solicitudes
// (con o sin NV/NP vinculado - si existe, autocompleta cliente/distribuidor/
// fecha de venta/dirección/mapa), arma el historial admin/técnico, y ve de
// un vistazo los portones que todavía están pendientes de medición (derivado
// de fecha_med vacía, igual que Planificación de Fechas deriva de las fechas
// de despacho/instalación).
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  getAdminToken, clearAdminToken,
  fetchStSolicitudNvInfo, fetchStSolicitudes, createStSolicitud,
  fetchStPortonesPendientesMedicion,
} from '../../src/api';
import { formatDMY } from '../../src/utils/isoWeek';
import ServicioTecnicoSolicitudDetalleModal from '../../src/components/modals/ServicioTecnicoSolicitudDetalleModal';

const ESTADO_LABEL = {
  pendiente: 'Pendiente', planificado: 'Planificado', en_viaje: 'En viaje', resuelto: 'Resuelto', cancelado: 'Cancelado',
};
const ESTADO_COLOR = {
  pendiente: '#f59e0b', planificado: '#2563eb', en_viaje: '#7c3aed', resuelto: '#16a34a', cancelado: '#6b7280',
};

const emptyForm = { nv: '', nombre_cliente: '', distribuidor: '', direccion: '', maps_url: '', telefono: '', descripcion: '' };

export default function ServicioTecnicoSolicitudesPage() {
  const nav = useNavigate();
  useEffect(() => { if (!getAdminToken()) nav('/admin/login', { replace: true }); }, [nav]);

  const [tab, setTab] = useState('solicitudes'); // 'solicitudes' | 'mediciones'
  const [solicitudes, setSolicitudes] = useState([]);
  const [mediciones, setMediciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [form, setForm] = useState(emptyForm);
  const [buscandoNv, setBuscandoNv] = useState(false);
  const [nvEncontrado, setNvEncontrado] = useState(null); // null | true | false
  const [creando, setCreando] = useState(false);

  const [detalleId, setDetalleId] = useState(null);

  const reload = async () => {
    setErr('');
    setLoading(true);
    try {
      const [solRes, medRes] = await Promise.all([fetchStSolicitudes(), fetchStPortonesPendientesMedicion()]);
      setSolicitudes(Array.isArray(solRes?.solicitudes) ? solRes.solicitudes : []);
      setMediciones(Array.isArray(medRes?.items) ? medRes.items : []);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const buscarNv = async () => {
    const nv = form.nv.trim();
    if (!nv) return;
    setBuscandoNv(true);
    setNvEncontrado(null);
    setErr('');
    try {
      const { info } = await fetchStSolicitudNvInfo(nv);
      setForm((f) => ({
        ...f,
        nombre_cliente: info.nombre_cliente?.trim() || f.nombre_cliente,
        distribuidor: info.distribuidor || f.distribuidor,
        direccion: info.direccion || f.direccion,
        maps_url: info.maps_url || f.maps_url,
        telefono: info.telefono || f.telefono,
      }));
      setNvEncontrado(true);
    } catch (e) {
      setNvEncontrado(false);
      if (e?.response?.status !== 404) setErr(e?.response?.data?.error || e.message);
    } finally {
      setBuscandoNv(false);
    }
  };

  const crear = async () => {
    if (!form.descripcion.trim()) return;
    setCreando(true);
    setErr('');
    try {
      await createStSolicitud({
        nv: form.nv.trim() || undefined,
        nombre_cliente: form.nombre_cliente.trim() || undefined,
        distribuidor: form.distribuidor.trim() || undefined,
        direccion: form.direccion.trim() || undefined,
        maps_url: form.maps_url.trim() || undefined,
        telefono: form.telefono.trim() || undefined,
        descripcion: form.descripcion.trim(),
      });
      setForm(emptyForm);
      setNvEncontrado(null);
      await reload();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setCreando(false);
    }
  };

  const logout = () => { clearAdminToken(); nav('/admin/login', { replace: true }); };

  const solicitudesOrdenadas = useMemo(
    () => [...solicitudes].sort((a, b) => (a.estado === 'resuelto' || a.estado === 'cancelado' ? 1 : 0) - (b.estado === 'resuelto' || b.estado === 'cancelado' ? 1 : 0)),
    [solicitudes]
  );

  return (
    <div className="container" style={{ maxWidth: 1100 }}>
      <div className="header-row" style={{ alignItems: 'center' }}>
        <h2 className="h1">Servicio Técnico · Solicitudes</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn" to="/admin/servicio-tecnico">Órdenes de producción (ST/OE/REFAB)</Link>
          <Link className="btn" to="/admin">Panel Admin</Link>
          <button className="btn" onClick={logout}>Salir</button>
        </div>
      </div>

      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
        Paso antes de generar una orden de producción: acá se cargan los pedidos de servicio técnico (con o sin NV
        vinculado) y se ve de un vistazo qué portones están pendientes de medición.
      </div>

      {err ? <div style={{ color: 'crimson', fontWeight: 800, marginTop: 10 }}>{err}</div> : null}

      <div style={{ marginTop: 16, border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--surface)' }}>
        <div style={{ fontWeight: 900, fontSize: 15, marginBottom: 10 }}>Nueva solicitud</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
            NV / NP (opcional)
            <input
              className="pp-input" style={{ width: 140 }} value={form.nv}
              onChange={(e) => { setForm((f) => ({ ...f, nv: e.target.value })); setNvEncontrado(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') buscarNv(); }}
              placeholder="Ej: 3995"
            />
          </label>
          <button className="btn" disabled={!form.nv.trim() || buscandoNv} onClick={buscarNv}>
            {buscandoNv ? 'Buscando…' : 'Autocompletar'}
          </button>
          {nvEncontrado === true ? <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 800 }}>✓ Encontrado, datos cargados abajo</span> : null}
          {nvEncontrado === false ? <span style={{ fontSize: 11, color: '#b45309', fontWeight: 800 }}>No se encontró ese NV - cargá los datos a mano</span> : null}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
            Cliente
            <input className="pp-input" value={form.nombre_cliente} onChange={(e) => setForm((f) => ({ ...f, nombre_cliente: e.target.value }))} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
            Distribuidor
            <input className="pp-input" value={form.distribuidor} onChange={(e) => setForm((f) => ({ ...f, distribuidor: e.target.value }))} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
            Dirección
            <input className="pp-input" value={form.direccion} onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
            Teléfono
            <input className="pp-input" value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, gridColumn: '1 / -1' }}>
            URL de Google Maps {form.nv.trim() && !form.maps_url ? <span style={{ color: '#b45309' }}>(no tiene una cargada, agregala vos)</span> : null}
            <input className="pp-input" value={form.maps_url} onChange={(e) => setForm((f) => ({ ...f, maps_url: e.target.value }))} placeholder="https://maps.app.goo.gl/..." />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, gridColumn: '1 / -1' }}>
            Qué se solicita
            <input className="pp-input" value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} placeholder="Ej: no cierra bien, cambiar motor" />
          </label>
        </div>

        <button className="btn btn--brand" disabled={creando || !form.descripcion.trim()} onClick={crear}>
          {creando ? 'Creando…' : 'Crear solicitud'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 20, marginBottom: 10 }}>
        <button className="btn" style={{ background: tab === 'solicitudes' ? 'var(--brand)' : undefined, color: tab === 'solicitudes' ? '#fff' : undefined }} onClick={() => setTab('solicitudes')}>
          Solicitudes ({solicitudes.length})
        </button>
        <button className="btn" style={{ background: tab === 'mediciones' ? 'var(--brand)' : undefined, color: tab === 'mediciones' ? '#fff' : undefined }} onClick={() => setTab('mediciones')}>
          Pendientes de medición ({mediciones.length})
        </button>
      </div>

      {loading ? (
        <div style={{ opacity: 0.75 }}>Cargando…</div>
      ) : tab === 'solicitudes' ? (
        solicitudesOrdenadas.length === 0 ? (
          <div style={{ opacity: 0.75 }}>No hay solicitudes cargadas todavía.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {solicitudesOrdenadas.map((s) => (
              <div
                key={s.id} role="button" tabIndex={0} onClick={() => setDetalleId(s.id)}
                style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--surface)', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 900 }}>{s.nv ? `NV ${s.nv}` : 'Sin NV'} — {s.nombre_cliente || 'sin nombre'}</div>
                  <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: ESTADO_COLOR[s.estado], color: '#fff' }}>
                    {ESTADO_LABEL[s.estado] || s.estado}
                  </span>
                </div>
                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>{s.descripcion}</div>
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                  {s.direccion || 'sin dirección'} · cargada {formatDMY(s.created_at?.slice(0, 10))}
                  {!s.maps_url ? <span style={{ color: '#b45309', fontWeight: 700 }}> · sin URL de mapa</span> : null}
                </div>
              </div>
            ))}
          </div>
        )
      ) : mediciones.length === 0 ? (
        <div style={{ opacity: 0.75 }}>No hay portones pendientes de medición.</div>
      ) : (
        <div style={{ overflow: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface-muted, #f9fafb)' }}>
                <th style={{ textAlign: 'left', padding: 10 }}>NV</th>
                <th style={{ textAlign: 'left', padding: 10 }}>Cliente</th>
                <th style={{ textAlign: 'left', padding: 10 }}>Distribuidor</th>
                <th style={{ textAlign: 'left', padding: 10 }}>Fecha de venta</th>
              </tr>
            </thead>
            <tbody>
              {mediciones.map((m) => (
                <tr key={m.nv}>
                  <td style={{ padding: 10, borderTop: '1px solid var(--border)' }}>{m.nv}</td>
                  <td style={{ padding: 10, borderTop: '1px solid var(--border)' }}>{m.nombre_cliente || '—'}</td>
                  <td style={{ padding: 10, borderTop: '1px solid var(--border)' }}>{m.distribuidor || '—'}</td>
                  <td style={{ padding: 10, borderTop: '1px solid var(--border)' }}>{m.fecha_venta ? formatDMY(m.fecha_venta) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ServicioTecnicoSolicitudDetalleModal
        open={!!detalleId} solicitudId={detalleId}
        onClose={() => setDetalleId(null)}
        onChanged={reload}
      />
    </div>
  );
}

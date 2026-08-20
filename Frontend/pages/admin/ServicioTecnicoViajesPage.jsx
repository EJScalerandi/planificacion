// pages/admin/ServicioTecnicoViajesPage.jsx
//
// Espejo de LogisticaViajesPage.jsx para Servicio Técnico: grilla por semana
// ISO con cuántos items (solicitudes + mediciones) tiene esa semana y cuántos
// ya están repartidos en un viaje. Click en una semana abre
// ServicioTecnicoViajeSemanaModal para armar los viajes y repartirlos.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getAdminToken, clearAdminToken, fetchStSemanas } from '../../src/api';
import { weekTitleFromSelection, weekNumberFromLabel } from '../../src/utils/isoWeek';
import ServicioTecnicoViajeSemanaModal from '../../src/components/ServicioTecnicoViajeSemanaModal';

function StatPill({ label, total, asignados }) {
  const completo = total > 0 && asignados >= total;
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        padding: '6px 10px', borderRadius: 10,
        background: completo ? 'var(--brand-100)' : 'var(--surface-muted, #f3f4f6)',
        border: '1px solid var(--border)',
      }}
    >
      <span style={{ fontSize: 12, opacity: 0.75 }}>{label}</span>
      <span style={{ fontWeight: 900, fontSize: 13 }}>{asignados}/{total}</span>
    </div>
  );
}

export default function ServicioTecnicoViajesPage() {
  const nav = useNavigate();
  useEffect(() => { if (!getAdminToken()) nav('/admin/login', { replace: true }); }, [nav]);
  const canEdit = true; // un solo scope (servicio_tecnico:admin) para todo el módulo

  const [semanas, setSemanas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [semanaAbierta, setSemanaAbierta] = useState(null);

  const reload = useCallback(async () => {
    setErr('');
    try {
      const data = await fetchStSemanas();
      setSemanas(Array.isArray(data?.semanas) ? data.semanas : []);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const logout = () => { clearAdminToken(); nav('/admin/login', { replace: true }); };

  return (
    <div className="container">
      <div className="header-row" style={{ alignItems: 'center' }}>
        <h2 className="h1">Viajes de Servicio Técnico</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn" to="/admin/servicio-tecnico-fechas">Planificación de Fechas</Link>
          <Link className="btn" to="/admin/servicio-tecnico-solicitudes">Solicitudes</Link>
          <Link className="btn" to="/admin">Panel Admin</Link>
          <button className="btn" onClick={logout}>Salir</button>
        </div>
      </div>

      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
        Cada tarjeta es una semana ISO. Mostramos cuántas solicitudes de técnica y cuántas mediciones tienen
        fecha programada esa semana, y cuántas ya están repartidas en un viaje. Tocá una semana para armar los viajes.
      </div>

      {err ? <div style={{ color: 'crimson', fontWeight: 800, marginTop: 10 }}>{err}</div> : null}

      {loading ? (
        <div style={{ marginTop: 16, opacity: 0.75 }}>Cargando semanas…</div>
      ) : semanas.length === 0 ? (
        <div style={{ marginTop: 16, opacity: 0.75 }}>
          No hay solicitudes ni mediciones con fecha programada todavía.
        </div>
      ) : (
        <div
          style={{
            marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12,
          }}
        >
          {semanas.map((s) => (
            <div
              key={s.semana}
              role="button"
              tabIndex={0}
              onClick={() => setSemanaAbierta(s.semana)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSemanaAbierta(s.semana); }}
              style={{
                textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)', borderRadius: 12,
                padding: 14, background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Semana {weekNumberFromLabel(s.semana)}</div>
                {s.cerrada ? (
                  <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: 'var(--brand)', color: '#fff' }}>
                    Cerrada
                  </span>
                ) : null}
              </div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>{weekTitleFromSelection(s.semana)}</div>

              <StatPill label="Total" total={s.total} asignados={s.asignados} />

              <div style={{ fontSize: 12, opacity: 0.75 }}>
                {s.viajes_count} viaje{s.viajes_count === 1 ? '' : 's'} creado{s.viajes_count === 1 ? '' : 's'}
              </div>
            </div>
          ))}
        </div>
      )}

      <ServicioTecnicoViajeSemanaModal
        semana={semanaAbierta}
        open={!!semanaAbierta}
        canEdit={canEdit}
        onClose={() => setSemanaAbierta(null)}
        onChanged={reload}
      />
    </div>
  );
}

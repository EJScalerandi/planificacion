// pages/admin/LogisticaViajesPage.jsx
//
// Logística de Viajes: grilla por semana ISO con cuántos portones tienen
// despacho/instalación esa semana. Click en una semana abre
// LogisticaViajeSemanaModal para armar los viajes y repartirlos.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getAdminToken, clearAdminToken, fetchLogisticaSemanas } from '../../src/api';
import { getPreproduccionAccessMode } from '../../src/utils/adminScopes';
import { weekTitleFromSelection, weekNumberFromLabel } from '../../src/utils/isoWeek';
import LogisticaViajeSemanaModal from '../../src/components/LogisticaViajeSemanaModal';

function StatPill({ label, total, asignados }) {
  const completo = total > 0 && asignados >= total;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '6px 10px',
        borderRadius: 10,
        background: completo ? 'var(--brand-100)' : 'var(--surface-muted, #f3f4f6)',
        border: '1px solid var(--border)',
      }}
    >
      <span style={{ fontSize: 12, opacity: 0.75 }}>{label}</span>
      <span style={{ fontWeight: 900, fontSize: 13 }}>
        {asignados}/{total}
      </span>
    </div>
  );
}

export default function LogisticaViajesPage() {
  const nav = useNavigate();

  useEffect(() => {
    if (!getAdminToken()) nav('/admin/login', { replace: true });
  }, [nav]);

  const accessMode = getPreproduccionAccessMode();

  const [semanas, setSemanas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [semanaAbierta, setSemanaAbierta] = useState(null);

  const reload = useCallback(async () => {
    setErr('');
    try {
      const data = await fetchLogisticaSemanas();
      setSemanas(Array.isArray(data?.semanas) ? data.semanas : []);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (accessMode === 'none') return;
    reload();
  }, [accessMode, reload]);

  const logout = () => {
    clearAdminToken();
    nav('/admin/login', { replace: true });
  };

  if (accessMode === 'none') {
    return (
      <div className="container">
        <div style={{ background: '#fff5f5', border: '1px solid #fecaca', padding: 12, borderRadius: 12 }}>
          No tenés permisos para ver Logística de Viajes. Pedí que te asignen: <b>preproduccion:full</b>,{' '}
          <b>preproduccion:admin</b> o <b>preproduccion:comercial_view</b>.
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header-row" style={{ alignItems: 'center' }}>
        <h2 className="h1">Logística de Viajes</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn" to="/admin/logistica-fechas">Planificación de Fechas</Link>
          <Link className="btn" to="/a">Ir a Preproducción (/a)</Link>
          <Link className="btn" to="/admin">Panel Admin</Link>
          <button className="btn" onClick={logout}>Salir</button>
        </div>
      </div>

      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
        Cada tarjeta es una semana ISO. Mostramos cuántos portones tienen despacho y cuántos instalación esa
        semana (según fecha_salida_imput / fecha_llegada_imput cargados en /a), y cuántos ya están repartidos
        en un viaje. Tocá una semana para armar los viajes.
      </div>

      {err ? <div style={{ color: 'crimson', fontWeight: 800, marginTop: 10 }}>{err}</div> : null}

      {loading ? (
        <div style={{ marginTop: 16, opacity: 0.75 }}>Cargando semanas…</div>
      ) : semanas.length === 0 ? (
        <div style={{ marginTop: 16, opacity: 0.75 }}>
          No hay portones con fecha de despacho o instalación cargada todavía.
        </div>
      ) : (
        <div
          style={{
            marginTop: 16,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 12,
          }}
        >
          {semanas.map((s) => (
            <button
              key={s.semana}
              type="button"
              onClick={() => setSemanaAbierta(s.semana)}
              style={{
                textAlign: 'left',
                cursor: 'pointer',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 14,
                background: 'var(--surface)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Semana {weekNumberFromLabel(s.semana)}</div>
                {s.cerrada ? (
                  <span
                    style={{
                      fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999,
                      background: 'var(--brand)', color: '#fff',
                    }}
                  >
                    Cerrada
                  </span>
                ) : null}
              </div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>{weekTitleFromSelection(s.semana)}</div>

              <StatPill label="Despacho" total={s.despacho_total} asignados={s.despacho_asignados} />
              <StatPill label="Instalación" total={s.instalacion_total} asignados={s.instalacion_asignados} />

              <div style={{ fontSize: 12, opacity: 0.75 }}>
                {s.viajes_count} viaje{s.viajes_count === 1 ? '' : 's'} creado{s.viajes_count === 1 ? '' : 's'}
              </div>
            </button>
          ))}
        </div>
      )}

      <LogisticaViajeSemanaModal
        semana={semanaAbierta}
        open={!!semanaAbierta}
        canEdit={accessMode === 'full'}
        onClose={() => setSemanaAbierta(null)}
        onChanged={reload}
      />
    </div>
  );
}

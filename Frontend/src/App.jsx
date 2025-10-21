import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useState } from 'react';
import usePortones from './hooks/usePortones';
import { startStage, stopStage } from './api';
import StageColumn from './components/StageColumn';
import StatusGatePage from './components/StatusGatePage';
import CreateGatePage from '../pages/CreateGatePage';

const color = '#008241ff';

/** Tablero reutilizable: usa tu hook y StageColumn */
function Board({ stages }) {
  const { data, loading, err, replaceItem } = usePortones();
  const [busyId, setBusyId] = useState(null);

  const handleStart = async (id, stage) => {
    try {
      setBusyId(id);
      const { data: updated } = await startStage(id, stage);
      replaceItem(updated);
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleStop = async (id, stage) => {
    try {
      setBusyId(id);
      const { data: updated } = await stopStage(id, stage);
      replaceItem(updated);
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div style={{ padding: 16 }}>Cargando…</div>;
  if (err)      return <div style={{ padding: 16, color: 'crimson' }}>Error: {err}</div>;

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ color, border: `3px solid ${color}`, padding: 8, maxWidth: 800 }}>
        FILTROS POR SECTOR
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginTop: 10 }}>
        {stages.map(s => (
          <StageColumn
            key={s.key}
            title={s.label}
            stageKey={s.key}
            items={data}
            onStart={handleStart}
            onStop={handleStop}
            disabledId={busyId}
          />
        ))}
      </div>
    </div>
  );
}

/** Definiciones por etapa */
const ONE = (key, label) => [{ key, label }];

const ROUTES = [
  { path: '/',               label: 'Inicio',         stages: [
    { key: 'diseno',          label: 'Diseño' },
    { key: 'laser',           label: 'Laser' },
    { key: 'guillotina',      label: 'Corte' },
    { key: 'plegadora',       label: 'Plegado' },
    { key: 'armado_piernas',  label: 'Armado Piernas' },
    { key: 'armado_primario', label: 'Armado Primario' },
    { key: 'armado_hojas',    label: 'Armado Hojas' },
    { key: 'inyeccion',       label: 'Inyección' },
    { key: 'revestimiento',   label: 'Revestimiento' },
    { key: 'pintura',         label: 'Pintura' },
    { key: 'armado_final',    label: 'Armado Final' },
    { key: 'despacho',        label: 'Despacho' },
  ]},
  { path: '/diseno',         label: 'Diseño',         stages: ONE('diseno','Diseño') },
  { path: '/laser',          label: 'Laser',          stages: ONE('laser','Laser') },
  { path: '/corte',          label: 'Corte',          stages: ONE('guillotina','Corte') },
  { path: '/plegado',        label: 'Plegado',        stages: ONE('plegadora','Plegado') },
  { path: '/armado-piernas', label: 'Armado Piernas', stages: ONE('armado_piernas','Armado Piernas') },
  // EXCEPCIÓN: Armado Primario muestra 3 columnas (primario + piernas + hojas)
  { path: '/armado-primario', label: 'Armado Primario', stages: [
    { key: 'armado_primario', label: 'Armado Primario' },
    { key: 'armado_piernas',  label: 'Armado Piernas' },
    { key: 'armado_hojas',    label: 'Armado Hojas' },
  ]},
  { path: '/armado-hojas',   label: 'Armado Hojas',   stages: ONE('armado_hojas','Armado Hojas') },
  { path: '/inyeccion',      label: 'Inyección',      stages: ONE('inyeccion','Inyección') },
  { path: '/revestimiento',  label: 'Revestimiento',  stages: ONE('revestimiento','Revestimiento') },
  { path: '/pintura',        label: 'Pintura',        stages: ONE('pintura','Pintura') },
  { path: '/armado-final',   label: 'Armado Final',   stages: ONE('armado_final','Armado Final') },
  { path: '/despacho',       label: 'Despacho',       stages: ONE('despacho','Despacho') },
];

/** Navbar generado a partir de ROUTES (sin repetir Inicio) */
const Navbar = () => (
  <div style={{ display: 'flex', gap: 12, padding: 12, borderBottom: '2px solid #eee', flexWrap: 'wrap' }}>
    {ROUTES.filter(r => r.path !== '/').map(r => (
      <NavLink key={r.path} to={r.path}
        style={({isActive}) => ({
          textDecoration: isActive ? 'underline' : 'none',
          padding: '6px 10px',
          border: '1px solid #ddd',
          borderRadius: 8
        })}
      >
        {r.label}
      </NavLink>
    ))}
  </div>
);

export default function App() {
  return (
    <BrowserRouter>
     
      <Routes>
        {/* Home con todas las columnas */}
        <Route path="/" element={<Board stages={ROUTES.find(r=>r.path==='/').stages} />} />

        {/* Todas las rutas por etapa */}
        {ROUTES.filter(r => r.path !== '/').map(r => (
          <Route key={r.path} path={r.path} element={<Board stages={r.stages} />} />
        ))}

        {/* Alias con acento para Diseño */}
        <Route path="/Diseño" element={<Board stages={ONE('diseno','Diseño')} />} />

        {/* Not found -> home */}
        <Route path="*" element={<Navigate to="/" replace />}
         />
         <Route path="/statusGate" element={<StatusGatePage />} />
        <Route path="/createGate" element={<CreateGatePage />} />
      </Routes>
    </BrowserRouter>
  );
}

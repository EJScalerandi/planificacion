import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import usePortones from './hooks/usePortones';
import { startStage, stopStage } from './api';
import StageColumn from './components/StageColumn';
import StatusGatePage from '../src/components/StatusGatePage';
import CreateGatePage from '../pages/CreateGatePage';
import PlantaReadOnlyPage from '../pages/PlantaOnlyDearPage';


// ...imports iguales
const color = 'var(--brand)';

function Board({ stages }) {
  const { data, loading, err, replaceItem, refresh, refreshing } = usePortones({ pollMs: 300000 });
  const [busyId, setBusyId] = useState(null);

  const handleStart = async (id, stage) => {
    try { setBusyId(id);
      const { data: updated } = await startStage(id, stage);
      replaceItem(updated);
    } catch (e) { alert(e?.response?.data?.error || e.message); }
    finally { setBusyId(null); }
  };

  const handleStop = async (id, stage) => {
    try { setBusyId(id);
      const { data: updated } = await stopStage(id, stage);
      replaceItem(updated);
    } catch (e) { alert(e?.response?.data?.error || e.message); }
    finally { setBusyId(null); }
  };

  if (loading) return <div className="container">Cargando…</div>;
  if (err)      return <div className="container" style={{color:'crimson'}}>Error: {err}</div>;

  return (
    <div className="container">
      <div className="header-row">
        <h2 className="h1">DE GRANDIS PORTONES</h2>
        <button className="btn btn--brand" onClick={refresh} disabled={refreshing}>
          {refreshing ? 'Actualizando…' : 'Refrescar'}
        </button>
      </div>

      <div className="stage-grid">
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


/** Helper para rutas de una sola etapa */
const ONE = (key, label) => [{ key, label }];

/** Definiciones por etapa */
const ROUTES = [
  {
    path: '/',
    label: 'Inicio',
    stages: [
      { key: 'diseno',                label: 'Diseño' },
      { key: 'laser',                 label: 'Laser' },
      { key: 'guillotina',            label: 'Corte' },
      { key: 'plegadora',             label: 'Plegado' },
      { key: 'armado_piernas',        label: 'Armado Piernas' },
      { key: 'armado_marco_piernas',  label: 'Armado Marco Piernas' }, // NUEVA
      { key: 'armado_hojas',          label: 'Armado Hojas' },
      { key: 'armado_primario',       label: 'Armado Primario' },
      { key: 'inyeccion',             label: 'Inyección' },
      { key: 'revestimiento',         label: 'Revestimiento' },
      { key: 'pintura',               label: 'Pintura' },
      { key: 'armado_final',          label: 'Armado Final' },
      { key: 'despacho',              label: 'Despacho' },
    ]
  },
  { path: '/diseno',                 label: 'Diseño',                   stages: ONE('diseno','Diseño') },
  { path: '/laser',                  label: 'Laser',                    stages: ONE('laser','Laser') },
  { path: '/corte',                  label: 'Corte',                    stages: ONE('guillotina','Corte') },
  { path: '/plegado',                label: 'Plegado',                  stages: ONE('plegadora','Plegado') },
  { path: '/armado-piernas',         label: 'Armado Piernas - Prefabricados',           stages: ONE('armado_piernas','Armado Piernas') },
  { path: '/armado-marco-piernas',   label: 'Armado Marco Piernas',     stages: ONE('armado_marco_piernas','Armado Marco Piernas') }, // NUEVA RUTA
  // EXCEPCIÓN: Armado Primario muestra 3 columnas (primario + piernas + hojas)
  {
    path: '/armado-primario',
    label: 'Armado Primario',
    stages: [
      { key: 'armado_primario', label: 'Armado Primario' },
      { key: 'armado_marco_piernas',  label: 'Armado Marco Piernas' },
      { key: 'armado_hojas',    label: 'Armado Hojas' },
    ]
  },
  { path: '/armado-hojas',           label: 'Armado Hojas',             stages: ONE('armado_hojas','Armado Hojas') },
  { path: '/inyeccion',              label: 'Inyección',                stages: ONE('inyeccion','Inyección') },
  { path: '/revestimiento',          label: 'Revestimiento',            stages: ONE('revestimiento','Revestimiento') },
  { path: '/pintura',                label: 'Pintura',                  stages: ONE('pintura','Pintura') },
  { path: '/armado-final',           label: 'Armado Final',             stages: ONE('armado_final','Armado Final') },
  { path: '/despacho',               label: 'Despacho',                 stages: ONE('despacho','Despacho') },
];

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Home con todas las columnas */}
        <Route
          path="/"
          element={<Board stages={ROUTES.find(r => r.path === '/').stages} />}
        />

        {/* Rutas por etapa */}
        {ROUTES.filter(r => r.path !== '/').map(r => (
          <Route key={r.path} path={r.path} element={<Board stages={r.stages} />} />
        ))}

        {/* Alias con acento para Diseño */}
        <Route path="/Diseño" element={<Board stages={ONE('diseno','Diseño')} />} />

        {/* Tableros especiales */}
        <Route path="/statusGate" element={<StatusGatePage />} />
        <Route path="/createGate" element={<CreateGatePage />} />

        {/* Not found -> home */}
        
        <Route path="/planta" element={<PlantaReadOnlyPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

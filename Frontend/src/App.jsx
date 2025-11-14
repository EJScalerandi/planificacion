// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import usePortones from './hooks/usePortones';
import useIpanel from './hooks/useIpanels';
import {
  startStage, stopStage,
  startIpanelStage, stopIpanelStage
} from './api';
import StageColumn from './components/StageColumn';
import StatusGatePage from '../src/components/StatusGatePage';
import CreateGatePage from '../pages/CreateGatePage';
import PlantaReadOnlyPage from '../pages/PlantaOnlyDearPage';
import IpanelReadOnlyPage from '../pages/IpanelReadOnlyPage';
import PlantaReadOnlySimplePage from '../pages/PlantaReadyOnlySimplePage';
import StatusIpanelsPage from '../pages/StatusIpanelsPage';

const color = 'var(--brand)';

/** Board genérico que sabe dibujar columnas de Portones e iPanel */
function Board({ stages }) {
  // datos
  const { data: portones, loading, err, replaceItem, refresh, refreshing } =
    usePortones({ pollMs: 300000 });
  const { data: ipanels, refresh: refreshIpanel } = useIpanel({ pollMs: 300000 });

  const [busyId, setBusyId] = useState(null);

  // --- Buscador: NV / N° Portón (nlista) / Partida ---
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(null);

  const filteredPortones = useMemo(() => {
    if (!Array.isArray(portones)) return [];
    if (filter === null || filter === '') return portones;
    const n = Number(filter);
    if (Number.isNaN(n)) return portones;
    return portones.filter(p => p.nv === n || p.nlista === n || p.partida === n);
  }, [portones, filter]);

  const filteredIpanels = useMemo(() => {
    if (!Array.isArray(ipanels)) return [];
    if (filter === null || filter === '') return ipanels;
    const n = Number(filter);
    if (Number.isNaN(n)) return ipanels;
    // iPanel: buscamos por NV o Partida
    return ipanels.filter(ip => ip.nv === n || ip.partida === n);
  }, [ipanels, filter]);

  // handlers Portones
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

  // handlers iPanel
  const handleStartIpanel = async (id, stage) => {
    try {
      setBusyId(id);
      await startIpanelStage(id, stage);
      await refreshIpanel();
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    } finally {
      setBusyId(null);
    }
  };
  const handleStopIpanel = async (id, stage) => {
    try {
      setBusyId(id);
      await stopIpanelStage(id, stage);
      await refreshIpanel();
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div className="container">Cargando…</div>;
  if (err)      return <div className="container" style={{ color: 'crimson' }}>Error: {err}</div>;

  return (
    <div className="container">
      <div className="header-row">
        <h2 className="h1" style={{ borderColor: color }}>DE GRANDIS PORTONES</h2>
        <button
          className="btn btn--brand"
          onClick={() => { refresh(); refreshIpanel(); }}
          disabled={refreshing}
        >
          {refreshing ? 'Actualizando…' : 'Refrescar'}
        </button>
      </div>

      {/* Buscador */}
      <form
        onSubmit={(e) => { e.preventDefault(); setFilter(q.trim()); }}
        style={{ display:'flex', gap:8, alignItems:'center', margin:'10px 0', flexWrap:'wrap' }}
      >
        <input
          type="text"
          placeholder="Buscar por NV / N° Portón (lista) / Partida"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="btn"
          style={{ minWidth: 260 }}
          inputMode="numeric"
        />
        <button className="btn btn--brand" type="submit">Buscar</button>
        <button
          className="btn"
          type="button"
          onClick={() => { setQ(''); setFilter(null); }}
        >
          Limpiar
        </button>
      </form>

      <div className="stage-grid">
        {stages.map(s => {
          const isIpanel = s.mode === 'ipanel';
          return (
            <StageColumn
              key={`${s.mode || 'porton'}-${s.key}-${s.label}`}
              title={s.label}
              stageKey={s.key}
              mode={s.mode || 'porton'}
              items={isIpanel ? filteredIpanels : filteredPortones}
              onStart={isIpanel ? handleStartIpanel : handleStart}
              onStop={isIpanel ? handleStopIpanel : handleStop}
              disabledId={busyId}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Helper para rutas de una sola etapa (PORTONES por defecto) */
const ONE = (key, label) => [{ key, label, mode: 'porton' }];

/** Definiciones por etapa con secciones iPanel donde corresponda */
const ROUTES = [
  {
    path: '/',
    label: 'Inicio (Tablero completo)',
    stages: [
      // Diseño: también iPanel
      { key: 'diseno',  label: 'Diseño (Portones)', mode: 'porton' },
      { key: 'diseno',  label: 'Diseño (iPanel)',   mode: 'ipanel' },

      { key: 'laser',   label: 'Laser',             mode: 'porton' },

      // Corte
      { key: 'guillotina',   label: 'Corte (Piernas)',        mode: 'porton' },
      { key: 'corte_revest', label: 'Corte (Revestimiento)',  mode: 'porton' },
      { key: 'guillotina',   label: 'Corte (iPanel)',         mode: 'ipanel'  },

      // Plegado
      { key: 'plegadora',      label: 'Plegado (Piernas)',       mode: 'porton' },
      { key: 'plegado_revest', label: 'Plegado (Revestimiento)', mode: 'porton' },
      { key: 'plegado',        label: 'Plegado (iPanel)',        mode: 'ipanel'  },

      // Prefabricados / Armados (solo Portones)
      { key: 'armado_piernas',        label: 'Armado Piernas - Prefabricados', mode: 'porton' },
      { key: 'armado_marco_piernas',  label: 'Armado Marco Piernas',           mode: 'porton' },
      { key: 'armado_hojas',          label: 'Armado Hojas',                   mode: 'porton' },
      { key: 'armado_primario',       label: 'Armado Primario',                mode: 'porton' },

      // Pintura
      { key: 'pintura', label: 'Pintura (Portones)', mode: 'porton' },
      { key: 'pintura', label: 'Pintura (iPanel)',   mode: 'ipanel'  },

      // Inyección
      { key: 'inyeccion', label: 'Inyección (Portones)', mode: 'porton' },
      { key: 'inyeccion', label: 'Inyección (iPanel)',   mode: 'ipanel'  },

      // Resto Portones
      { key: 'revestimiento', label: 'Revestimiento',  mode: 'porton' },
      { key: 'armado_final',  label: 'Armado Final',   mode: 'porton' },

      // Despacho
      { key: 'despacho', label: 'Despacho (Portones)', mode: 'porton' },
      { key: 'despacho', label: 'Despacho (iPanel)',   mode: 'ipanel'  },
    ]
  },

  // Rutas por etapa
  {
    path: '/diseno',
    label: 'Diseño',
    stages: [
      { key: 'diseno', label: 'Diseño (Portones)', mode: 'porton' },
      { key: 'diseno', label: 'Diseño (iPanel)',   mode: 'ipanel'  },
    ]
  },

  { path: '/laser', label: 'Laser', stages: ONE('laser','Laser') },

  // Corte
  {
    path: '/corte',
    label: 'Corte',
    stages: [
      { key: 'guillotina',   label: 'Corte (Piernas)',        mode: 'porton' },
      { key: 'corte_revest', label: 'Corte (Revestimiento)',  mode: 'porton' },
      { key: 'guillotina',   label: 'Corte (iPanel)',         mode: 'ipanel' },
    ]
  },

  // Plegado
  {
    path: '/plegado',
    label: 'Plegado',
    stages: [
      { key: 'plegadora',      label: 'Plegado (Piernas)',       mode: 'porton' },
      { key: 'plegado_revest', label: 'Plegado (Revestimiento)', mode: 'porton' },
      { key: 'plegado',        label: 'Plegado (iPanel)',        mode: 'ipanel' },
    ]
  },

  // Armado Piernas - Prefabricados (solo portones)
  {
    path: '/armado-piernas',
    label: 'Armado Piernas - Prefabricados',
    stages: [
      { key: 'armado_piernas',       label: 'Armado Piernas - Prefabricados', mode: 'porton' },
      { key: 'armado_marco_piernas', label: 'Armado Marco Piernas',           mode: 'porton' },
      { key: 'armado_hojas',         label: 'Armado Hojas',                   mode: 'porton' },
    ]
  },

  { path: '/armado-primario', label: 'Armado Primario', stages: ONE('armado_primario','Armado Primario') },

  // Pintura
  {
    path: '/pintura',
    label: 'Pintura',
    stages: [
      { key: 'pintura', label: 'Pintura (Portones)', mode: 'porton' },
      { key: 'pintura', label: 'Pintura (iPanel)',   mode: 'ipanel' },
    ]
  },

  // Inyección
  {
    path: '/inyeccion',
    label: 'Inyección',
    stages: [
      { key: 'inyeccion', label: 'Inyección (Portones)', mode: 'porton' },
      { key: 'inyeccion', label: 'Inyección (iPanel)',   mode: 'ipanel' },
    ]
  },

  { path: '/revestimiento',  label: 'Revestimiento',  stages: ONE('revestimiento','Revestimiento') },
  { path: '/armado-final',   label: 'Armado Final',   stages: ONE('armado_final','Armado Final') },

  // Despacho
  {
    path: '/despacho',
    label: 'Despacho',
    stages: [
      { key: 'despacho', label: 'Despacho (Portones)', mode: 'porton' },
      { key: 'despacho', label: 'Despacho (iPanel)',   mode: 'ipanel' },
    ]
  },
];

/** Página de índice con links a todas las rutas */
function IndexPage() {
  // Rutas “especiales” que no están en ROUTES
  const extraRoutes = [
    { path: '/ipanel',        label: 'iPanel (solo lectura)' },
    { path: '/statusGate',    label: 'Status Portones' },
    { path: '/createGate',    label: 'CreateGate (carga / planificación)' },
    { path: '/planta',        label: 'Planta (solo lectura – detalle)' },
    { path: '/plantasimple',  label: 'Planta simple (resumen)' },
    { path: '/statusIpanels', label: 'Status iPanels' },
  ];

  // Evito duplicar '/' porque ya lo tenemos en ROUTES[0]
  const routeLinks = [
    ...ROUTES,
    ...extraRoutes,
  ];

  return (
    <div className="container">
      <h1 className="h1" style={{ marginBottom: 16 }}>Índice de tableros</h1>
      <p style={{ marginBottom: 12 }}>
        Elegí una vista. Por ejemplo: <strong>Laser</strong> te lleva al tablero de la etapa Laser.
      </p>

      <ul style={{ listStyle:'none', padding:0, display:'flex', flexDirection:'column', gap:8 }}>
        {routeLinks.map(r => (
          <li
            key={r.path}
            style={{
              border:'1px solid #ddd',
              borderRadius:8,
              padding:'8px 12px',
              display:'flex',
              justifyContent:'space-between',
              alignItems:'center',
              flexWrap:'wrap',
              gap:8
            }}
          >
            <div>
              <Link to={r.path} style={{ fontWeight:600, textDecoration:'none', color:'var(--brand)' }}>
                {r.label}
              </Link>
              <div style={{ fontSize:12, opacity:.7 }}>
                Ruta: <code>{r.path}</code>
              </div>
            </div>
            <Link to={r.path} className="btn btn--brand">
              Ir
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Nuevo índice de rutas */}
        <Route path="/index" element={<IndexPage />} />

        {/* Home con todas las columnas (incluye iPanel donde aplica) */}
        <Route
          path="/"
          element={<Board stages={ROUTES.find(r => r.path === '/').stages} />}
        />

        {/* Rutas por etapa */}
        {ROUTES.filter(r => r.path !== '/').map(r => (
          <Route key={r.path} path={r.path} element={<Board stages={r.stages} />} />
        ))}

        {/* Tableros especiales */}
        <Route path="/ipanel" element={<IpanelReadOnlyPage />} />
        {/* Redirigimos /Diseño (con tilde) a /diseno para mostrar ambas columnas */}
        <Route path="/Diseño" element={<Navigate to="/diseno" replace />} />
        <Route path="/statusGate" element={<StatusGatePage />} />
        <Route path="/createGate" element={<CreateGatePage />} />
        <Route path="/planta" element={<PlantaReadOnlyPage />} />
        <Route path="/plantasimple" element={<PlantaReadOnlySimplePage />} />
        <Route path="/statusIpanels" element={<StatusIpanelsPage />} />

        {/* Not found -> home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

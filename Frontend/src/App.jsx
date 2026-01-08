// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
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
import PortonesStatsPage from '../pages/PortonesStatsPage';
import AdminLoginPage from '../pages/admin/AdminLoginPage';
import AdminHomePage from '../pages/admin/AdminHomePage';
import WorkflowDesignerPage from '../pages/admin/WorkflowDesignerPage';
import AdminQcPage from '../pages/admin/AdminQcPage';

import LogoDeGrandis from './assets/DeGrandis_1.png';

const color = 'var(--brand)';

const STATUS = {
  PENDIENTE: 'Pendiente',
  EN_PROCESO: 'En Proceso',
  FINALIZADO: 'Finalizado',
};

function apiBase() {
  const v = import.meta.env.VITE_API_URL || '';
  return String(v || '').replace(/\/$/, '');
}

function low(v) { return String(v ?? '').toLowerCase(); }

function isFinalizadoByKey(item, key) {
  // key apunta a la columna status (ej: diseno, laser, etc)
  return low(item?.[key]) === low(STATUS.FINALIZADO);
}

function buildReqIndex(requirements) {
  // requirements: [{stage_key, type, group_id, required_key}, ...]
  const idx = new Map();
  for (const r of requirements || []) {
    const stageKey = String(r?.stage_key || '').trim();
    const type = String(r?.type || '').trim();
    const requiredKey = String(r?.required_key || '').trim();
    const gid = r?.group_id == null ? null : Number(r.group_id);

    if (!stageKey || !type || !requiredKey) continue;

    if (!idx.has(stageKey)) {
      idx.set(stageKey, { all: new Set(), anyGroups: new Map() });
    }
    const bucket = idx.get(stageKey);

    if (type === 'ALL') {
      bucket.all.add(requiredKey);
    } else if (type === 'ANY_GROUP') {
      const g = Number.isFinite(gid) ? gid : 0;
      if (!bucket.anyGroups.has(g)) bucket.anyGroups.set(g, new Set());
      bucket.anyGroups.get(g).add(requiredKey);
    }
  }
  return idx;
}

function canAppearInStage({ item, stageKey, reqIndex }) {
  const st = item?.[stageKey];

  // Si no tiene status en esa columna, no debería estar en esa etapa
  if (st == null) return false;

  // Si ya está en proceso o finalizado, se muestra igual
  const stLow = low(st);
  if (stLow === low(STATUS.EN_PROCESO) || stLow === low(STATUS.FINALIZADO)) return true;

  // Solo gateamos el caso Pendiente
  if (stLow !== low(STATUS.PENDIENTE)) return true;

  // Si no hay requisitos cargados, fallback: mostrar como antes
  if (!reqIndex) return true;

  const req = reqIndex.get(stageKey);
  if (!req) return true; // sin requisitos para esa etapa

  // ALL
  for (const k of req.all) {
    if (!isFinalizadoByKey(item, k)) return false;
  }

  // ANY_GROUP: cada grupo debe tener al menos uno finalizado
  for (const [, set] of req.anyGroups.entries()) {
    const keys = Array.from(set);
    const ok = keys.some(k => isFinalizadoByKey(item, k));
    if (!ok) return false;
  }

  return true;
}

function Board({ stages }) {
  const { data: portones, loading, err, replaceItem, refresh, refreshing } =
    usePortones({ pollMs: 300000 });
  const { data: ipanels, refresh: refreshIpanel } =
    useIpanel({ pollMs: 300000 });

  const [busyId, setBusyId] = useState(null);

  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(null);

  // Workflow config (public read-only)
  const [wfPortones, setWfPortones] = useState(null); // {stages, edges, requirements}
  const [wfIpanel, setWfIpanel] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkflow(line) {
      const base = apiBase();
      const r = await fetch(`${base}/workflow/config?line=${encodeURIComponent(line)}`, { cache: 'no-store' });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        throw new Error(`Error ${r.status} leyendo /workflow/config (${line}). ${t}`);
      }
      return r.json();
    }

    (async () => {
      try {
        const [p, i] = await Promise.all([
          loadWorkflow('portones'),
          loadWorkflow('ipanel'),
        ]);

        if (cancelled) return;

        setWfPortones(p?.ok ? p : null);
        setWfIpanel(i?.ok ? i : null);
      } catch (e) {
        console.warn('No se pudo cargar workflow public config:', e?.message || e);
        if (!cancelled) {
          setWfPortones(null);
          setWfIpanel(null);
        }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const reqIndexPortones = useMemo(() => {
    return wfPortones?.requirements ? buildReqIndex(wfPortones.requirements) : null;
  }, [wfPortones]);

  const reqIndexIpanel = useMemo(() => {
    return wfIpanel?.requirements ? buildReqIndex(wfIpanel.requirements) : null;
  }, [wfIpanel]);

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
    return ipanels.filter(ip => ip.nv === n || ip.partida === n);
  }, [ipanels, filter]);

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
  if (err) return <div className="container" style={{ color: 'crimson' }}>Error: {err}</div>;

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

      <form
        onSubmit={(e) => { e.preventDefault(); setFilter(q.trim()); }}
        style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '10px 0', flexWrap: 'wrap' }}
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

          const baseItems = isIpanel ? filteredIpanels : filteredPortones;
          const reqIndex = isIpanel ? reqIndexIpanel : reqIndexPortones;

          const itemsForStage = baseItems.filter(item =>
            canAppearInStage({ item, stageKey: s.key, reqIndex })
          );

          return (
            <StageColumn
              key={`${s.mode || 'porton'}-${s.key}-${s.label}`}
              title={s.label}
              stageKey={s.key}
              mode={s.mode || 'porton'}
              items={itemsForStage}
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

const ONE = (key, label) => [{ key, label, mode: 'porton' }];

const ROUTES = [
  {
    path: '/',
    label: 'Inicio (Tablero completo)',
    stages: [
      { key: 'diseno', label: 'Diseño (Portones)', mode: 'porton' },
      { key: 'diseno', label: 'Diseño (iPanel)', mode: 'ipanel' },

      { key: 'laser', label: 'Laser', mode: 'porton' },

      { key: 'guillotina', label: 'Corte piernas', mode: 'porton' },
      { key: 'corte_revest', label: 'Corte revestimiento', mode: 'porton' },
      { key: 'guillotina', label: 'Corte Ipanel', mode: 'ipanel' },

      { key: 'plegadora', label: 'Plegado Piernas', mode: 'porton' },
      { key: 'plegado_revest', label: 'Plegado Revestimiento', mode: 'porton' },
      { key: 'plegado', label: 'Plegado Ipanel', mode: 'ipanel' },

      { key: 'armado_piernas', label: 'Prefabricados (Armado de piernas)', mode: 'porton' },
      { key: 'armado_marco_piernas', label: 'Armado de marcos piernas', mode: 'porton' },
      { key: 'armado_hojas', label: 'Armado de hoja', mode: 'porton' },
      { key: 'armado_primario', label: 'Armado Primario', mode: 'porton' },

      { key: 'revestimiento', label: 'Revestimiento', mode: 'porton' },

      { key: 'pintura', label: 'Pintura Portones', mode: 'porton' },
      { key: 'pintura', label: 'Pintura (Ipanels)', mode: 'ipanel' },

      { key: 'inyeccion', label: 'Inyeccion (Portones)', mode: 'porton' },
      { key: 'inyeccion', label: 'Inyeccion Ipanel', mode: 'ipanel' },

      { key: 'armado_final', label: 'Armado Final', mode: 'porton' },

      { key: 'despacho', label: 'Despacho (Portones)', mode: 'porton' },
      { key: 'despacho', label: 'Despacho (iPanel)', mode: 'ipanel' },
    ]
  },

  {
    path: '/diseno',
    label: 'Diseño',
    stages: [
      { key: 'diseno', label: 'Diseño (Portones)', mode: 'porton' },
      { key: 'diseno', label: 'Diseño (iPanel)', mode: 'ipanel' },
    ]
  },

  { path: '/laser', label: 'Laser', stages: ONE('laser', 'Laser') },

  {
    path: '/corte',
    label: 'Corte',
    stages: [
      { key: 'guillotina', label: 'Corte piernas', mode: 'porton' },
      { key: 'corte_revest', label: 'Corte revestimiento', mode: 'porton' },
      { key: 'guillotina', label: 'Corte Ipanel', mode: 'ipanel' },
    ]
  },

  {
    path: '/plegado',
    label: 'Plegado',
    stages: [
      { key: 'plegadora', label: 'Plegado Piernas', mode: 'porton' },
      { key: 'plegado_revest', label: 'Plegado Revestimiento', mode: 'porton' },
      { key: 'plegado', label: 'Plegado Ipanel', mode: 'ipanel' },
    ]
  },

  {
    path: '/prefabricados',
    label: 'Prefabricados / Armado',
    stages: [
      { key: 'armado_piernas', label: 'Prefabricados (Armado de piernas)', mode: 'porton' },
      { key: 'armado_marco_piernas', label: 'Armado de marcos piernas', mode: 'porton' },
      { key: 'armado_hojas', label: 'Armado de hoja', mode: 'porton' },
    ]
  },

  { path: '/armado-primario', label: 'Armado Primario', stages: ONE('armado_primario', 'Armado Primario') },

  {
    path: '/pintura',
    label: 'Pintura',
    stages: [
      { key: 'pintura', label: 'Pintura Portones', mode: 'porton' },
      { key: 'pintura', label: 'Pintura (Ipanels)', mode: 'ipanel' },
    ]
  },

  {
    path: '/inyeccion',
    label: 'Inyección',
    stages: [
      { key: 'inyeccion', label: 'Inyeccion (Portones)', mode: 'porton' },
      { key: 'inyeccion', label: 'Inyeccion Ipanel', mode: 'ipanel' },
    ]
  },

  { path: '/revestimiento', label: 'Revestimiento', stages: ONE('revestimiento', 'Revestimiento') },
  { path: '/armado-final', label: 'Armado Final', stages: ONE('armado_final', 'Armado Final') },

  {
    path: '/despacho',
    label: 'Despacho',
    stages: [
      { key: 'despacho', label: 'Despacho (Portones)', mode: 'porton' },
      { key: 'despacho', label: 'Despacho (iPanel)', mode: 'ipanel' },
    ]
  },
];

function IndexPage() {
  const extraRoutes = [
    { path: '/ipanel', label: 'iPanel (solo lectura)' },
    { path: '/statusGate', label: 'Status Portones' },
    { path: '/createGate', label: 'CreateGate (carga / planificación)' },
    { path: '/planta', label: 'Planta (solo lectura – detalle)' },
    { path: '/plantasimple', label: 'Planta simple (resumen)' },
    { path: '/statusIpanels', label: 'Status iPanels' },
    { path: '/admin/login', label: 'Admin Login' },
    { path: '/admin', label: 'Admin - Menú' },
    { path: '/admin/qc', label: 'Admin - Usuarios QC' },
    { path: '/admin/workflow', label: 'Admin - Workflow Designer' },
  ];

  const routeLinks = [...ROUTES, ...extraRoutes];

  return (
    <div className="container">
      <h1 className="h1" style={{ marginBottom: 16 }}>Índice de tableros</h1>

      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {routeLinks.map(r => (
          <li
            key={r.path}
            style={{
              border: '1px solid #ddd',
              borderRadius: 8,
              padding: '8px 12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8
            }}
          >
            <div>
              <Link to={r.path} style={{ fontWeight: 600, textDecoration: 'none', color: 'var(--brand)' }}>
                {r.label}
              </Link>
              <div style={{ fontSize: 12, opacity: .7 }}>
                Ruta: <code>{r.path}</code>
              </div>
            </div>
            <Link to={r.path} className="btn btn--brand">Ir</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Pantalla de mantenimiento embebida en este mismo archivo (copy/paste total) */
function MaintenancePage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#000',
        color: '#fff',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 760,
          textAlign: 'center',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 18,
          padding: 24,
          background: 'rgba(0,0,0,0.65)',
          boxShadow: '0 14px 40px rgba(0,0,0,0.45)',
        }}
      >
        <div
          style={{
            display: 'grid',
            placeItems: 'center',
            marginBottom: 18,
            padding: 18,
            borderRadius: 14,
            background: '#000', // fondo negro para el logo
            border: '1px solid rgba(255,255,255,0.10)',
          }}
        >
          <img
            src={LogoDeGrandis}
            alt="De Grandis Portones"
            style={{
              width: 280,
              maxWidth: '80%',
              height: 'auto',
              display: 'block',
              objectFit: 'contain',
            }}
          />
        </div>

        <h1 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 700 }}>
          Aplicación en actualización
        </h1>

        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, opacity: 0.9 }}>
          La aplicación se encuentra  en actualización. Te avisaremos cuando ya se encuentre operativa.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Ruta canónica */}
        <Route path="/mantenimiento" element={<MaintenancePage />} />

        {/* TODO el resto deshabilitado */}
        <Route path="*" element={<Navigate to="/mantenimiento" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

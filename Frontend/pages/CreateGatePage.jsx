// src/pages/CreateGatePage.jsx
import { useMemo, useState, useEffect } from 'react';
import usePortones from '../src/hooks/usePortones';
import useIpanels from '../src/hooks/useIpanels';
import {
  createPorton, startStage, stopStage,
  createIpanel, startIpanelStage, stopIpanelStage,
  setFechaPlan, setFechaProd,
  setFechaNV, setFechaMed,
  setFechaPlanEntrega,
  setPortonObservaciones,
  setIpanelFechaNV, setIpanelFechaMed,
  setIpanelFechaProd, setIpanelFechaPlan,
  setIpanelFechaPlanEntrega,
} from '../src/api';
import { isAuthed, login, logout } from '../src/auth/createGateAuth';

const STAGES = [
  { key: 'diseno',               label: 'Diseño' },
  { key: 'laser',                label: 'Laser' },

  // Corte
  { key: 'guillotina',           label: 'Corte (Piernas)' },
  { key: 'corte_revest',         label: 'Corte (Revestimiento)' },

  // Plegado
  { key: 'plegadora',            label: 'Plegado (Piernas)' },
  { key: 'plegado_revest',       label: 'Plegado (Revestimiento)' },

  // Prefabricados / Armados
  { key: 'armado_piernas',       label: 'Armado Piernas' },
  { key: 'armado_marco_piernas', label: 'Armado Marco Piernas' },
  { key: 'armado_hojas',         label: 'Armado Hojas' },
  { key: 'armado_primario',      label: 'Armado Primario' },

  // Sistema / pintura
  { key: 'inyeccion',            label: 'Inyección' },
  { key: 'revestimiento',        label: 'Revestimiento' },
  { key: 'pintura',              label: 'Pintura (Sistemas)' },
  { key: 'pintura_revestimiento',label: 'Pintura (Revestimiento)' },

  { key: 'armado_final',         label: 'Armado Final' },
  { key: 'despacho',             label: 'Despacho' },
];

const IP_STAGES = [
  { key: 'guillotina', label: 'Corte' },
  { key: 'plegado',    label: 'Plegado' },
  { key: 'pintura',    label: 'Pintura' },
  { key: 'inyeccion',  label: 'Inyección' },
];

const SEL_COL_W        = 44;   // selección
const NV_COL_W         = 150;
// Fechas
const FECHA_NV_COL_W   = 170;  // Venta (NV)
const FECHA_MED_COL_W  = 170;  // Medición
const FECHA_PROD_COL_W = 170;  // Producción (inicio)
const FECHA_SAL_COL_W  = 190;  // Fecha planificada salida (usa fecha_plan)
const FECHA_LLEG_COL_W = 190;  // Fecha planificada llegada (usa fecha_plan_entrega)

const GRID_GAP   = 6;
const CELL_MIN_H = 60;
const bordo      = '#008241ff';

const fmt = dt => (dt ? new Date(dt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const dateOnly = v => (v ? String(v).slice(0, 10) : '');

const cellBg = st => {
  const s = (st || '').toLowerCase();
  if (s === 'finalizado') return 'var(--state-done)';
  if (s === 'en proceso') return 'var(--state-process)';
  if (s === 'pendiente')  return 'var(--state-pending)';
  return 'var(--surface)';
};
const cellInk = st => {
  const s = (st || '').toLowerCase();
  if (s === 'finalizado') return 'var(--state-done-ink)';
  if (s === 'en proceso') return 'var(--state-process-ink)';
  if (s === 'pendiente')  return 'var(--state-pending-ink)';
  return 'var(--ink)';
};

const isSistema = p =>
  (p.inyeccion || '').toLowerCase() === 'finalizado' &&
  (p.revestimiento || '').toLowerCase() === 'finalizado';

const isFullyFinishedPorton = p =>
  STAGES.every(s => (p[s.key] == null) || (p[s.key] || '').toLowerCase() === 'finalizado');

const isFullyFinishedIpanel = i =>
  IP_STAGES.every(s => (i[s.key] || '').toLowerCase() === 'finalizado');

/* ==== MODAL DE OBSERVACIONES PORTÓN (estado local, sin lag) ==== */
function PortonObsModal({ open, target, onClose, onSave }) {
  const [draft, setDraft] = useState(target?.observaciones || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(target?.observaciones || '');
  }, [target]);

  if (!open || !target) return null;

  const handleSaveClick = async () => {
    try {
      setSaving(true);
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position:'fixed',
        inset:0,
        background:'rgba(0,0,0,.45)',
        display:'grid',
        placeItems:'center',
        zIndex:9999
      }}
      onClick={onClose}
    >
      <div
        style={{
          background:'var(--surface)',
          padding:20,
          borderRadius:12,
          minWidth:320,
          maxWidth:520,
          boxShadow:'0 10px 30px rgba(0,0,0,.25)',
          display:'flex',
          flexDirection:'column',
          gap:10
        }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ margin:0 }}>
          Observaciones NV {target.nv}
          {target.nlista ? ` - Portón ${target.nlista}` : ''}
        </h3>
        {target.partida != null && (
          <div style={{ fontSize:13, opacity:.8 }}>Partida: {target.partida}</div>
        )}

        <textarea
          rows={6}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          className="btn"
          style={{ resize:'vertical', fontFamily:'inherit', lineHeight:1.3 }}
          placeholder="Escribí notas internas, aclaraciones, etc."
        />

        <div style={{ display:'flex', justifyContent:'space-between', gap:8, marginTop:6 }}>
          <button
            type="button"
            className="btn"
            onClick={() => setDraft('')}
          >
            Limpiar texto
          </button>
          <div style={{ display:'flex', gap:8 }}>
            <button
              type="button"
              className="btn"
              onClick={onClose}
              disabled={saving}
            >
              Cerrar
            </button>
            <button
              type="button"
              className="btn btn--brand"
              onClick={handleSaveClick}
              disabled={saving}
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CreateGatePage() {
  // ---- Login simple ----
  const [authed, setAuthed] = useState(isAuthed());
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [authErr, setAuthErr] = useState('');

  if (!authed) {
    return (
      <div className="screen page" style={{ display:'grid', placeItems:'center', background:'#f7fff3', fontFamily:'system-ui,sans-serif' }}>
        <form
          onSubmit={(e) => { e.preventDefault(); if (login(user.trim(), pass)) { setAuthed(true); setAuthErr(''); setPass(''); } else setAuthErr('Usuario o contraseña inválidos'); }}
          style={{ width:340, display:'flex', flexDirection:'column', gap:10, border:`3px solid ${bordo}`, borderRadius:12, padding:18, background:'var(--surface)' }}
        >
          <h3 style={{ margin:0, color:bordo, textAlign:'center' }}>Acceso CreateGate</h3>
          <input placeholder="Usuario" value={user} onChange={e=>setUser(e.target.value)} autoFocus className="btn" />
          <input type="password" placeholder="Contraseña" value={pass} onChange={e=>setPass(e.target.value)} className="btn" />
          {authErr && <div style={{ color:'crimson', fontSize:13 }}>{authErr}</div>}
          <button type="submit" className="btn btn--brand" style={{ fontWeight:700, borderRadius:8 }}>Entrar</button>
        </form>
      </div>
    );
  }

  // ---- Data ----
  const {
    data: dataP, loading, err, replaceItem, refresh, refreshing
  } = usePortones({ pollMs: 300000 });

  const {
    data: dataI, loading: loadingI, err: errI, replaceItem: replaceI,
    refresh: refreshI, refreshing: refreshingI
  } = useIpanels({ pollMs: 300000 });

  // iPanels: mostrar Despacho cuando "ver solo iPanels"
  const [onlyIpanels, setOnlyIpanels] = useState(false);
  const IP_STAGES_RENDER = useMemo(
    () => (onlyIpanels ? [...IP_STAGES, { key: 'despacho', label: 'Despacho' }] : IP_STAGES),
    [onlyIpanels]
  );

  // ---- Estado local para fechas por fila (PORTONES) ----
  const [fechaLocal, setFechaLocal] = useState({});
  const [fechaLlegadaLocal, setFechaLlegadaLocal] = useState({});
  const [fechaProdLocal, setFechaProdLocal] = useState({});
  const [fechaNVLocal, setFechaNVLocal]   = useState({});
  const [fechaMedLocal, setFechaMedLocal] = useState({});

  const setLocalFechaSalida   = (id, ymd) => setFechaLocal(prev          => ({ ...prev, [id]: ymd }));
  const setLocalFechaLlegada  = (id, ymd) => setFechaLlegadaLocal(prev   => ({ ...prev, [id]: ymd }));
  const setLocalFechaProd     = (id, ymd) => setFechaProdLocal(prev      => ({ ...prev, [id]: ymd }));
  const setLocalFechaNV       = (id, ymd) => setFechaNVLocal(prev        => ({ ...prev, [id]: ymd }));
  const setLocalFechaMed      = (id, ymd) => setFechaMedLocal(prev       => ({ ...prev, [id]: ymd }));

  // ---- Estado local para fechas por fila (IPANELS) ----
  const [fechaLocalI, setFechaLocalI] = useState({});
  const [fechaLlegadaLocalI, setFechaLlegadaLocalI] = useState({});
  const [fechaProdLocalI, setFechaProdLocalI] = useState({});
  const [fechaNVLocalI, setFechaNVLocalI] = useState({});
  const [fechaMedLocalI, setFechaMedLocalI] = useState({});

  const setLocalFechaSalidaI   = (id, ymd) => setFechaLocalI(prev        => ({ ...prev, [id]: ymd }));
  const setLocalFechaLlegadaI  = (id, ymd) => setFechaLlegadaLocalI(prev => ({ ...prev, [id]: ymd }));
  const setLocalFechaProdI     = (id, ymd) => setFechaProdLocalI(prev    => ({ ...prev, [id]: ymd }));
  const setLocalFechaNVI       = (id, ymd) => setFechaNVLocalI(prev      => ({ ...prev, [id]: ymd }));
  const setLocalFechaMedI      = (id, ymd) => setFechaMedLocalI(prev     => ({ ...prev, [id]: ymd }));

  // Guardar/Quitar: Plan SALIDA (portón)
  const guardarFechaSalida = async (p) => {
    const current = dateOnly(p.fecha_plan);
    const val = fechaLocal[p.id] ?? current;
    const ymd = val && /^\d{4}-\d{2}-\d{2}$/.test(val) ? val : null;
    try {
      const { data: upd } = await setFechaPlan(p.id, ymd);
      replaceItem(upd);
      setLocalFechaSalida(p.id, dateOnly(upd.fecha_plan));
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  };
  const limpiarFechaSalida = async (p) => {
    try {
      const { data: upd } = await setFechaPlan(p.id, null);
      replaceItem(upd);
      setLocalFechaSalida(p.id, '');
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  };

  // Guardar/Quitar: Plan LLEGADA (portón)
  const guardarFechaLlegada = async (p) => {
    const current = dateOnly(p.fecha_plan_entrega);
    const val = fechaLlegadaLocal[p.id] ?? current;
    const ymd = val && /^\d{4}-\d{2}-\d{2}$/.test(val) ? val : null;
    try {
      const { data: upd } = await setFechaPlanEntrega(p.id, ymd);
      replaceItem(upd);
      setLocalFechaLlegada(p.id, dateOnly(upd.fecha_plan_entrega));
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  };
  const limpiarFechaLlegada = async (p) => {
    try {
      const { data: upd } = await setFechaPlanEntrega(p.id, null);
      replaceItem(upd);
      setLocalFechaLlegada(p.id, '');
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  };

  // Guardar/Quitar: Producción (portón)
  const guardarFechaProd = async (p) => {
    const current = dateOnly(p.fecha_prod);
    const val = fechaProdLocal[p.id] ?? current;
    const ymd = val && /^\d{4}-\d{2}-\d{2}$/.test(val) ? val : null;
    try {
      const { data: upd } = await setFechaProd(p.id, ymd);
      replaceItem(upd);
      setLocalFechaProd(p.id, dateOnly(upd.fecha_prod));
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  };
  const limpiarFechaProd = async (p) => {
    try {
      const { data: upd } = await setFechaProd(p.id, null);
      replaceItem(upd);
      setLocalFechaProd(p.id, '');
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  };

  // Guardar/Quitar: Venta (NV) (portón)
  const guardarFechaNV = async (p) => {
    const current = dateOnly(p.fecha_nv);
    const val = fechaNVLocal[p.id] ?? current;
    const ymd = val && /^\d{4}-\d{2}-\d{2}$/.test(val) ? val : null;
    try {
      const { data: upd } = await setFechaNV(p.id, ymd);
      replaceItem(upd);
      setLocalFechaNV(p.id, dateOnly(upd.fecha_nv));
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  };
  const limpiarFechaNV = async (p) => {
    try {
      const { data: upd } = await setFechaNV(p.id, null);
      replaceItem(upd);
      setLocalFechaNV(p.id, '');
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  };

  // Guardar/Quitar: Medición (portón)
  const guardarFechaMed = async (p) => {
    const current = dateOnly(p.fecha_med);
    const val = fechaMedLocal[p.id] ?? current;
    const ymd = val && /^\d{4}-\d{2}-\d{2}$/.test(val) ? val : null;
    try {
      const { data: upd } = await setFechaMed(p.id, ymd);
      replaceItem(upd);
      setLocalFechaMed(p.id, dateOnly(upd.fecha_med));
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  };
  const limpiarFechaMed = async (p) => {
    try {
      const { data: upd } = await setFechaMed(p.id, null);
      replaceItem(upd);
      setLocalFechaMed(p.id, '');
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  };

  // ====== FECHAS IPANEL ======

  // Guardar/Quitar: Producción iPanel
  const guardarFechaProdI = async (i) => {
    const current = dateOnly(i.fecha_prod);
    const val = fechaProdLocalI[i.id] ?? current;
    const ymd = val && /^\d{4}-\d{2}-\d{2}$/.test(val) ? val : null;
    try {
      const { data: upd } = await setIpanelFechaProd(i.id, ymd);
      replaceI(upd);
      setLocalFechaProdI(i.id, dateOnly(upd.fecha_prod));
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  };

  const limpiarFechaProdI = async (i) => {
    try {
      const { data: upd } = await setIpanelFechaProd(i.id, null);
      replaceI(upd);
      setLocalFechaProdI(i.id, '');
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  };

  // Guardar/Quitar: Venta (NV) iPanel
  const guardarFechaNVI = async (i) => {
    const current = dateOnly(i.fecha_nv);
    const val = fechaNVLocalI[i.id] ?? current;
    const ymd = val && /^\d{4}-\d{2}-\d{2}$/.test(val) ? val : null;
    try {
      const { data: upd } = await setIpanelFechaNV(i.id, ymd);
      replaceI(upd);
      setLocalFechaNVI(i.id, dateOnly(upd.fecha_nv));
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  };

  const limpiarFechaNVI = async (i) => {
    try {
      const { data: upd } = await setIpanelFechaNV(i.id, null);
      replaceI(upd);
      setLocalFechaNVI(i.id, '');
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  };

  // Guardar/Quitar: Medición iPanel
  const guardarFechaMedI = async (i) => {
    const current = dateOnly(i.fecha_med);
    const val = fechaMedLocalI[i.id] ?? current;
    const ymd = val && /^\d{4}-\d{2}-\d{2}$/.test(val) ? val : null;
    try {
      const { data: upd } = await setIpanelFechaMed(i.id, ymd);
      replaceI(upd);
      setLocalFechaMedI(i.id, dateOnly(upd.fecha_med));
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  };

  const limpiarFechaMedI = async (i) => {
    try {
      const { data: upd } = await setIpanelFechaMed(i.id, null);
      replaceI(upd);
      setLocalFechaMedI(i.id, '');
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  };

  // Guardar/Quitar: Plan SALIDA iPanel
  const guardarFechaSalidaI = async (i) => {
    const current = dateOnly(i.fecha_plan);
    const val = fechaLocalI[i.id] ?? current;
    const ymd = val && /^\d{4}-\d{2}-\d{2}$/.test(val) ? val : null;
    try {
      const { data: upd } = await setIpanelFechaPlan(i.id, ymd);
      replaceI(upd);
      setLocalFechaSalidaI(i.id, dateOnly(upd.fecha_plan));
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  };

  const limpiarFechaSalidaI = async (i) => {
    try {
      const { data: upd } = await setIpanelFechaPlan(i.id, null);
      replaceI(upd);
      setLocalFechaSalidaI(i.id, '');
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  };

  // Guardar/Quitar: Plan LLEGADA iPanel
  const guardarFechaLlegadaI = async (i) => {
    const current = dateOnly(i.fecha_plan_entrega);
    const val = fechaLlegadaLocalI[i.id] ?? current;
    const ymd = val && /^\d{4}-\d{2}-\d{2}$/.test(val) ? val : null;
    try {
      const { data: upd } = await setIpanelFechaPlanEntrega(i.id, ymd);
      replaceI(upd);
      setLocalFechaLlegadaI(i.id, dateOnly(upd.fecha_plan_entrega));
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  };

  const limpiarFechaLlegadaI = async (i) => {
    try {
      const { data: upd } = await setIpanelFechaPlanEntrega(i.id, null);
      replaceI(upd);
      setLocalFechaLlegadaI(i.id, '');
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  };

  // ---- Selección de filas (portones) ----
  const [selected, setSelected] = useState(new Set());
  const toggleSel = (id) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  // ---- Popup de observaciones (solo target + abierto) ----
  const [obsOpen, setObsOpen] = useState(false);
  const [obsTarget, setObsTarget] = useState(null);

  const openObsModal = (p) => {
    setObsTarget(p);
    setObsOpen(true);
  };

  const closeObsModal = () => {
    setObsOpen(false);
    setObsTarget(null);
  };

  const handleSaveObs = async (texto) => {
    if (!obsTarget) return;
    try {
      await setPortonObservaciones(obsTarget.id, texto);
      await refresh();
      closeObsModal();
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  };

  // ---- Métricas Portones ----
  const fabKeysPorton = useMemo(() => STAGES.filter(s => s.key !== 'despacho').map(s => s.key), []);
  const terminadosEnPlanta = useMemo(() => {
    if (!Array.isArray(dataP)) return 0;
    return dataP.filter(p =>
      (p.armado_final || '').toLowerCase() === 'finalizado' &&
      (p.despacho     || '').toLowerCase() === 'pendiente'
    ).length;
  }, [dataP]);

  const enColaFabricacion = useMemo(() => {
    if (!Array.isArray(dataP)) return 0;
    return dataP.filter(p =>
      fabKeysPorton.every(k => {
        const st = (p[k] || '').toLowerCase();
        return st === '' || st === 'pendiente';
      })
    ).length;
  }, [dataP, fabKeysPorton]);

  const enProcesoFabricacion = useMemo(() => {
    if (!Array.isArray(dataP)) return 0;
    const total = dataP.length;
    return Math.max(0, total - terminadosEnPlanta - enColaFabricacion);
  }, [dataP, terminadosEnPlanta, enColaFabricacion]);

  const partidasEnProcesoP = useMemo(() => {
    if (!Array.isArray(dataP)) return [];
    const low = v => (v || '').toLowerCase();
    const set = new Set();
    for (const p of dataP) {
      const af  = low(p.armado_final);
      const dis = low(p.diseno);
      const afOk  = af === 'pendiente' || af === 'en proceso';
      const disOk = dis === 'en proceso' || dis === 'finalizado';
      if (afOk && disOk && p.partida != null) set.add(p.partida);
    }
    return Array.from(set).sort((a, b) => Number(a) - Number(b));
  }, [dataP]);

  // ---- Métricas iPanels ----
  const ipTerm = useMemo(() => {
    if (!Array.isArray(dataI)) return 0;
    return dataI.filter(isFullyFinishedIpanel).length;
  }, [dataI]);

  const ipCola = useMemo(() => {
    if (!Array.isArray(dataI)) return 0;
    return dataI.filter(i =>
      IP_STAGES.every(s => {
        const st = (i[s.key] || '').toLowerCase();
        return st === '' || st === 'pendiente';
      })
    ).length;
  }, [dataI]);

  const ipProc = useMemo(() => {
    if (!Array.isArray(dataI)) return 0;
    const total = dataI.length;
    return Math.max(0, total - ipTerm - ipCola);
  }, [dataI, ipTerm, ipCola]);

  const ipPartidasEnProceso = useMemo(() => {
    if (!Array.isArray(dataI)) return [];
    const set = new Set();
    for (const it of dataI) {
      const anyProc = IP_STAGES.some(s => (it[s.key] || '').toLowerCase() === 'en proceso');
      if (anyProc && it.partida != null) set.add(it.partida);
    }
    return Array.from(set).sort((a,b) => Number(a) - Number(b));
  }, [dataI]);

  // ---- Form crear (modo) ----
  const [createModeIpanel, setCreateModeIpanel] = useState(false);
  const [nv, setNv] = useState('');
  const [nlista, setNlista] = useState('');
  const [partida, setPartida] = useState('');
  const [sistemaOnCreate, setSistemaOnCreate] = useState(false);
  const [requiresInjection, setRequiresInjection] = useState(false);

  // ---- Buscar (Portones) ----
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(null);

  // ---- Buscar (iPanels) ----
  const [qIpanel, setQIpanel] = useState('');
  const [filterIpanel, setFilterIpanel] = useState(null);

  // ---- Listas (Portones) ----
  const baseListPortones = useMemo(() => {
    if (!Array.isArray(dataP)) return [];
    const hasFilter = filter !== null && filter !== '';
    if (hasFilter) {
      const n = Number(filter);
      if (!Number.isNaN(n)) return dataP.filter(p => p.nv === n || p.nlista === n);
    }
    return dataP.filter(p => !isFullyFinishedPorton(p));
  }, [dataP, filter]);

  const listPortones = useMemo(() => {
    const arr = [...baseListPortones];

    arr.sort((a, b) => {
      const da = dateOnly(a.fecha_plan);
      const db = dateOnly(b.fecha_plan);
      const hasA = !!da;
      const hasB = !!db;

      if (hasA && !hasB) return -1;
      if (!hasA && hasB) return 1;

      if (hasA && hasB) {
        const tA = new Date(`${da}T00:00:00`).getTime();
        const tB = new Date(`${db}T00:00:00`).getTime();
        if (tA !== tB) return tA - tB;
      }

      return ((a.nlista || 0) - (b.nlista || 0)) ||
             ((a.nv || 0) - (b.nv || 0));
    });

    return arr;
  }, [baseListPortones]);

  const stageStats = useMemo(() => {
    const stats = {};
    STAGES.forEach(s => (stats[s.key] = { pend: 0, proc: 0 }));
    for (const p of listPortones) {
      for (const s of STAGES) {
        const st = (p[s.key] || '').toLowerCase();
        if (st === 'pendiente') stats[s.key].pend++;
        else if (st === 'en proceso') stats[s.key].proc++;
      }
    }
    return stats;
  }, [listPortones]);

  // ---- Listas (iPanels) ----
  const baseListIpanels = useMemo(() => {
    if (!Array.isArray(dataI)) return [];
    let base = dataI.filter(i => !isFullyFinishedIpanel(i));

    const hasFilter = filterIpanel !== null && filterIpanel !== '';
    if (hasFilter) {
      const n = Number(filterIpanel);
      if (!Number.isNaN(n)) {
        base = base.filter(i => i.nv === n || i.partida === n);
      }
    }
    return base;
  }, [dataI, filterIpanel]);

  const listIpanels = useMemo(() => {
    const base = [...baseListIpanels];
    base.sort((a, b) =>
      (Number(a.partida) || 0) - (Number(b.partida) || 0) ||
      (a.nv || 0) - (b.nv || 0)
    );
    return base;
  }, [baseListIpanels]);

  const stageStatsI = useMemo(() => {
    const st = {};
    IP_STAGES.forEach(s => (st[s.key] = { pend: 0, proc: 0 }));
    for (const i of listIpanels) {
      for (const s of IP_STAGES) {
        const val = (i[s.key] || '').toLowerCase();
        if (val === 'pendiente') st[s.key].pend++;
        else if (val === 'en proceso') st[s.key].proc++;
      }
    }
    return st;
  }, [listIpanels]);

  // ---- Acciones Portones/Ipanels ----
  const SISTEMA_STAGES = ['inyeccion', 'revestimiento', 'corte_revest', 'plegado_revest'];

  async function finalizeSistema(id) {
    let updated = null;
    for (const st of SISTEMA_STAGES) {
      try {
        const { data } = await stopStage(id, st);
        updated = data;
      } catch (e) {
        console.warn(`No se pudo finalizar ${st} para id=${id}:`, e?.response?.data || e.message);
      }
    }
    return updated;
  }

  async function handleCreatePorton() {
    const nNv = Number(nv), nNl = Number(nlista);
    const nPa = partida === '' ? null : Number(partida);
    if (!Number.isInteger(nNv) || !Number.isInteger(nNl)) {
      alert('Ingresá NV y NLista como enteros.');
      return;
    }
    if (nPa !== null && !Number.isInteger(nPa)) {
      alert('NPartida debe ser entero (o dejalo vacío).');
      return;
    }
    const payload = { nv: nNv, nlista: nNl };
    if (nPa !== null) payload.partida = nPa;

    const { data: created } = await createPorton(payload);

    if (!requiresInjection) {
      await stopStage(created.id, 'inyeccion');
    }
    if (sistemaOnCreate) {
      await finalizeSistema(created.id);
    }

    setNv(''); setNlista(''); setPartida(''); setSistemaOnCreate(false); setRequiresInjection(false);
    await refresh();
  }

  async function handleCreateIpanel() {
    const nNv = Number(nv);
    const nPa = partida === '' ? null : Number(partida);
    if (!Number.isInteger(nNv)) {
      alert('Ingresá NV como entero.');
      return;
    }
    if (nPa !== null && !Number.isInteger(nPa)) {
      alert('NPartida debe ser entero (o dejalo vacío).');
      return;
    }
    const payload = { nv: nNv };
    if (nPa !== null) payload.partida = nPa;

    await createIpanel(payload);
    setNv(''); setNlista(''); setPartida('');
    await refreshI();
  }

  async function handleCreate(e) {
    e.preventDefault();
    try {
      if (createModeIpanel) await handleCreateIpanel();
      else await handleCreatePorton();
    } catch (e2) {
      alert(e2?.response?.data?.error || e2.message);
    }
  }

  async function handleCellClickPorton(p, s) {
    const status = (p[s.key] || '').toLowerCase();
    try {
      if (status === 'pendiente') {
        if (confirm(`¿Iniciar "${s.label}" para NV ${p.nv}?`)) {
          const { data: upd } = await startStage(p.id, s.key); replaceItem(upd);
        }
      } else if (status === 'en proceso') {
        if (confirm(`¿Finalizar "${s.label}" para NV ${p.nv}?`)) {
          const { data: upd } = await stopStage(p.id, s.key); replaceItem(upd);
        }
      }
    } catch (e) { alert(e?.response?.data?.error || e.message); }
  }

  async function handleCellClickIpanel(i, s) {
    const status = (i[s.key] || '').toLowerCase();
    try {
      if (status === 'pendiente') {
        if (confirm(`¿Iniciar "${s.label}" para NV ${i.nv}?`)) {
          const { data: upd } = await startIpanelStage(i.id, s.key); replaceI(upd);
        }
      } else if (status === 'en proceso') {
        if (confirm(`¿Finalizar "${s.label}" para NV ${i.nv}?`)) {
          const { data: upd } = await stopIpanelStage(i.id, s.key); replaceI(upd);
        }
      }
    } catch (e) { alert(e?.response?.data?.error || e.message); }
  }

  // ---- Exportar XLSX ----
  async function handleExportXlsxAll(rows) {
    const xlsxMod = await import('xlsx');
    const XLSX = xlsxMod.default || xlsxMod;

    const header = [
      'NV', 'Lista', 'Partida',
      'Fecha venta (NV)',
      'Fecha medición',
      'Fecha planificada salida',
      'Fecha planificada llegada',
      ...STAGES.flatMap(s => [
        `${s.label} - Estado`, `${s.label} - Inicio`, `${s.label} - Fin`
      ])
    ];

    const dataRows = rows.map(p => {
      const fila = [
        p.nv ?? '',
        p.nlista ?? '',
        p.partida ?? '',
        (p.fecha_nv           ? String(p.fecha_nv).slice(0,10)           : ''),
        (p.fecha_med          ? String(p.fecha_med).slice(0,10)          : ''),
        (p.fecha_plan         ? String(p.fecha_plan).slice(0,10)         : ''), // salida
        (p.fecha_plan_entrega ? String(p.fecha_plan_entrega).slice(0,10) : ''), // llegada
      ];
      for (const s of STAGES) {
        const st  = p[s.key] || '';
        const ini = p[`${s.key}_inicio`] ? fmt(p[`${s.key}_inicio`]) : '';
        const fin = p[`${s.key}_fin`]    ? fmt(p[`${s.key}_fin`])    : '';
        fila.push(st, ini, fin);
      }
      return fila;
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
    ws['!cols'] = [
      { wch: 8 },   // NV
      { wch: 10 },  // Lista
      { wch: 10 },  // Partida
      { wch: 14 },  // Fecha venta (NV)
      { wch: 14 },  // Fecha medición
      { wch: 18 },  // Fecha planificada salida
      { wch: 18 },  // Fecha planificada llegada
      ...STAGES.flatMap(() => [{ wch: 16 }, { wch: 20 }, { wch: 20 }])
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Portones');

    const pad = n => String(n).padStart(2, '0');
    const now = new Date();
    const fname = `portones_${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.xlsx`;
    XLSX.writeFile(wb, fname);
  }

  async function handleExportSelected() {
    const rows = listPortones.filter(p => selected.has(p.id));
    if (rows.length === 0) return;
    await handleExportXlsxAll(rows);
  }

  // ---- Sticky helpers ----
  const stickyLeft0   = { position: 'sticky', left: 0, zIndex: 4, background: 'var(--surface)', boxShadow: '1px 0 0 rgba(0,0,0,.08)' };
  const stickyLeftNV  = { position: 'sticky', left: SEL_COL_W, zIndex: 4, background: 'var(--surface)', boxShadow: '1px 0 0 rgba(0,0,0,.08)' };

  // ---- Render ----
  const cellBase   = { border: `2px solid ${bordo}`, padding: 8, borderRadius: 12, boxSizing: 'border-box' };
  const headerCell = { ...cellBase, background:'var(--surface)', fontWeight:700, textAlign:'center' };
  const nvCell     = { ...cellBase, background:'var(--surface)', minHeight:CELL_MIN_H, display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, paddingLeft:10, paddingRight:10 };

  return (
    <div className="screen page" style={{ fontFamily:'system-ui,sans-serif' }}>
      {/* ===== Header: controles ===== */}
      <div className="page__header page__header--split">
        <div className="left-stack">
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button
              onClick={() => { refresh(); refreshI(); }}
              disabled={refreshing || refreshingI}
              className="btn"
            >
              {(refreshing || refreshingI) ? 'Actualizando…' : 'Refrescar'
              }
            </button>

            <button
              onClick={() => handleExportXlsxAll(listPortones)}
              disabled={loading || (listPortones?.length ?? 0) === 0}
              className="btn"
              title="Exporta Portones visibles en la grilla"
            >
              Exportar XLSX
            </button>

            <button
              onClick={handleExportSelected}
              disabled={loading || selected.size === 0}
              className="btn"
              title="Exporta solo los portones seleccionados"
            >
              Exportar seleccionados {selected.size > 0 ? `(${selected.size})` : ''}
            </button>

            <button onClick={()=>{ logout(); setAuthed(false); }} className="btn">
              Salir
            </button>
          </div>
        </div>
      </div>

      <br />

      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <label style={{ display:'flex', alignItems:'center', gap:6 }}>
          <input
            type="checkbox"
            checked={onlyIpanels}
            onChange={e => setOnlyIpanels(e.target.checked)}
          />
          Ver solo iPanels
        </label>
        <label style={{ display:'flex', gap:6, alignItems:'center', marginRight:12 }}>
          <input
            type="checkbox"
            checked={createModeIpanel}
            onChange={e => setCreateModeIpanel(e.target.checked)}
          />
          Crear iPanel
        </label>
      </div>

      <br />

      {/* ===== Crear ===== */}
      <form
        onSubmit={handleCreate}
        className="page__header"
        style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', paddingTop:0 }}
      >
        <input
          type="number"
          placeholder="NV"
          value={nv}
          onChange={e=>setNv(e.target.value)}
          className={`btn input-num ${nv ? 'input-num--filled' : ''}`}
          style={{ width:140, textAlign:'center' }}
        />

        {!createModeIpanel && (
          <input
            type="number"
            placeholder="NLista"
            value={nlista}
            onChange={e=>setNlista(e.target.value)}
            className={`btn input-num ${nlista ? 'input-num--filled' : ''}`}
            style={{ width:140, textAlign:'center' }}
          />
        )}

        <input
          type="number"
          placeholder="NPartida (opcional)"
          value={partida}
          onChange={e=>setPartida(e.target.value)}
          className={`btn input-num ${partida ? 'input-num--filled' : ''}`}
          style={{ width:180, textAlign:'center' }}
        />

        {!createModeIpanel && (
          <>
            <label style={{ display:'flex', gap:6, alignItems:'center', marginLeft:8 }}>
              <input
                type="checkbox"
                checked={sistemaOnCreate}
                onChange={(e)=>setSistemaOnCreate(e.target.checked)}
              />
              Sistema (finaliza Inyección y Revestimiento)
            </label>

            <label style={{ display:'flex', gap:6, alignItems:'center' }}>
              <input
                type="checkbox"
                checked={requiresInjection}
                onChange={(e)=>setRequiresInjection(e.target.checked)}
              />
              Inyección (requiere inyección)
            </label>
          </>
        )}

        <button type="submit" className="btn btn--brand">
          {createModeIpanel ? 'Crear iPanel' : 'Crear portón'}
        </button>
      </form>

      <br />

      {/* ===== Buscar (Portones) ===== */}
      {!onlyIpanels && (
        <form
          onSubmit={(e)=>{ e.preventDefault(); setFilter(q.trim()); }}
          className="page__header"
          style={{ display:'flex', gap:8, alignItems:'center', marginTop:-8, flexWrap:'wrap', paddingTop:0 }}
        >
          <input
            type="text"
            placeholder="Buscar por NV o NPortón (número)"
            value={q}
            onChange={(e)=>setQ(e.target.value)}
            className="btn"
            style={{ minWidth:260 }}
            inputMode="numeric"
          />
          <button type="submit" className="btn">Buscar</button>
          <button
            type="button"
            className="btn"
            onClick={()=>{ setQ(''); setFilter(null); }}
          >
            Limpiar
          </button>
        </form>
      )}

      {/* ===== Buscar (iPanels) ===== */}
      {onlyIpanels && (
        <form
          onSubmit={(e)=>{ e.preventDefault(); setFilterIpanel(qIpanel.trim()); }}
          className="page__header"
          style={{ display:'flex', gap:8, alignItems:'center', marginTop:-8, flexWrap:'wrap', paddingTop:0 }}
        >
          <input
            type="text"
            placeholder="Buscar iPanel por NV o NPartida (número)"
            value={qIpanel}
            onChange={(e)=>setQIpanel(e.target.value)}
            className="btn"
            style={{ minWidth:260 }}
            inputMode="numeric"
          />
          <button type="submit" className="btn">Buscar</button>
          <button
            type="button"
            className="btn"
            onClick={()=>{ setQIpanel(''); setFilterIpanel(null); }}
          >
            Limpiar
          </button>
        </form>
      )}

      {(loading || loadingI) && <div className="page__header">Cargando…</div>}
      {(err || errI) && <div className="page__header" style={{ color:'crimson' }}>Error: {err || errI}</div>}

      {/* ===== GRILLAS ===== */}
      <div className="grid-scroll">
        {/* --- Portones Grid --- */}
        {!onlyIpanels && (
          <div style={{ marginBottom:24 }}>
            <div
              style={{
                display:'grid',
                gridTemplateColumns: `${SEL_COL_W}px ${NV_COL_W}px ${FECHA_NV_COL_W}px ${FECHA_MED_COL_W}px ${FECHA_PROD_COL_W}px ${FECHA_SAL_COL_W}px ${FECHA_LLEG_COL_W}px repeat(${STAGES.length}, 1fr)`,
                columnGap: GRID_GAP,
                rowGap: GRID_GAP,
                alignItems:'stretch',
                width:'max-content',
                padding:16
              }}
            >
              {/* Header selección (esquina) */}
              <div style={{ ...headerCell, position:'sticky', top:0, left:0, zIndex:6, background:'var(--surface)', textAlign:'center' }}>
                Sel
              </div>

              {/* Header NV */}
              <div style={{ ...headerCell, position:'sticky', top:0, left:SEL_COL_W, zIndex:5, textAlign:'center', background:'var(--surface)' }}>
                NV / Lista / Partida
              </div>

              {/* Header Venta (NV) */}
              <div style={{ ...headerCell, position:'sticky', top:0, zIndex:5, background:'var(--surface)', textAlign:'center' }}>
                Venta (NV)
              </div>

              {/* Header Medición */}
              <div style={{ ...headerCell, position:'sticky', top:0, zIndex:5, background:'var(--surface)', textAlign:'center' }}>
                Medición
              </div>

              {/* Header Producción (inicio) */}
              <div style={{ ...headerCell, position:'sticky', top:0, zIndex:5, background:'var(--surface)', textAlign:'center' }}>
                Producción (inicio)
              </div>

              {/* Header Fecha planificada salida */}
              <div style={{ ...headerCell, position:'sticky', top:0, zIndex:5, background:'var(--surface)', textAlign:'center' }}>
                Fecha planificada salida
              </div>

              {/* Header Fecha planificada llegada */}
              <div style={{ ...headerCell, position:'sticky', top:0, zIndex:5, background:'var(--surface)', textAlign:'center' }}>
                Fecha planificada llegada
              </div>

              {STAGES.map(s => (
                <div key={`h-${s.key}`} style={{ ...headerCell, position:'sticky', top:0, zIndex:5, background:'var(--surface)', textAlign:'center' }}>
                  <div>{s.label}</div>
                </div>
              ))}

              {/* Filas */}
              {listPortones.map(p => {
                const currentSalida  = dateOnly(p.fecha_plan);
                const valSalida      = fechaLocal[p.id] ?? currentSalida;

                const currentLlegada = dateOnly(p.fecha_plan_entrega);
                const valLlegada     = fechaLlegadaLocal[p.id] ?? currentLlegada;

                const currentProd = dateOnly(p.fecha_prod);
                const valProd     = fechaProdLocal[p.id] ?? currentProd;

                const currentNV   = dateOnly(p.fecha_nv);
                const valNV       = fechaNVLocal[p.id] ?? currentNV;

                const currentMed  = dateOnly(p.fecha_med);
                const valMed      = fechaMedLocal[p.id] ?? currentMed;

                return ([
                  // Columna selección
                  <div key={`sel-${p.id}`} style={{ ...cellBase, ...stickyLeft0, minHeight:CELL_MIN_H, display:'grid', placeItems:'center' }}>
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggleSel(p.id)}
                      aria-label={`Seleccionar NV ${p.nv}`}
                      style={{ width:18, height:18 }}
                    />
                  </div>,

                  // NV / Lista / Partida (abre popup de observaciones)
                  <div
                    key={`nv-${p.id}`}
                    style={{ ...nvCell, ...stickyLeftNV, cursor:'pointer' }}
                    onClick={() => openObsModal(p)}
                    title="Click para ver/editar observaciones"
                  >
                    <div style={{ display:'flex', flexDirection:'column', lineHeight:1.15 }}>
                      <strong>NV {p.nv}</strong>
                      <strong>N° Partida {p.partida ?? ''}</strong>
                      <span style={{ fontSize:12, opacity:.8 }}>N° Portón {p.nlista}</span>
                      {p.observaciones && (
                        <span style={{ fontSize:11, marginTop:4, color:'#555' }}>
                          📝 {p.observaciones.slice(0, 40)}{p.observaciones.length > 40 ? '…' : ''}
                        </span>
                      )}
                    </div>
                  </div>,

                  // Fecha de VENTA (NV)
                  <div key={`fnv-${p.id}`} style={{ ...cellBase, minHeight:CELL_MIN_H }}>
                    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                      <input
                        type="date"
                        value={valNV || ''}
                        onChange={e => setLocalFechaNV(p.id, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') guardarFechaNV(p); }}
                        className="btn"
                        style={{ height:34 }}
                      />
                      <div style={{ display:'flex', gap:6 }}>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => guardarFechaNV(p)}
                          disabled={(valNV || '') === (currentNV || '')}
                          title="Guardar fecha de venta (NV)"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => limpiarFechaNV(p)}
                          disabled={!currentNV}
                          title="Quitar fecha de venta (NV)"
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  </div>,

                  // Fecha de MEDICIÓN
                  <div key={`fmed-${p.id}`} style={{ ...cellBase, minHeight:CELL_MIN_H }}>
                    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                      <input
                        type="date"
                        value={valMed || ''}
                        onChange={e => setLocalFechaMed(p.id, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') guardarFechaMed(p); }}
                        className="btn"
                        style={{ height:34 }}
                      />
                      <div style={{ display:'flex', gap:6 }}>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => guardarFechaMed(p)}
                          disabled={(valMed || '') === (currentMed || '')}
                          title="Guardar fecha de medición"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => limpiarFechaMed(p)}
                          disabled={!currentMed}
                          title="Quitar fecha de medición"
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  </div>,

                  // Fecha de PRODUCCIÓN (inicio)
                  <div key={`fprod-${p.id}`} style={{ ...cellBase, minHeight:CELL_MIN_H }}>
                    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                      <input
                        type="date"
                        value={valProd || ''}
                        onChange={e => setLocalFechaProd(p.id, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') guardarFechaProd(p); }}
                        className="btn"
                        style={{ height:34 }}
                      />
                      <div style={{ display:'flex', gap:6 }}>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => guardarFechaProd(p)}
                          disabled={(valProd || '') === (currentProd || '')}
                          title="Guardar fecha de inicio de producción"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => limpiarFechaProd(p)}
                          disabled={!currentProd}
                          title="Quitar fecha de inicio de producción"
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  </div>,

                  // Fecha PLANIFICADA SALIDA
                  <div key={`fplan-salida-${p.id}`} style={{ ...cellBase, minHeight:CELL_MIN_H }}>
                    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                      <input
                        type="date"
                        value={valSalida || ''}
                        onChange={e => setLocalFechaSalida(p.id, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') guardarFechaSalida(p); }}
                        className="btn"
                        style={{ height:34 }}
                      />
                      <div style={{ display:'flex', gap:6 }}>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => guardarFechaSalida(p)}
                          disabled={(valSalida || '') === (currentSalida || '')}
                          title="Guardar fecha planificada salida"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => limpiarFechaSalida(p)}
                          disabled={!currentSalida}
                          title="Quitar fecha planificada salida"
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  </div>,

                  // Fecha PLANIFICADA LLEGADA
                  <div key={`fplan-llegada-${p.id}`} style={{ ...cellBase, minHeight:CELL_MIN_H }}>
                    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                      <input
                        type="date"
                        value={valLlegada || ''}
                        onChange={e => setLocalFechaLlegada(p.id, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') guardarFechaLlegada(p); }}
                        className="btn"
                        style={{ height:34 }}
                      />
                      <div style={{ display:'flex', gap:6 }}>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => guardarFechaLlegada(p)}
                          disabled={(valLlegada || '') === (currentLlegada || '')}
                          title="Guardar fecha planificada llegada"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => limpiarFechaLlegada(p)}
                          disabled={!currentLlegada}
                          title="Quitar fecha planificada llegada"
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  </div>,

                  // Etapas
                  ...STAGES.map(s => {
                    const st  = p[s.key];
                    const ini = p[`${s.key}_inicio`];
                    const fin = p[`${s.key}_fin`];
                    const lower = (st || '').toLowerCase();
                    const clickable = lower === 'pendiente' || lower === 'en proceso';
                    return (
                      <div
                        key={`${p.id}-${s.key}`}
                        onClick={() => clickable && handleCellClickPorton(p, s)}
                        style={{
                          ...cellBase,
                          background: cellBg(st),
                          color: cellInk(st),
                          minHeight: CELL_MIN_H,
                          display:'flex',
                          flexDirection:'column',
                          justifyContent:'center',
                          cursor: clickable ? 'pointer' : 'default',
                          outline: clickable ? '2px dashed rgba(0,0,0,.12)' : 'none'
                        }}
                        title={[
                          `Estado: ${st || ''}`,
                          ini ? `Inicio: ${fmt(ini)}` : null,
                          fin ? `Fin: ${fmt(fin)}` : null,
                          clickable ? (lower === 'pendiente' ? 'Click: Iniciar' : 'Click: Finalizar') : 'Finalizado'
                        ].filter(Boolean).join('\n')}
                      >
                        <div style={{ fontSize:12, fontWeight:700 }}>{st || ''}</div>
                        <div style={{ fontSize:11 }}>{ini ? `Inicio: ${fmt(ini)}` : ''}</div>
                        <div style={{ fontSize:11 }}>{fin ? `Fin: ${fmt(fin)}` : ''}</div>
                      </div>
                    );
                  })
                ]);
              })}

              {listPortones.length === 0 && (
                <div style={{ gridColumn:`1 / span ${STAGES.length + 7}`, marginTop:12, opacity:.7 }}>
                  Sin resultados.
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- iPanels Grid --- */}
        {onlyIpanels && (
          <div>
            <div
              style={{
                display:'grid',
                gridTemplateColumns: `${NV_COL_W}px ${FECHA_NV_COL_W}px ${FECHA_MED_COL_W}px ${FECHA_PROD_COL_W}px ${FECHA_SAL_COL_W}px ${FECHA_LLEG_COL_W}px repeat(${IP_STAGES_RENDER.length}, 1fr)`,
                columnGap: GRID_GAP,
                rowGap: GRID_GAP,
                alignItems:'stretch',
                width:'max-content',
                padding:16
              }}
            >
              {/* Header iPanels */}
              <div style={{ ...headerCell, position:'sticky', top:0, left:0, zIndex:6, background:'var(--surface)', textAlign:'center' }}>NV / Partida</div>

              {/* Headers de fechas (ahora editables igual que Portones) */}
              <div style={{ ...headerCell, position:'sticky', top:0, zIndex:5, background:'var(--surface)', textAlign:'center' }}>Venta (NV)</div>
              <div style={{ ...headerCell, position:'sticky', top:0, zIndex:5, background:'var(--surface)', textAlign:'center' }}>Medición</div>
              <div style={{ ...headerCell, position:'sticky', top:0, zIndex:5, background:'var(--surface)', textAlign:'center' }}>Producción (inicio)</div>
              <div style={{ ...headerCell, position:'sticky', top:0, zIndex:5, background:'var(--surface)', textAlign:'center' }}>Fecha planificada salida</div>
              <div style={{ ...headerCell, position:'sticky', top:0, zIndex:5, background:'var(--surface)', textAlign:'center' }}>Fecha planificada llegada</div>

              {IP_STAGES_RENDER.map(s => (
                <div key={`ip-h-${s.key}`} style={{ ...headerCell, position:'sticky', top:0, zIndex:5, background:'var(--surface)', textAlign:'center' }}>
                  <div>{s.label}</div>
                </div>
              ))}

              {/* Filas iPanels */}
              {listIpanels.map(i => {
                const currentNV      = dateOnly(i.fecha_nv);
                const valNVI         = fechaNVLocalI[i.id] ?? currentNV;

                const currentMed     = dateOnly(i.fecha_med);
                const valMedI        = fechaMedLocalI[i.id] ?? currentMed;

                const currentProd    = dateOnly(i.fecha_prod);
                const valProdI       = fechaProdLocalI[i.id] ?? currentProd;

                const currentSalida  = dateOnly(i.fecha_plan);
                const valSalidaI     = fechaLocalI[i.id] ?? currentSalida;

                const currentLlegada = dateOnly(i.fecha_plan_entrega);
                const valLlegadaI    = fechaLlegadaLocalI[i.id] ?? currentLlegada;

                return ([
                  // NV / Partida
                  <div key={`ip-nv-${i.id}`} style={{ ...nvCell, position:'sticky', left:0, zIndex:4, background:'var(--surface)', boxShadow:'1px 0 0 rgba(0,0,0,.08)' }}>
                    <div style={{ display:'flex', flexDirection:'column', lineHeight:1.15 }}>
                      <strong>NV {i.nv}</strong>
                      <strong>N° Partida {i.partida ?? ''}</strong>
                    </div>
                  </div>,

                  // Fecha VENTA (NV) – editable
                  <div key={`ip-fnv-${i.id}`} style={{ ...cellBase, minHeight:CELL_MIN_H }}>
                    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                      <input
                        type="date"
                        value={valNVI || ''}
                        onChange={e => setLocalFechaNVI(i.id, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') guardarFechaNVI(i); }}
                        className="btn"
                        style={{ height:34 }}
                      />
                      <div style={{ display:'flex', gap:6 }}>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => guardarFechaNVI(i)}
                          disabled={(valNVI || '') === (currentNV || '')}
                          title="Guardar fecha de venta (NV)"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => limpiarFechaNVI(i)}
                          disabled={!currentNV}
                          title="Quitar fecha de venta (NV)"
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  </div>,

                  // Fecha MEDICIÓN – editable
                  <div key={`ip-fmed-${i.id}`} style={{ ...cellBase, minHeight:CELL_MIN_H }}>
                    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                      <input
                        type="date"
                        value={valMedI || ''}
                        onChange={e => setLocalFechaMedI(i.id, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') guardarFechaMedI(i); }}
                        className="btn"
                        style={{ height:34 }}
                      />
                      <div style={{ display:'flex', gap:6 }}>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => guardarFechaMedI(i)}
                          disabled={(valMedI || '') === (currentMed || '')}
                          title="Guardar fecha de medición"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => limpiarFechaMedI(i)}
                          disabled={!currentMed}
                          title="Quitar fecha de medición"
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  </div>,

                  // Fecha PRODUCCIÓN – editable
                  <div key={`ip-fpr-${i.id}`} style={{ ...cellBase, minHeight:CELL_MIN_H }}>
                    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                      <input
                        type="date"
                        value={valProdI || ''}
                        onChange={e => setLocalFechaProdI(i.id, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') guardarFechaProdI(i); }}
                        className="btn"
                        style={{ height:34 }}
                      />
                      <div style={{ display:'flex', gap:6 }}>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => guardarFechaProdI(i)}
                          disabled={(valProdI || '') === (currentProd || '')}
                          title="Guardar fecha de inicio de producción"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => limpiarFechaProdI(i)}
                          disabled={!currentProd}
                          title="Quitar fecha de inicio de producción"
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  </div>,

                  // Fecha PLANIFICADA SALIDA – editable
                  <div key={`ip-fps-${i.id}`} style={{ ...cellBase, minHeight:CELL_MIN_H }}>
                    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                      <input
                        type="date"
                        value={valSalidaI || ''}
                        onChange={e => setLocalFechaSalidaI(i.id, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') guardarFechaSalidaI(i); }}
                        className="btn"
                        style={{ height:34 }}
                      />
                      <div style={{ display:'flex', gap:6 }}>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => guardarFechaSalidaI(i)}
                          disabled={(valSalidaI || '') === (currentSalida || '')}
                          title="Guardar fecha planificada salida"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => limpiarFechaSalidaI(i)}
                          disabled={!currentSalida}
                          title="Quitar fecha planificada salida"
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  </div>,

                  // Fecha PLANIFICADA LLEGADA – editable
                  <div key={`ip-fpl-${i.id}`} style={{ ...cellBase, minHeight:CELL_MIN_H }}>
                    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                      <input
                        type="date"
                        value={valLlegadaI || ''}
                        onChange={e => setLocalFechaLlegadaI(i.id, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') guardarFechaLlegadaI(i); }}
                        className="btn"
                        style={{ height:34 }}
                      />
                      <div style={{ display:'flex', gap:6 }}>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => guardarFechaLlegadaI(i)}
                          disabled={(valLlegadaI || '') === (currentLlegada || '')}
                          title="Guardar fecha planificada llegada"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => limpiarFechaLlegadaI(i)}
                          disabled={!currentLlegada}
                          title="Quitar fecha planificada llegada"
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  </div>,

                  // Etapas
                  ...IP_STAGES_RENDER.map(s => {
                    const st  = i[s.key];
                    const ini = i[`${s.key}_inicio`];
                    const fin = i[`${s.key}_fin`];
                    const lower = (st || '').toLowerCase();
                    const clickable = lower === 'pendiente' || lower === 'en proceso';
                    return (
                      <div
                        key={`ip-${i.id}-${s.key}`}
                        onClick={() => clickable && handleCellClickIpanel(i, s)}
                        style={{
                          ...cellBase,
                          background: cellBg(st),
                          color: cellInk(st),
                          minHeight: CELL_MIN_H,
                          display:'flex',
                          flexDirection:'column',
                          justifyContent:'center',
                          cursor: clickable ? 'pointer' : 'default',
                          outline: clickable ? '2px dashed rgba(0,0,0,.12)' : 'none'
                        }}
                        title={[
                          `Estado: ${st || ''}`,
                          ini ? `Inicio: ${fmt(ini)}` : null,
                          fin ? `Fin: ${fmt(fin)}` : null,
                          clickable ? (lower === 'pendiente' ? 'Click: Iniciar' : 'Click: Finalizar') : 'Finalizado'
                        ].filter(Boolean).join('\n')}
                      >
                        <div style={{ fontSize:12, fontWeight:700 }}>{st || ''}</div>
                        <div style={{ fontSize:11 }}>{ini ? `Inicio: ${fmt(ini)}` : ''}</div>
                        <div style={{ fontSize:11 }}>{fin ? `Fin: ${fmt(fin)}` : ''}</div>
                      </div>
                    );
                  })
                ]);
              })}

              {listIpanels.length === 0 && (
                <div style={{ gridColumn:`1 / span ${IP_STAGES_RENDER.length + 6}`, marginTop:12, opacity:.7 }}>
                  Sin resultados.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ==== MODAL OBSERVACIONES ==== */}
      <PortonObsModal
        open={obsOpen}
        target={obsTarget}
        onClose={closeObsModal}
        onSave={handleSaveObs}
      />
    </div>
  );
}

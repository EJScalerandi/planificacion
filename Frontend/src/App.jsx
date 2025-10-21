import { useState } from 'react';
import usePortones from './hooks/usePortones';
import { startStage, stopStage } from './api';
import StageColumn from './components/StageColumn';

const color = '#82000f';

// Orden y etiquetas de todas las etapas (podés ocultar/mostrar las que quieras)
const STAGE_ORDER = [
  { key: 'diseno',          label: 'Diseño' },
  { key: 'laser',           label: 'Laser' },
  { key: 'guillotina',      label: 'Corte' },
  { key: 'plegadora',       label: 'Plegado' },
  { key: 'armado_piernas',  label: 'Armado Piernas' },
  { key: 'armado_primario', label: 'Armado Primario' },
  { key: "armado_hojas" ,   label: "Armado Hojas" },
  { key: 'inyeccion',       label: 'Inyección' },
  { key: 'revestimiento',   label: 'Revestimiento' },
  { key: 'pintura',         label: 'Pintura' },
  { key: 'armado_final',    label: 'Armado Final' },
  { key: 'despacho',        label: 'Despacho' }
];

export default function App() {
  const { data, loading, err, replaceItem } = usePortones();
  const [busyId, setBusyId] = useState(null);

  const handleStart = async (id, stage) => {
    try {
      setBusyId(id);
      const { data: updated } = await startStage(id, stage);
      replaceItem(updated); // pasa a “En Proceso”
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
      replaceItem(updated); // “Finalizado” y la siguiente etapa queda “Pendiente”
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div style={{ padding: 16 }}>Cargando…</div>;
  if (err) return <div style={{ padding: 16, color: 'crimson' }}>Error: {err}</div>;

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ color, border: `3px solid ${color}`, padding: 8, maxWidth: 800 }}>
        FILTROS POR SECTOR
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginTop: 10 }}>
        {STAGE_ORDER.map(s => (
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

import { useState } from 'react';
import StageColumn from './StageColumn';
import usePortones from '../hooks/usePortones';
import { startStage, stopStage } from '../api';

const color = '#82000f';

export default function StageBoard({ stages }) {
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
  if (err) return <div style={{ padding: 16, color: 'crimson' }}>Error: {err}</div>;

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

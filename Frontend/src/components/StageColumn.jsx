const color = '#82000f';

export default function StageColumn({ title, stageKey, items, onStart, onStop, disabledId }) {
  // Sólo mostrar Pendiente
  const pend = items.filter(p => (p[stageKey] || '').toLowerCase() === 'pendiente');

  return (
    <div style={{ border: `3px solid ${color}`, padding: 12, minWidth: 260 }}>
      <div style={{ fontWeight: 700, color, marginBottom: 8 }}>{title}</div>

      {pend.length === 0 ? (
        <div style={{ opacity: 0.7 }}>Sin pendientes</div>
      ) : pend.map(p => (
        <div key={p.id} style={{ border: `1px solid ${color}`, padding: 8, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            <div>
              <div><strong>NV:</strong> {p.nv}</div>
              <div style={{ color, fontSize: 12 }}>Pendiente</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                title="Iniciar (En Proceso)"
                disabled={disabledId === p.id}
                onClick={() => onStart(p.id, stageKey)}
              >▶️</button>

              <button
                title="Finalizar"
                disabled={disabledId === p.id}
                onClick={() => onStop(p.id, stageKey)}
              >⏹️</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

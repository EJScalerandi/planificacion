const bordo = '#82000f';

function normalize(s) {
  return (s || '').toLowerCase();
}

// src/components/StageColumn.jsx
export default function StageColumn({
  title, stageKey, items = [], onStart, onStop, disabledId
}) {
  // Mostrar Pendiente + En Proceso (y ocultar todo-finalizado)
  const list = (items || [])
    .filter(p => {
      const v = (p[stageKey] || '').toLowerCase();
      // si el portón tiene todas las etapas finalizadas en general, dejalo fuera aquí (lo pediste para tableros)
      // pero si implementaste ese filtro a nivel lista global, podés omitir esto:
      return v === 'pendiente' || v === 'en proceso';
    })
    .sort((a,b) => String(a.nlista).localeCompare(String(b.nlista)));

  return (
    <section className="stage">
      <div className="stage__head">{title}</div>
      <div className="stage__list">
        {list.map(p => {
          const status = (p[stageKey] || '').toLowerCase();
          const isProc = status === 'en proceso';
          return (
            <div className="gate" key={p.id}>
              <div>
                <div className="gate__nv"><strong>{p.nlista}</strong></div>
                <div className="gate__list">NV {p.nv}</div>
              </div>
              <div className="actions">
                <button
                  className="btn"
                  onClick={() => onStart(p.id, stageKey)}
                  disabled={disabledId === p.id || isProc}
                  title="Iniciar (En Proceso)"
                >▶</button>
                <button
                  className="btn"
                  onClick={() => onStop(p.id, stageKey)}
                  disabled={disabledId === p.id || !isProc}
                  title="Finalizar"
                >⏹</button>
              </div>
              <div className="gate__status">
                Estado: {p[stageKey] || ''}
              </div>
            </div>
          )
        })}
        {list.length === 0 && (
          <div style={{color:'var(--muted)', fontSize:13}}>Sin pendientes/en proceso.</div>
        )}
      </div>
    </section>
  );
}


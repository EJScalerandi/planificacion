const bordo = '#82000f';

function normalize(s) {
  return (s || '').toLowerCase();
}

export default function StageColumn({ title, stageKey, items, onStart, onStop, disabledId }) {
  // Mostrar Pendiente y En Proceso
  const visible = items.filter(p => {
    const st = normalize(p[stageKey]);
    return st === 'pendiente' || st === 'en proceso';
  });

  // (opcional) primero los En Proceso
  const sorted = [...visible].sort((a, b) => {
    const A = normalize(a[stageKey]);
    const B = normalize(b[stageKey]);
    if (A === 'en proceso' && B !== 'en proceso') return -1;
    if (B === 'en proceso' && A !== 'en proceso') return 1;
    return 0;
  });

  return (
    <div style={{ border: `3px solid ${bordo}`, padding: 12, minWidth: 260, borderRadius: 8 }}>
      <div style={{ fontWeight: 700, color: bordo, marginBottom: 8 }}>{title}</div>

      {sorted.length === 0 ? (
        <div style={{ opacity: 0.7 }}>Sin pendientes ni en proceso</div>
      ) : (
        sorted.map(p => {
          const status = p[stageKey] || '';
          const st = normalize(status);

          const isPending   = st === 'pendiente';
          const isInProcess = st === 'en proceso';

          const canStart = isPending   && disabledId !== p.id;
          const canStop  = isInProcess && disabledId !== p.id;

          const inicio = p[`${stageKey}_inicio`];
          const fin    = p[`${stageKey}_fin`];

          return (
            <div
              key={p.id}
              style={{
                border: `1px solid ${bordo}`,
                padding: 10,
                marginBottom: 8,
                borderRadius: 8,
                background: '#fff'
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
                title={[
                  status ? `Estado: ${status}` : null,
                  inicio ? `Inicio: ${new Date(inicio).toLocaleString()}` : null,
                  fin    ? `Fin: ${new Date(fin).toLocaleString()}`       : null,
                ].filter(Boolean).join('\n')}
              >
                {/* Identificación del portón: NLista grande + NV chico */}
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>
                    N° Porton {p.nlista}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    NV {p.nv}
                  </div>
                  <div style={{ fontSize: 12, color: bordo, marginTop: 4 }}>
                    {status}
                  </div>
                </div>

                {/* Acciones */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    title="Iniciar (En Proceso)"
                    disabled={!canStart}
                    onClick={() => onStart(p.id, stageKey)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: `1px solid ${canStart ? bordo : '#ddd'}`,
                      cursor: canStart ? 'pointer' : 'not-allowed',
                      background: canStart ? '#f8f0f1' : '#f6f6f6'
                    }}
                  >
                    ▶️
                  </button>

                  <button
                    title="Finalizar"
                    disabled={!canStop}
                    onClick={() => onStop(p.id, stageKey)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: `1px solid ${canStop ? bordo : '#ddd'}`,
                      cursor: canStop ? 'pointer' : 'not-allowed',
                      background: canStop ? '#f8f0f1' : '#f6f6f6'
                    }}
                  >
                    ⏹️
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// pages/admin/IndiceProgramacionPage.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAdminToken, adminGetNotaNodo, adminSetNotaNodo } from '../../src/api';

const nodeBoxStyle = {
  position: 'relative',
  zIndex: 1,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  boxShadow: 'var(--shadow)',
  padding: '14px 18px',
  minHeight: 56,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  fontWeight: 900,
  color: 'var(--text)',
  cursor: 'pointer',
};

// Contenido que se muestra al hacer click en cada cuadro. Todavía sin
// definir salvo Planificador (en construcción) - el resto queda pendiente.
const NODE_CONTENT = {
  planificador: {
    label: 'Planificador',
    description:
      'Es el sistema interno de gestión de producción: un tablero tipo kanban que trackea cada ' +
      'portón e iPanel a través de todas las etapas de fabricación (diseño, láser, corte, plegado, ' +
      'armado, revestimiento, pintura, inyección, despacho), con inicio/fin de etapa y control de ' +
      'calidad. Antes de entrar a producción, cada partida pasa por autorizaciones de preproducción, ' +
      'y hay un circuito aparte para revisión de piezas observadas/rechazadas y su refabricación.',
    items: [
      'Tablero de producción (/board y tableros por sección/etapa)',
      'CreateGate: carga y planificación de portones/NV, fechas de producción y salida',
      'Status Portones / Status iPanels: estado y avance por NV',
      'Planta / Planta simple: vistas de solo lectura del estado de planta',
      'Autorizaciones de Preproducción (portones e iPanels)',
      'Revisión / Refabricación: piezas observadas, rechazadas y reingreso a fabricación',
      'Stats Portones: estadísticas de producción',
    ],
    adminUser: 'admin',
    adminPassword: 'admin123',
  },
};

function Node({ id, gridArea, label, extraStyle, onOpen }) {
  return (
    <div
      className="ip-node"
      style={{ ...nodeBoxStyle, ...extraStyle, gridArea }}
      onClick={() => onOpen(id, label)}
    >
      {label}
    </div>
  );
}

const vLineStyle = {
  justifySelf: 'center',
  width: 2,
  height: '100%',
  background: 'var(--border)',
};

const hLineStyle = {
  alignSelf: 'center',
  height: 2,
  width: '100%',
  background: 'var(--border)',
};

// Color de "línea p": más oscuro que las líneas rectas del cruce (var(--border)).
const LINEA_P_COLOR = 'var(--text)';

const hLineaPStyle = {
  alignSelf: 'center',
  width: '100%',
  height: 0,
  borderTop: `2px dashed ${LINEA_P_COLOR}`,
};

// Conector curvo libre (no atado a filas/columnas del grid), dibujado con un
// path SVG en coordenadas porcentuales sobre todo el diagrama. "línea p" es
// la primera: Presupuestador -> Integrador, curvada para no pasar por encima
// del logo de Odoo. A rayas, más oscura que las líneas rectas del cruce.
function ConnectorPath({ d, color = LINEA_P_COLOR }) {
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={2.5}
      strokeDasharray="6 4"
      vectorEffect="non-scaling-stroke"
    />
  );
}

export default function IndiceProgramacionPage() {
  const nav = useNavigate();
  const [openNode, setOpenNode] = useState(null);
  const [openNodeLabel, setOpenNodeLabel] = useState('');
  const [nota, setNota] = useState('');
  const [notaMeta, setNotaMeta] = useState(null);
  const [notaLoading, setNotaLoading] = useState(false);
  const [notaSaving, setNotaSaving] = useState(false);

  useEffect(() => {
    const t = getAdminToken();
    if (!t) nav('/admin/login', { replace: true });
  }, [nav]);

  useEffect(() => {
    if (!openNode) return;
    setNota('');
    setNotaMeta(null);
    setNotaLoading(true);
    adminGetNotaNodo(openNode)
      .then(({ data }) => {
        setNota(data?.nota || '');
        setNotaMeta(data?.updated_by ? { updatedBy: data.updated_by, updatedAt: data.updated_at } : null);
      })
      .catch(() => {})
      .finally(() => setNotaLoading(false));
  }, [openNode]);

  const saveNota = () => {
    if (!openNode) return;
    setNotaSaving(true);
    adminSetNotaNodo(openNode, nota)
      .then(({ data }) => setNotaMeta(data?.updated_by ? { updatedBy: data.updated_by, updatedAt: data.updated_at } : null))
      .catch(() => {})
      .finally(() => setNotaSaving(false));
  };

  const openContent = openNode ? NODE_CONTENT[openNode] : null;

  const openNodeModal = (id, label) => {
    setOpenNode(id);
    setOpenNodeLabel(label);
  };

  return (
    <div className="container">
      <style>{`
        .ip-node { transition: transform .15s ease, box-shadow .15s ease; }
        .ip-node:hover { transform: scale(1.06); box-shadow: 0 8px 20px rgba(0,0,0,.18); }
      `}</style>

      <div className="header-row" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 className="h1" style={{ margin: 0 }}>Índice de Programación</h1>
          <span className="idx-pill">BETA</span>
        </div>
      </div>

      <div style={{ overflowX: 'auto', padding: '24px 0' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(160px,1fr) 90px minmax(200px,auto) 90px minmax(160px,1fr)',
            gridTemplateRows: 'auto 90px auto 90px auto 90px auto 90px auto',
            gridTemplateAreas:
              '"chatbox . precios . ." ' +
              '"chatArrow . precioLine . ." ' +
              '"crm . top intPlanLine planificador" ' +
              '"crmLine . lineTop . ." ' +
              '"left lineLeft center lineRight right" ' +
              '". . lineBottom . ." ' +
              '"sisAntiguo . bottom . ." ' +
              '". . importLine . ." ' +
              '". . importador . ."',
            position: 'relative',
            maxWidth: 900,
            margin: '0 auto',
          }}
        >
          <svg
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {/* línea p: Presupuestador -> Integrador, diagonal recta */}
            <ConnectorPath d="M 10 52 L 50 27" />
            {/* línea p: Odoo -> Planificador, diagonal recta */}
            <ConnectorPath d="M 50 52 L 90 27" />
            {/* línea p: Información de venta -> Remitos, diagonal recta */}
            <ConnectorPath d="M 50 76 L 90 52" />
            {/* línea p: Sistema antiguo -> Odoo, diagonal recta */}
            <ConnectorPath d="M 10 76 L 50 52" />
          </svg>

          <Node id="chatbox" gridArea="chatbox" label="Chatbox" onOpen={openNodeModal} />
          <div style={{ ...vLineStyle, gridArea: 'chatArrow' }} />

          <Node id="precios" gridArea="precios" label="Actualización de precios" onOpen={openNodeModal} />
          <div style={{ ...vLineStyle, gridArea: 'precioLine' }} />

          <Node id="crm" gridArea="crm" label="CRM" onOpen={openNodeModal} />

          <Node id="top" gridArea="top" label="Integrador" onOpen={openNodeModal} />
          <div style={{ ...vLineStyle, gridArea: 'lineTop' }} />

          <div style={{ ...hLineaPStyle, gridArea: 'intPlanLine' }} />
          <Node
            id="planificador"
            gridArea="planificador"
            label="Planificador"
            extraStyle={{ border: '2px solid var(--brand)' }}
            onOpen={openNodeModal}
          />

          <div style={{ ...vLineStyle, gridArea: 'crmLine' }} />

          <Node id="left" gridArea="left" label="Presupuestador" onOpen={openNodeModal} />
          <div style={{ ...hLineStyle, gridArea: 'lineLeft' }} />

          <div style={{ gridArea: 'center', position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'center' }}>
            <div
              style={{
                background: '#714B67',
                borderRadius: 32,
                padding: '28px 40px',
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <img src="/logos/odoo.png" alt="Odoo" style={{ maxWidth: 220, width: '100%', height: 'auto' }} />
            </div>
          </div>

          <div style={{ ...hLineStyle, gridArea: 'lineRight' }} />
          <Node id="right" gridArea="right" label="Remitos" onOpen={openNodeModal} />

          <Node id="sisAntiguo" gridArea="sisAntiguo" label="Sistema antiguo" onOpen={openNodeModal} />

          <div style={{ ...vLineStyle, gridArea: 'lineBottom' }} />
          <Node id="bottom" gridArea="bottom" label="Información de venta" onOpen={openNodeModal} />

          <div style={{ ...vLineStyle, gridArea: 'importLine' }} />
          <Node id="importador" gridArea="importador" label="Importador" onOpen={openNodeModal} />
        </div>
      </div>

      {openNode && (
        <div
          onClick={() => setOpenNode(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              boxShadow: 'var(--shadow)',
              padding: 20,
              minWidth: 320,
              maxWidth: '90vw',
              maxHeight: '80vh',
              overflow: 'auto',
            }}
          >
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: 'var(--text)' }}>
                  {openContent?.label || openNodeLabel}
                </h2>
                <button type="button" className="btn" onClick={() => setOpenNode(null)}>Cerrar</button>
              </div>
              {(openContent?.adminUser || openContent?.adminPassword) && (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  usuario: {openContent.adminUser || '—'} · contraseña: {openContent.adminPassword || '—'}
                </div>
              )}
            </div>

            <p style={{ margin: '0 0 12px', color: 'var(--text)' }}>
              {openContent?.description || 'Descripción pendiente de definir.'}
            </p>

            {openContent?.items?.length > 0 && (
              <ul style={{ margin: '0 0 16px', paddingLeft: 18, color: 'var(--text)' }}>
                {openContent.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}

            {openContent && (
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>
                  ¿Qué estás trabajando en este programa? (se ve en tiempo real para todos)
                </label>
                <textarea
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  onBlur={saveNota}
                  disabled={notaLoading}
                  rows={4}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: 8,
                    font: 'inherit',
                    color: 'var(--text)',
                    background: 'var(--surface)',
                    resize: 'vertical',
                  }}
                  placeholder="Ej: Juan - agregando validación de stock..."
                />
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  {notaSaving
                    ? 'Guardando…'
                    : notaMeta
                      ? `Última edición: ${notaMeta.updatedBy || '—'}`
                      : 'Se guarda automáticamente al salir del campo.'}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

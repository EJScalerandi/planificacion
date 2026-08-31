// src/pages/IndexPage.jsx
import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useMemo } from 'react';

function parseJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    return JSON.parse(atob(b64 + pad));
  } catch {
    return null;
  }
}

function readAdminToken() {
  return (
    localStorage.getItem('dg_admin_token') ||
    localStorage.getItem('token') ||
    localStorage.getItem('admin_token') ||
    localStorage.getItem('auth_token') ||
    sessionStorage.getItem('token') ||
    sessionStorage.getItem('admin_token') ||
    sessionStorage.getItem('auth_token') ||
    ''
  );
}

function readStoredScopes() {
  const raw =
    localStorage.getItem('admin_scopes') ||
    sessionStorage.getItem('admin_scopes') ||
    '';

  if (raw) {
    try {
      const j = JSON.parse(raw);
      if (Array.isArray(j)) return j.map(String);
      if (typeof j === 'string') return j.split(/[,\s]+/).filter(Boolean);
    } catch {
      return String(raw).split(/[,\s]+/).filter(Boolean);
    }
  }

  const token = readAdminToken();
  const payload = parseJwtPayload(token);
  if (!payload) return [];

  const toArr = (v) => {
    if (!v) return [];
    if (Array.isArray(v)) return v.map(String);
    if (typeof v === 'string') return v.split(/[,\s]+/).filter(Boolean);
    return [];
  };

  return [...toArr(payload.scopes), ...toArr(payload.scope), ...toArr(payload.permissions)];
}

function clearAdminSession() {
  const keys = ['dg_admin_token', 'token', 'admin_token', 'auth_token', 'admin_scopes'];
  for (const k of keys) localStorage.removeItem(k);
  for (const k of keys) sessionStorage.removeItem(k);
}

function isStaticPage(path) {
  return /\.html(?:$|[?#])/.test(String(path || ''));
}

export default function IndexPage({ routes = [] }) {
  const nav = useNavigate();

  const scopes = useMemo(() => new Set(readStoredScopes().map((x) => String(x || '').trim()).filter(Boolean)), []);
  const has = (s) => scopes.has(s);

  const isQcAdmin = has('qc:admin');
  const isWfAdmin = has('workflow:admin');
  const isPreprodAdmin = has('preproduccion:admin') || has('preproduccion:full');
  const canUsers = has('users:admin');
  const isPrefabAdmin = has('prefabricados:admin');
  const isStAdmin = has('servicio_tecnico:admin');
  const isComprasAdmin = has('compras:admin');
  const isSchedAdmin = has('scheduling:admin');

  const isPreprodOnly = isPreprodAdmin && !isQcAdmin && !isWfAdmin && !canUsers;

  useEffect(() => {
    const token = readAdminToken();
    if (!String(token || '').trim()) nav('/admin/login', { replace: true });
  }, [nav]);

  const logout = () => {
    clearAdminSession();
    nav('/admin/login', { replace: true });
  };

  const publicRoutes = useMemo(() => [
    { path: '/estado-porton', label: 'Consulta pública · Estado por NV' },
  ], []);

  const adminRoutes = useMemo(() => {
    if (isPreprodOnly) return [];
    const out = [];
    if (isQcAdmin) out.push({ path: '/admin/qc', label: 'Admin · Usuarios QC' });
    if (isWfAdmin) out.push({ path: '/admin/workflow', label: 'Admin · Workflow (Designer)' });
    if (isSchedAdmin) out.push({ path: '/admin/scheduling', label: 'Admin · Motor de Reglas de Tiempo (Beta)' });
    if (canUsers) out.push({ path: '/b', label: 'Admin · Usuarios / Permisos (Dashboard)' });
    if (isQcAdmin || isWfAdmin) out.push({ path: '/admin/excel-info', label: 'Admin · Información Excel' });
    if (isPrefabAdmin) out.push({ path: '/admin/prefabricados', label: 'Admin · Prefabricados' });
    if (isStAdmin) out.push({ path: '/admin/servicio-tecnico', label: 'Admin · Servicio Técnico / Ord. Externas' });
    if (isComprasAdmin) out.push({ path: '/admin/insumos', label: 'Admin · Compras (Pedidos de Insumos)' });
    if (isComprasAdmin) out.push({ path: '/admin/insumos/entregas', label: 'Admin · Compras · Entregas de Insumos' });
    if (isComprasAdmin) out.push({ path: '/admin/insumos/config', label: 'Admin · Compras · Config Categorías↔Sección' });
    return out;
  }, [isPreprodOnly, isQcAdmin, isWfAdmin, canUsers, isPrefabAdmin, isStAdmin, isComprasAdmin, isSchedAdmin]);

  const opsRoutes = useMemo(() => {
    if (isPreprodOnly) return [];
    if (!(isQcAdmin || isWfAdmin)) return [];
    return [
      { path: '/board', label: 'Producción · Tablero completo' },
      ...routes
        .filter((r) => r?.path && r.path !== '/board')
        .map((r) => ({ path: r.path, label: r.label })),
    ];
  }, [isPreprodOnly, isQcAdmin, isWfAdmin, routes]);

  const revisionRoutes = useMemo(() => {
    if (isPreprodOnly) return [];
    if (!(isQcAdmin || isWfAdmin)) return [];
    return [
      { path: '/refabricacion', label: 'Revisión · Observados / Rechazados / Refabricación' },
    ];
  }, [isPreprodOnly, isQcAdmin, isWfAdmin]);

  const preprodRoutes = useMemo(() => [
    { path: '/a', label: 'Autorizaciones · Preproducción Portones' },
    { path: '/i', label: 'Autorizaciones · Preproducción iPanels' },
    { path: '/listas-precios.html', label: 'Actualizar listas de precios' },
  ], []);

  const infoRoutes = useMemo(() => {
    if (isPreprodOnly) return preprodRoutes;

    if (isPreprodAdmin && !(isQcAdmin || isWfAdmin)) {
      return preprodRoutes;
    }

    if (!(isQcAdmin || isWfAdmin)) return [];

    return [
      ...preprodRoutes,
      { path: '/ipanel', label: 'iPanel (solo lectura)' },
      { path: '/statusGate', label: 'Status Portones' },
      { path: '/createGate', label: 'CreateGate (carga / planificación)' },
      { path: '/planta', label: 'Planta (solo lectura – detalle)' },
      { path: '/plantasimple', label: 'Planta simple (resumen)' },
      { path: '/statusIpanels', label: 'Status iPanels' },
      { path: '/stats/portones', label: 'Stats · Portones' },
    ];
  }, [isPreprodOnly, isPreprodAdmin, isQcAdmin, isWfAdmin, preprodRoutes]);

  const NavTitle = ({ r }) => {
    if (isStaticPage(r.path)) {
      return <a href={r.path} className="idx-linkTitle">{r.label}</a>;
    }
    return <Link to={r.path} className="idx-linkTitle">{r.label}</Link>;
  };

  const NavButton = ({ r }) => {
    if (isStaticPage(r.path)) {
      return <a href={r.path} className="btn btn--brand">Ir</a>;
    }
    return <Link to={r.path} className="btn btn--brand">Ir</Link>;
  };

  const LinkRow = ({ r }) => (
    <li className="idx-linkItem">
      <div className="idx-linkText">
        <NavTitle r={r} />
        <div className="idx-linkMeta">Ruta: <code>{r.path}</code></div>
      </div>
      <NavButton r={r} />
    </li>
  );

  const hasAny = publicRoutes.length || adminRoutes.length || opsRoutes.length || revisionRoutes.length || infoRoutes.length;

  return (
    <div className="container">
      <div className="header-row" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 className="h1" style={{ margin: 0 }}>Índice</h1>
          <span className="idx-pill">Menú principal</span>
        </div>
        <button type="button" className="btn" onClick={logout}>Cerrar sesión</button>
      </div>

      {!hasAny ? (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--surface)', color: 'crimson', fontWeight: 800 }}>
          No tenés permisos para ver opciones en el índice. Contactá a un administrador.
        </div>
      ) : (
        <div className="idx-grid">
          {publicRoutes.length > 0 && (
            <section className="idx-section idx-section--info" style={{ gridColumn: '1 / -1' }}>
              <div className="idx-section__head">
                <div>
                  <div className="idx-section__title">Público</div>
                  <div className="idx-section__sub">Consultas disponibles sin login</div>
                </div>
                <span className="idx-pill">Público</span>
              </div>
              <div className="idx-section__body"><ul className="idx-links">{publicRoutes.map((r) => <LinkRow key={r.path} r={r} />)}</ul></div>
            </section>
          )}

          {adminRoutes.length > 0 && (
            <section className="idx-section idx-section--admin">
              <div className="idx-section__head">
                <div>
                  <div className="idx-section__title">Admin</div>
                  <div className="idx-section__sub">Configuración y control</div>
                </div>
                <span className="idx-pill">Admin</span>
              </div>
              <div className="idx-section__body"><ul className="idx-links">{adminRoutes.map((r) => <LinkRow key={r.path} r={r} />)}</ul></div>
            </section>
          )}

          {opsRoutes.length > 0 && (
            <section className="idx-section idx-section--prod">
              <div className="idx-section__head">
                <div>
                  <div className="idx-section__title">Producción</div>
                  <div className="idx-section__sub">Tableros operativos</div>
                </div>
                <span className="idx-pill">Operativo</span>
              </div>
              <div className="idx-section__body"><ul className="idx-links">{opsRoutes.map((r) => <LinkRow key={r.path} r={r} />)}</ul></div>
            </section>
          )}

          {revisionRoutes.length > 0 && (
            <section className="idx-section idx-section--admin" style={{ gridColumn: '1 / -1' }}>
              <div className="idx-section__head">
                <div>
                  <div className="idx-section__title">Revisión</div>
                  <div className="idx-section__sub">Control de calidad · Observados, rechazados y refabricaciones</div>
                </div>
                <span className="idx-pill">Revisión</span>
              </div>
              <div className="idx-section__body"><ul className="idx-links">{revisionRoutes.map((r) => <LinkRow key={r.path} r={r} />)}</ul></div>
            </section>
          )}

          {infoRoutes.length > 0 && (
            <section className="idx-section idx-section--info" style={{ gridColumn: '1 / -1' }}>
              <div className="idx-section__head">
                <div>
                  <div className="idx-section__title">Informativo</div>
                  <div className="idx-section__sub">Consultas, preproducción, estado y utilidades</div>
                </div>
                <span className="idx-pill">Info</span>
              </div>
              <div className="idx-section__body"><ul className="idx-links">{infoRoutes.map((r) => <LinkRow key={r.path} r={r} />)}</ul></div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

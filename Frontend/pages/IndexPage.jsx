// src/pages/IndexPage.jsx
import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useMemo } from 'react';

function parseJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;

    // base64url -> base64
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    const json = atob(b64 + pad);

    return JSON.parse(json);
  } catch {
    return null;
  }
}

function readAdminToken() {
  // Ajustá keys si usás otras; dejo varias comunes para no romper.
  return (
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
  // 1) scopes guardados explícitamente
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
      // si no es JSON, lo tratamos como string
      return String(raw).split(/[,\s]+/).filter(Boolean);
    }
  }

  // 2) scopes dentro del JWT (scope/scopes/permissions)
  const token = readAdminToken();
  const payload = parseJwtPayload(token);
  if (!payload) return [];

  const s1 = payload.scopes;
  const s2 = payload.scope;
  const s3 = payload.permissions;

  const toArr = (v) => {
    if (!v) return [];
    if (Array.isArray(v)) return v.map(String);
    if (typeof v === 'string') return v.split(/[,\s]+/).filter(Boolean);
    return [];
  };

  return [...toArr(s1), ...toArr(s2), ...toArr(s3)];
}

function clearAdminSession() {
  const keys = ['token', 'admin_token', 'auth_token', 'admin_scopes'];
  for (const k of keys) localStorage.removeItem(k);
  for (const k of keys) sessionStorage.removeItem(k);
}

/**
 * Index “central” con scope-based menu:
 * Scopes:
 * - users:read
 * - users:write
 * - qc:admin
 * - workflow:admin
 * - preproduccion:admin
 *
 * Reglas pedidas:
 * - qc:admin -> ve Admin Qcusers + TODO Producción + TODO Informativo
 * - workflow:admin -> ve Admin Workflow + TODO Producción + TODO Informativo
 * - preproduccion:admin -> ve SOLO Autorizaciones (parte informativa)
 */
export default function IndexPage({ routes = [] }) {
  const nav = useNavigate();

  const scopes = useMemo(() => {
    const arr = readStoredScopes();
    return new Set(arr.map((x) => String(x || '').trim()).filter(Boolean));
  }, []);

  const has = (s) => scopes.has(s);

  const isQcAdmin = has('qc:admin');
  const isWfAdmin = has('workflow:admin');
  const isPreprodAdmin = has('preproduccion:admin');
  const canUsers = has('users:read') || has('users:write');

  // Caso especial: preproducción-only (según tu regla: SOLO Autorizaciones)
  const isPreprodOnly = isPreprodAdmin && !isQcAdmin && !isWfAdmin && !canUsers;

  useEffect(() => {
    // Si no hay token, a login.
    // (Index es el “hub” post-login; si entran directo sin sesión, los mandamos a login.)
    const token = readAdminToken();
    if (!String(token || '').trim()) {
      nav('/admin/login', { replace: true });
    }
  }, [nav]);

  const logout = () => {
    clearAdminSession();
    nav('/admin/login', { replace: true });
  };

  // ===== Rutas por sección, filtradas por scope =====
  const adminRoutes = useMemo(() => {
    if (isPreprodOnly) return [];

    const out = [];
    if (isQcAdmin) out.push({ path: '/admin/qc', label: 'Admin · Usuarios QC' });
    if (isWfAdmin) out.push({ path: '/admin/workflow', label: 'Admin · Workflow (Designer)' });

    // (Opcional, por scopes users:*; si no lo querés, lo saco)
    if (canUsers) out.push({ path: '/b', label: 'Admin · Usuarios / Permisos (Dashboard)' });

    return out;
  }, [isPreprodOnly, isQcAdmin, isWfAdmin, canUsers]);

  const opsRoutes = useMemo(() => {
    // Producción solo para qc:admin o workflow:admin (según tu regla)
    if (isPreprodOnly) return [];
    if (!(isQcAdmin || isWfAdmin)) return [];

    return [
      { path: '/board', label: 'Producción · Tablero completo' },
      ...routes
        .filter((r) => r?.path && r.path !== '/board')
        .map((r) => ({ path: r.path, label: r.label })),
    ];
  }, [isPreprodOnly, isQcAdmin, isWfAdmin, routes]);

  const infoRoutes = useMemo(() => {
    // Informativo:
    // - qc:admin / workflow:admin -> TODO informativo
    // - preproduccion:admin -> SOLO autorizaciones
    if (isPreprodOnly) {
      return [{ path: '/a', label: 'Autorizaciones · Preproducción (portones_valores)' }];
    }

    if (isPreprodAdmin && !(isQcAdmin || isWfAdmin)) {
      // Si tiene preproduccion:admin pero además no es qc/workflow, respetamos tu consigna:
      // "solo Autorizaciones"
      return [{ path: '/a', label: 'Autorizaciones · Preproducción (portones_valores)' }];
    }

    if (!(isQcAdmin || isWfAdmin)) {
      // Sin qc/workflow, no mostramos informativo (salvo el caso preprod ya contemplado).
      return [];
    }

    return [
      { path: '/a', label: 'Autorizaciones · Preproducción (portones_valores)' },

      { path: '/ipanel', label: 'iPanel (solo lectura)' },
      { path: '/statusGate', label: 'Status Portones' },
      { path: '/createGate', label: 'CreateGate (carga / planificación)' },
      { path: '/planta', label: 'Planta (solo lectura – detalle)' },
      { path: '/plantasimple', label: 'Planta simple (resumen)' },
      { path: '/statusIpanels', label: 'Status iPanels' },
      { path: '/stats/portones', label: 'Stats · Portones' },
    ];
  }, [isPreprodOnly, isPreprodAdmin, isQcAdmin, isWfAdmin]);

  const LinkRow = ({ r }) => (
    <li className="idx-linkItem">
      <div className="idx-linkText">
        <Link to={r.path} className="idx-linkTitle">
          {r.label}
        </Link>
        <div className="idx-linkMeta">
          Ruta: <code>{r.path}</code>
        </div>
      </div>
      <Link to={r.path} className="btn btn--brand">
        Ir
      </Link>
    </li>
  );

  const hasAny =
    adminRoutes.length > 0 || opsRoutes.length > 0 || infoRoutes.length > 0;

  return (
    <div className="container">
      <div className="header-row" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 className="h1" style={{ margin: 0 }}>
            Índice
          </h1>
          <span className="idx-pill">Menú principal</span>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" type="button" onClick={logout}>
            Salir
          </button>
        </div>
      </div>

      {!hasAny ? (
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 14,
            background: 'var(--surface)',
            color: 'crimson',
            fontWeight: 800,
          }}
        >
          No tenés permisos para ver opciones en el índice. Contactá a un administrador.
        </div>
      ) : (
        <div className="idx-grid">
          {/* ADMIN */}
          {adminRoutes.length > 0 && (
            <section className="idx-section idx-section--admin">
              <div className="idx-section__head">
                <div>
                  <div className="idx-section__title">Admin</div>
                  <div className="idx-section__sub">Configuración y control</div>
                </div>
                <span className="idx-pill">Admin</span>
              </div>

              <div className="idx-section__body">
                <ul className="idx-links">
                  {adminRoutes.map((r) => (
                    <LinkRow key={r.path} r={r} />
                  ))}
                </ul>
              </div>
            </section>
          )}

          {/* PRODUCCIÓN */}
          {opsRoutes.length > 0 && (
            <section className="idx-section idx-section--prod">
              <div className="idx-section__head">
                <div>
                  <div className="idx-section__title">Producción</div>
                  <div className="idx-section__sub">Tableros operativos</div>
                </div>
                <span className="idx-pill">Operativo</span>
              </div>

              <div className="idx-section__body">
                <ul className="idx-links">
                  {opsRoutes.map((r) => (
                    <LinkRow key={r.path} r={r} />
                  ))}
                </ul>
              </div>
            </section>
          )}

          {/* INFORMATIVO / HERRAMIENTAS */}
          {infoRoutes.length > 0 && (
            <section className="idx-section idx-section--info" style={{ gridColumn: '1 / -1' }}>
              <div className="idx-section__head">
                <div>
                  <div className="idx-section__title">Informativo</div>
                  <div className="idx-section__sub">Consultas, estado y utilidades</div>
                </div>
                <span className="idx-pill">Info</span>
              </div>

              <div className="idx-section__body">
                <ul className="idx-links">
                  {infoRoutes.map((r) => (
                    <LinkRow key={r.path} r={r} />
                  ))}
                </ul>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

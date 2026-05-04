// pages/admin/AdminLoginPage.jsx
import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { adminLogin, setAdminToken, clearAdminToken, getAdminToken } from '../../src/api';

const LS_USER = 'dg_admin_user';     // opcional: { id, name, username, scopes }
const LS_SCOPES = 'dg_admin_scopes'; // opcional: ["qc:admin", "workflow:admin", ...]

function safeJsonParse(v) {
  try { return JSON.parse(v); } catch { return null; }
}

function EyeIcon({ open }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
      <circle cx="12" cy="12" r="3" />
      {!open ? <path d="M4 4l16 16" /> : null}
    </svg>
  );
}

export default function AdminLoginPage() {
  const nav = useNavigate();

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const t = getAdminToken();
    if (t && String(t).trim()) {
      nav('/index', { replace: true });
    }
  }, [nav]);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');

    const u = String(username || '').trim();
    const p = String(password || '').trim();

    if (!u || !p) {
      setErr('Ingresá usuario y contraseña.');
      return;
    }

    try {
      setBusy(true);

      const data = await adminLogin(u, p);

      if (!data?.token) {
        setErr('Login inválido.');
        return;
      }

      // adminLogin ya llama setAdminToken, pero lo dejamos explícito por robustez
      setAdminToken(String(data.token));

      const scopes =
        Array.isArray(data?.scopes) ? data.scopes :
        Array.isArray(data?.user?.scopes) ? data.user.scopes :
        null;

      if (scopes) localStorage.setItem(LS_SCOPES, JSON.stringify(scopes));
      else localStorage.removeItem(LS_SCOPES);

      if (data?.user) localStorage.setItem(LS_USER, JSON.stringify(data.user));
      else localStorage.removeItem(LS_USER);

      nav('/index', { replace: true });
    } catch (e2) {
      clearAdminToken();
      localStorage.removeItem(LS_USER);
      localStorage.removeItem(LS_SCOPES);

      setErr(e2?.response?.data?.error || e2.message);
    } finally {
      setBusy(false);
    }
  };

  const savedScopes = safeJsonParse(localStorage.getItem(LS_SCOPES)) || [];

  return (
    <div className="container" style={{ maxWidth: 520 }}>
      <div className="header-row" style={{ alignItems: 'center' }}>
        <Link className="btn" to="/index">Inicio</Link>
      </div>

      <form
        onSubmit={submit}
        style={{
          marginTop: 12,
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 14,
          background: 'var(--surface)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {err && <div style={{ color: 'crimson', fontWeight: 800 }}>{err}</div>}

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontWeight: 800 }}>Usuario</span>
          <input
            className="btn"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontWeight: 800 }}>Contraseña</span>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              className="btn"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              style={{ flex: 1 }}
            />

            <button
              type="button"
              className="btn"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              style={{
                minWidth: 44,
                width: 44,
                height: 40,
                display: 'grid',
                placeItems: 'center',
                padding: 0,
                fontSize: 0,
              }}
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>
        </label>

        <button className="btn btn--brand" type="submit" disabled={busy}>
          {busy ? 'Ingresando…' : 'Ingresar'}
        </button>

        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Luego del login vas al índice (/index) para elegir Producción, Autorizaciones, Usuarios QC o Workflow.
        </div>

        {savedScopes.length > 0 && (
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Scopes guardados: <b>{savedScopes.join(', ')}</b>
          </div>
        )}
      </form>
    </div>
  );
}

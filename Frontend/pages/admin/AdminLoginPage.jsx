// pages/admin/AdminLoginPage.jsx
import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { adminLogin, getAdminToken, clearAdminToken } from '../../src/api';

const LS_USER = 'dg_admin_user';     // opcional: { id, name, username, scopes }
const LS_SCOPES = 'dg_admin_scopes'; // opcional: ["qc:admin", "workflow:admin", ...]

function safeJsonParse(v) {
  try { return JSON.parse(v); } catch { return null; }
}

export default function AdminLoginPage() {
  const nav = useNavigate();

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Si ya hay token, mandamos al índice
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

      // Nota: NO guardamos token manualmente acá.
      // adminLogin() -> setAdminToken() (en src/api.js) ya lo persiste de forma consistente.

      // Si tu backend devuelve scopes/usuario, los guardamos (sin romper si no vienen)
      const scopes =
        Array.isArray(data?.scopes) ? data.scopes :
        Array.isArray(data?.user?.scopes) ? data.user.scopes :
        null;

      if (scopes) localStorage.setItem(LS_SCOPES, JSON.stringify(scopes));
      else localStorage.removeItem(LS_SCOPES);

      if (data?.user) localStorage.setItem(LS_USER, JSON.stringify(data.user));
      else localStorage.removeItem(LS_USER);

      // ✅ Después del login, vamos al índice central
      nav('/index', { replace: true });
    } catch (e2) {
      // Ante error, limpiamos token para evitar sesiones “fantasma”
      clearAdminToken();
      localStorage.removeItem(LS_USER);
      localStorage.removeItem(LS_SCOPES);

      setErr(e2?.response?.data?.error || e2.message);
    } finally {
      setBusy(false);
    }
  };

  // (Opcional) helper visual: si ya hay scopes guardados (debug)
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
          <input
            className="btn"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
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

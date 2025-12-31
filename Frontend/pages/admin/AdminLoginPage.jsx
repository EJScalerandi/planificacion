// pages/admin/AdminLoginPage.jsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { adminLogin } from '../../src/api';

export default function AdminLoginPage() {
  const nav = useNavigate();

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

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

      if (data?.token) {
        // ✅ EN VEZ DE /, vamos al selector /admin
        nav('/admin', { replace: true });
        return;
      }

      setErr('Login inválido.');
    } catch (e2) {
      setErr(e2?.response?.data?.error || e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: 520 }}>
      <div className="header-row" style={{ alignItems: 'center' }}>
        <h2 className="h1">Admin Login</h2>
        <Link className="btn" to="/">Inicio</Link>
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
          Luego del login vas al menú para elegir Usuarios QC o Workflow.
        </div>
      </form>
    </div>
  );
}

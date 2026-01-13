import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { clearAdminSession } from '../auth/adminSession';

export default function NonProductionLayout() {
  const nav = useNavigate();
  const loc = useLocation();

  const logout = () => {
    clearAdminSession();
    // replace para que no puedas volver con back a una pantalla “logueada”
    nav('/admin/login', { replace: true, state: { from: loc.pathname } });
  };

  return (
    <div className="container">
      <div className="header-row" style={{ alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link className="btn" to="/index">Inicio</Link>
        </div>

        <button className="btn btn--brand" type="button" onClick={logout}>
          Salir
        </button>
      </div>

      <Outlet />
    </div>
  );
}

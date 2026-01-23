import { Outlet, useNavigate } from 'react-router-dom';
import { clearAdminToken } from '../api';

export default function NonProductionLayout() {
  const nav = useNavigate();

  // "Menú": vuelve al índice (hub)
  const goMenu = () => {
    nav('/index', { replace: false });
  };

  // "Cerrar Sesión": mismo comportamiento que el botón "Salir" en /admin/workflow
  const logout = () => {
    // Igual que /admin/workflow
    clearAdminToken();
    nav('/admin/login');
  };

  return (
    <div className="container">
      <div className="header-row" style={{ alignItems: 'center' }}>
        <div />

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn--brand" type="button" onClick={goMenu}>
            Menú
          </button>
          <button className="btn" type="button" onClick={logout}>
            Cerrar Sesión
          </button>
        </div>
      </div>

      <Outlet />
    </div>
  );
}

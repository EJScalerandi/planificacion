import { Outlet, useNavigate } from 'react-router-dom';
import { clearAdminToken } from '../api';
import TicketWidget from './TicketWidget';
import WhatsappToastWatcher from './WhatsappToastWatcher';
import ThemeToggle from './ThemeToggle.jsx';

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
      <div className="header-row ph-topbar" style={{ alignItems: 'center' }}>
        <div className="ph-topbar-title">Planificación</div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn--brand" type="button" onClick={goMenu}>
            Menú
          </button>
          <TicketWidget />
          <ThemeToggle />
          <button className="btn" type="button" onClick={logout}>
            Cerrar Sesión
          </button>
        </div>
      </div>

      <Outlet />
      <WhatsappToastWatcher />
    </div>
  );
}

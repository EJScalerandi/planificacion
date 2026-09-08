import { useEffect, useState } from 'react';
import { clearAdminToken, clearDespachoV2Session } from '../api';

// Escucha los eventos de sesión vencida disparados por los interceptores de
// axios en src/api.js (uno para el token de admin, otro para el de la
// cuadrilla de /despacho_v2 - son sesiones separadas) y muestra un aviso
// claro en vez de dejar que cada pantalla muestre su propio error.
export default function SessionExpiredOverlay() {
  const [kind, setKind] = useState(null); // 'admin' | 'despacho_v2' | null

  useEffect(() => {
    const onAdminExpired = () => setKind('admin');
    const onDespachoExpired = () => setKind('despacho_v2');
    window.addEventListener('admin-session-expired', onAdminExpired);
    window.addEventListener('despacho-session-expired', onDespachoExpired);
    return () => {
      window.removeEventListener('admin-session-expired', onAdminExpired);
      window.removeEventListener('despacho-session-expired', onDespachoExpired);
    };
  }, []);

  if (!kind) return null;

  const volverAIniciarSesion = () => {
    if (kind === 'admin') {
      clearAdminToken();
      window.location.href = '/admin/login';
    } else {
      clearDespachoV2Session();
      window.location.reload();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: 'var(--surface, #fff)',
          borderRadius: 12,
          padding: 20,
          maxWidth: 360,
          width: '90%',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 18, color: 'crimson' }}>
          La sesión expiró
        </div>
        <button className="btn btn--brand" type="button" onClick={volverAIniciarSesion}>
          Volver a iniciar sesión
        </button>
      </div>
    </div>
  );
}

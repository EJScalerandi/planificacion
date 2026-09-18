// src/components/WhatsappToastWatcher.jsx
//
// Notificación tipo toast, persistente (no se cierra sola), cuando entra un
// mensaje nuevo de WhatsApp - pedido explícito del usuario. Vive en
// NonProductionLayout (envuelve TODAS las páginas admin), así avisa sin
// importar en qué pantalla esté trabajando el usuario. Solo para quien tenga
// algún scope de logística/preproducción (mismo criterio que el resto de la
// sección) - polling simple sobre el mismo endpoint que ya usa el chat, no
// hace falta nada nuevo del lado del backend.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchLogisticaWhatsappConversaciones } from '../api';
import { getPreproduccionAccessMode } from '../utils/adminScopes';

const POLL_MS = 6000;
const STORAGE_KEY = 'wa_toast_vistos_v1';

function leerVistos() {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}
function guardarVistos(v) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch { /* noop */ }
}

function displayTelefono(t) {
  const m = String(t || '').match(/^54(9?)(\d{3,4})(\d+)$/);
  if (!m) return `+${t}`;
  return `+54 ${m[1] ? '9 ' : ''}${m[2]} ${m[3]}`;
}

function previewDeMensaje(c) {
  if (c.tipo === 'text') return c.contenido || '';
  const ICONO = { image: '📷 Foto', video: '🎥 Video', audio: '🎤 Audio', document: '📄 Documento', sticker: '🩹 Sticker' };
  return ICONO[c.tipo] || `(${c.tipo})`;
}

export default function WhatsappToastWatcher() {
  const nav = useNavigate();
  const [toasts, setToasts] = useState([]); // { id, telefono, nombreCliente, contenido, tipo }
  const inicializadoRef = useRef(false);
  const habilitado = getPreproduccionAccessMode() !== 'none';

  useEffect(() => {
    if (!habilitado) return;

    const tick = async () => {
      let conversaciones;
      try {
        const d = await fetchLogisticaWhatsappConversaciones();
        conversaciones = d?.conversaciones || [];
      } catch {
        return; // no molesta con errores de red del watcher de fondo
      }

      const vistos = leerVistos();

      // Primera vuelta de esta sesión de navegador: establece la base sin
      // avisar de mensajes viejos que ya estaban ahí antes de abrir la app.
      if (!inicializadoRef.current && Object.keys(vistos).length === 0) {
        const base = {};
        for (const c of conversaciones) base[c.telefono] = c.created_at;
        guardarVistos(base);
        inicializadoRef.current = true;
        return;
      }
      inicializadoRef.current = true;

      const nuevos = conversaciones.filter((c) => {
        if (c.direccion !== 'entrante') return false; // solo avisa lo que manda el cliente, no lo que mandamos nosotros
        const visto = vistos[c.telefono];
        return !visto || new Date(c.created_at) > new Date(visto);
      });
      if (!nuevos.length) return;

      for (const c of nuevos) vistos[c.telefono] = c.created_at;
      guardarVistos(vistos);

      setToasts((prev) => [
        ...prev,
        ...nuevos.map((c) => ({ id: `${c.telefono}-${c.created_at}`, telefono: c.telefono, nombreCliente: c.nombreCliente, contenido: previewDeMensaje(c) })),
      ]);
    };

    tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [habilitado]);

  if (!habilitado || toasts.length === 0) return null;

  return (
    <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 20000, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320 }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            background: 'var(--surface, #fff)', border: '1px solid var(--border, #d1d5db)', borderLeft: '4px solid #25D366',
            borderRadius: 10, boxShadow: '0 6px 20px rgba(0,0,0,0.22)', padding: '10px 12px', cursor: 'pointer',
          }}
          onClick={() => {
            setToasts((prev) => prev.filter((x) => x.id !== t.id));
            nav(`/admin/logistica-whatsapp?telefono=${encodeURIComponent(t.telefono)}`);
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 900, fontSize: 12 }}>💬 {t.nombreCliente || displayTelefono(t.telefono)}</div>
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.contenido}
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setToasts((prev) => prev.filter((x) => x.id !== t.id)); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, fontSize: 14, flex: '0 0 auto' }}
              title="Cerrar"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

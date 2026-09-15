// pages/admin/LogisticaWhatsappPage.jsx
//
// Bandeja de WhatsApp Business tipo WhatsApp Web - pedido explícito del
// usuario: lista de conversaciones a la izquierda, hilo de mensajes a la
// derecha. Alimentada por server/routes/public/webhookWhatsapp.js (entrantes)
// + los envíos que ya hace la app (aviso automático + texto libre de acá).
//
// Polling simple (no websockets) - alcanza de sobra para un uso interno de
// logística, sin la complejidad de mantener una conexión persistente.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getAdminToken, clearAdminToken, fetchLogisticaWhatsappConversaciones, fetchLogisticaWhatsappMensajes, enviarLogisticaWhatsappMensaje, enviarLogisticaWhatsappMedia } from '../../src/api';

const POLL_MS = 4000;

function formatHora(iso) {
  const d = new Date(iso);
  const hoy = new Date();
  const esHoy = d.toDateString() === hoy.toDateString();
  return esHoy
    ? d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function displayTelefono(t) {
  // 5493572400170 -> +54 9 3572 400170 (aproximado, solo para mostrar)
  const m = String(t || '').match(/^54(9?)(\d{3,4})(\d+)$/);
  if (!m) return `+${t}`;
  return `+54 ${m[1] ? '9 ' : ''}${m[2]} ${m[3]}`;
}

const ESTADO_ICONO = { enviado: '✓', entregado: '✓✓', leido: '✓✓', fallido: '⚠️' };

// Selector de emojis propio - Win+. (el de Windows) le queda atado a otro
// atajo en algunas máquinas (zoom de Lupa), así que no hay que depender de
// eso. Set curado de los más usuales en un chat de atención al cliente.
const EMOJIS = [
  '😀', '😃', '😄', '😁', '😆', '🙂', '😉', '😊', '😇', '🥰',
  '😍', '😘', '😋', '😎', '🤩', '🥳', '😏', '😢', '😭', '😞',
  '😟', '😳', '😱', '😥', '😓', '🤔', '🤗', '😴', '🤤', '😪',
  '😮', '😲', '😬', '🙄', '😐', '🤨', '😷', '🤒', '🤕', '🥵',
  '🥶', '😡', '😠', '🤬', '👍', '👎', '👏', '🙌', '🙏', '💪',
  '✌️', '🤝', '👋', '☝️', '👌', '🔥', '✨', '🎉', '💯', '⏰',
  '📦', '🚚', '🚪', '📍', '📞', '❤️', '🧡', '💛', '💚', '💙',
];

function ConversacionRow({ c, activo, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
        background: activo ? 'var(--brand-100, #e0f2ea)' : 'transparent',
        display: 'flex', flexDirection: 'column', gap: 3,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontWeight: 800, fontSize: 13 }}>{displayTelefono(c.telefono)}</span>
        <span style={{ fontSize: 10, opacity: 0.6, flex: '0 0 auto' }}>{formatHora(c.created_at)}</span>
      </div>
      <div style={{ fontSize: 12, opacity: 0.75, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {c.direccion === 'saliente' ? `Vos: ${c.contenido || '(sin texto)'}` : (c.contenido || `(${c.tipo})`)}
      </div>
    </div>
  );
}

function ContenidoMensaje({ m }) {
  if (m.tipo === 'image' && m.media_url) {
    return <img src={m.media_url} alt="" style={{ maxWidth: 260, borderRadius: 8, display: 'block' }} />;
  }
  if (m.tipo === 'video' && m.media_url) {
    return <video src={m.media_url} controls style={{ maxWidth: 260, borderRadius: 8, display: 'block' }} />;
  }
  if (m.tipo === 'audio' && m.media_url) {
    return <audio src={m.media_url} controls style={{ maxWidth: 260 }} />;
  }
  if (m.tipo === 'document' && m.media_url) {
    return <a href={m.media_url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>📄 {m.contenido || 'Documento'}</a>;
  }
  if (['image', 'video', 'audio', 'document', 'sticker'].includes(m.tipo) && !m.media_url) {
    return <span style={{ opacity: 0.7, fontStyle: 'italic' }}>{`(${m.tipo} - no se pudo descargar)`}</span>;
  }
  return m.contenido || (m.tipo === 'template' ? '📦 (plantilla)' : `(${m.tipo})`);
}

function Burbuja({ m }) {
  const saliente = m.direccion === 'saliente';
  const conCaption = ['image', 'video', 'document'].includes(m.tipo) && m.contenido && m.media_url;
  return (
    <div style={{ display: 'flex', justifyContent: saliente ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth: '70%', borderRadius: 12, padding: '8px 12px', fontSize: 13,
          background: saliente ? 'var(--brand)' : 'var(--surface-muted, #f3f4f6)',
          color: saliente ? '#fff' : 'inherit',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word', display: 'flex', flexDirection: 'column', gap: 4,
        }}
      >
        <ContenidoMensaje m={m} />
        {conCaption ? <div>{m.contenido}</div> : null}
        <div style={{ fontSize: 10, opacity: 0.7, textAlign: 'right' }}>
          {formatHora(m.created_at)} {saliente ? ESTADO_ICONO[m.estado] || '' : ''}
        </div>
      </div>
    </div>
  );
}

export default function LogisticaWhatsappPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    if (!getAdminToken()) nav('/admin/login', { replace: true });
  }, [nav]);

  const [conversaciones, setConversaciones] = useState([]);
  const [telefonoActivo, setTelefonoActivo] = useState(params.get('telefono') || null);
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState('');
  const [emojiAbierto, setEmojiAbierto] = useState(false);

  // Archivo elegido o audio grabado, pendiente de confirmar - pedido
  // explícito del usuario: no se manda solo, hay que verlo antes y darle
  // Enviar (como cualquier chat real), con `texto` como caption opcional.
  const [pendingMedia, setPendingMedia] = useState(null); // { file, previewUrl, tipo } | null
  const [grabando, setGrabando] = useState(false);
  const [grabandoSegundos, setGrabandoSegundos] = useState(0);
  const mediaRecorderRef = useRef(null);
  const chunksGrabacionRef = useRef([]);

  const scrollRef = useRef(null);

  const cargarConversaciones = useCallback(async () => {
    try {
      const d = await fetchLogisticaWhatsappConversaciones();
      setConversaciones(d?.conversaciones || []);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    }
  }, []);

  const cargarMensajes = useCallback(async (telefono) => {
    if (!telefono) return;
    try {
      const d = await fetchLogisticaWhatsappMensajes(telefono);
      setMensajes(d?.mensajes || []);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    }
  }, []);

  useEffect(() => { cargarConversaciones(); }, [cargarConversaciones]);
  useEffect(() => {
    const id = setInterval(cargarConversaciones, POLL_MS);
    return () => clearInterval(id);
  }, [cargarConversaciones]);

  // Cambiar de conversación descarta cualquier adjunto pendiente sin mandar -
  // evita el riesgo de mandarlo al contacto equivocado por error.
  useEffect(() => {
    setPendingMedia((prev) => { if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl); return null; });
    setTexto('');
  }, [telefonoActivo]);

  useEffect(() => { cargarMensajes(telefonoActivo); }, [telefonoActivo, cargarMensajes]);
  useEffect(() => {
    if (!telefonoActivo) return;
    const id = setInterval(() => cargarMensajes(telefonoActivo), POLL_MS);
    return () => clearInterval(id);
  }, [telefonoActivo, cargarMensajes]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [mensajes]);

  // Si vino un ?telefono= de un link (ej. el ícono de WhatsApp del mapa) y esa
  // conversación todavía no tiene ningún mensaje registrado, igual la
  // dejamos seleccionada (con el hilo vacío) para poder escribir/consultar.
  useEffect(() => {
    const t = params.get('telefono');
    if (t) setTelefonoActivo(t);
  }, [params]);

  const limpiarPendingMedia = () => {
    if (pendingMedia?.previewUrl) URL.revokeObjectURL(pendingMedia.previewUrl);
    setPendingMedia(null);
  };

  const enviar = async () => {
    if (!telefonoActivo) return;
    const t = texto.trim();
    if (!pendingMedia && !t) return;
    setEnviando(true);
    setErr('');
    try {
      if (pendingMedia) {
        await enviarLogisticaWhatsappMedia(telefonoActivo, pendingMedia.file, t || undefined);
        limpiarPendingMedia();
      } else {
        await enviarLogisticaWhatsappMensaje(telefonoActivo, t);
      }
      setTexto('');
      await cargarMensajes(telefonoActivo);
      await cargarConversaciones();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setEnviando(false);
    }
  };

  const tipoDeArchivo = (mime) => {
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    return 'document';
  };

  // Solo arma la vista previa - el envío real pasa por `enviar()`, recién
  // cuando el usuario confirma.
  const elegirArchivo = (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    limpiarPendingMedia();
    const tipo = tipoDeArchivo(archivo.type);
    const previewUrl = ['image', 'video', 'audio'].includes(tipo) ? URL.createObjectURL(archivo) : null;
    setPendingMedia({ file: archivo, previewUrl, tipo, nombre: archivo.name });
  };

  const iniciarGrabacion = async () => {
    setErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeSoportado = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg']
        .find((t) => window.MediaRecorder?.isTypeSupported?.(t));
      const mr = new MediaRecorder(stream, mimeSoportado ? { mimeType: mimeSoportado } : undefined);
      chunksGrabacionRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksGrabacionRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const tipoBlob = mr.mimeType || 'audio/webm';
        const blob = new Blob(chunksGrabacionRef.current, { type: tipoBlob });
        const ext = tipoBlob.includes('ogg') ? 'ogg' : 'webm';
        const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: tipoBlob });
        limpiarPendingMedia();
        setPendingMedia({ file, previewUrl: URL.createObjectURL(blob), tipo: 'audio', nombre: 'Nota de voz' });
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setGrabandoSegundos(0);
      setGrabando(true);
    } catch (e) {
      setErr('No se pudo acceder al micrófono: ' + e.message);
    }
  };

  const detenerGrabacion = () => {
    mediaRecorderRef.current?.stop();
    setGrabando(false);
  };

  useEffect(() => {
    if (!grabando) return;
    const id = setInterval(() => setGrabandoSegundos((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [grabando]);

  const logout = () => {
    clearAdminToken();
    nav('/admin/login', { replace: true });
  };

  const conversacionesConActiva = telefonoActivo && !conversaciones.some((c) => c.telefono === telefonoActivo)
    ? [{ telefono: telefonoActivo, direccion: 'saliente', tipo: 'text', contenido: '(sin mensajes todavía)', created_at: new Date().toISOString() }, ...conversaciones]
    : conversaciones;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 74px)', padding: '10px 16px 16px' }}>
      <div className="header-row" style={{ alignItems: 'center', flex: '0 0 auto' }}>
        <h2 className="h1" style={{ fontSize: 16, padding: '6px 14px' }}>💬 WhatsApp</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn" onClick={cargarConversaciones}>Recargar</button>
          <button className="btn" onClick={logout}>Salir</button>
        </div>
      </div>

      {err ? <div style={{ color: 'crimson', fontWeight: 800, fontSize: 12, marginTop: 8 }}>{err}</div> : null}

      <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', gap: 12, marginTop: 10 }}>
        <div style={{ width: 300, flex: '0 0 auto', border: '1px solid var(--border)', borderRadius: 12, overflowY: 'auto' }}>
          {conversacionesConActiva.length === 0 ? (
            <div style={{ padding: 14, fontSize: 12, opacity: 0.7 }}>Sin conversaciones todavía.</div>
          ) : (
            conversacionesConActiva.map((c) => (
              <ConversacionRow key={c.telefono} c={c} activo={c.telefono === telefonoActivo} onClick={() => setTelefonoActivo(c.telefono)} />
            ))
          )}
        </div>

        <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {!telefonoActivo ? (
            <div style={{ margin: 'auto', opacity: 0.6, fontSize: 13 }}>Elegí una conversación de la izquierda.</div>
          ) : (
            <>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontWeight: 900, fontSize: 13 }}>
                {displayTelefono(telefonoActivo)}
              </div>
              <div ref={scrollRef} style={{ flex: '1 1 auto', overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--surface-muted, #f9fafb)' }}>
                {mensajes.length === 0 ? (
                  <div style={{ margin: 'auto', opacity: 0.6, fontSize: 12, textAlign: 'center', maxWidth: 320 }}>
                    Sin mensajes todavía. Si el cliente nunca escribió, para iniciar hay que mandarle una plantilla
                    aprobada (no se puede mandar texto libre sin que haya escrito primero, o pasadas 24hs de su
                    último mensaje).
                  </div>
                ) : (
                  mensajes.map((m) => <Burbuja key={m.id} m={m} />)
                )}
              </div>
              {pendingMedia ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: '1px solid var(--border)', background: 'var(--surface-muted, #f9fafb)' }}>
                  {pendingMedia.tipo === 'image' ? (
                    <img src={pendingMedia.previewUrl} alt="" style={{ height: 60, borderRadius: 6 }} />
                  ) : pendingMedia.tipo === 'video' ? (
                    <video src={pendingMedia.previewUrl} style={{ height: 60, borderRadius: 6 }} muted />
                  ) : pendingMedia.tipo === 'audio' ? (
                    <audio src={pendingMedia.previewUrl} controls style={{ height: 32 }} />
                  ) : (
                    <span style={{ fontSize: 12 }}>📄 {pendingMedia.nombre}</span>
                  )}
                  <span style={{ fontSize: 11, opacity: 0.6, flex: 1 }}>Listo para enviar - podés agregarle un texto abajo.</span>
                  <button type="button" className="btn" disabled={enviando} onClick={limpiarPendingMedia}>✕ Cancelar</button>
                </div>
              ) : null}

              {grabando ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: '#dc2626', flex: '0 0 auto' }} />
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Grabando… {String(Math.floor(grabandoSegundos / 60)).padStart(2, '0')}:{String(grabandoSegundos % 60).padStart(2, '0')}</span>
                  <button type="button" className="btn btn--brand" style={{ marginLeft: 'auto' }} onClick={detenerGrabacion}>⏹ Detener</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, padding: 10, borderTop: '1px solid var(--border)', position: 'relative' }}>
                  <div style={{ position: 'relative' }}>
                    <button type="button" className="btn" disabled={enviando} onClick={() => setEmojiAbierto((v) => !v)} title="Emojis">😊</button>
                    {emojiAbierto ? (
                      <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onMouseDown={() => setEmojiAbierto(false)} />
                        <div style={{
                          position: 'absolute', bottom: '100%', left: 0, marginBottom: 4, zIndex: 1000,
                          background: 'var(--surface, #fff)', border: '1px solid var(--border)', borderRadius: 10,
                          boxShadow: '0 4px 14px rgba(0,0,0,0.18)', padding: 8, width: 260,
                          display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 2,
                        }}>
                          {EMOJIS.map((e) => (
                            <button
                              key={e} type="button"
                              onMouseDown={(ev) => ev.stopPropagation()}
                              onClick={() => setTexto((t) => t + e)}
                              style={{ fontSize: 18, background: 'none', border: 'none', cursor: 'pointer', padding: 2, borderRadius: 4 }}
                            >
                              {e}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                  <label className="btn" style={{ flex: '0 0 auto', cursor: enviando ? 'default' : 'pointer', opacity: enviando ? 0.6 : 1 }} title="Adjuntar imagen, video, audio o documento">
                    📎
                    <input
                      type="file"
                      style={{ display: 'none' }}
                      accept="image/jpeg,image/png,image/webp,video/mp4,video/3gpp,audio/aac,audio/mp4,audio/mpeg,audio/amr,audio/ogg,application/pdf,application/msword,text/plain,.docx,.xlsx"
                      disabled={enviando}
                      onChange={elegirArchivo}
                    />
                  </label>
                  <button type="button" className="btn" disabled={enviando || !!pendingMedia} onClick={iniciarGrabacion} title="Grabar nota de voz">🎙️</button>
                  <input
                    className="pp-input"
                    style={{ flex: 1 }}
                    placeholder={pendingMedia ? 'Agregar un texto (opcional)…' : 'Escribir un mensaje…'}
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                    disabled={enviando}
                  />
                  <button className="btn btn--brand" disabled={enviando || (!texto.trim() && !pendingMedia)} onClick={enviar}>
                    {enviando ? 'Enviando…' : 'Enviar'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

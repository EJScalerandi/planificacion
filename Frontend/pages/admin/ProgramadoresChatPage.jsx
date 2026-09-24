// pages/admin/ProgramadoresChatPage.jsx
//
// Chat de Programadores: un único grupo tipo WhatsApp entre los usuarios con
// scope programadores:admin (pedido del usuario: "una nueva sección en
// Programadores que sea tipo un chat de WhatsApp"). Texto, emojis, imágenes
// y archivos, también pegando una captura con Ctrl+V o arrastrando archivos
// arriba del chat. Backend: routes/admin/programadoresChat.js.
//
// Polling simple (no websockets), mismo criterio que LogisticaWhatsappPage.
// Solo el polling avanza lastIdRef: si al enviar se lo moviera al id del
// mensaje propio, un mensaje de otro que llegó justo antes quedaría salteado.
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchProgramadoresChat, enviarProgramadoresChat, marcarProgramadoresChatLeido } from '../../src/api';
import { getCurrentAdminUsername } from '../../src/utils/adminScopes';
import { colorForUsername } from '../../src/utils/userAvatar';
import UserAvatar from '../../src/components/UserAvatar';

const POLL_MS = 3000;
const POLL_OCULTO_MS = 15000;
const MAX_ARCHIVOS = 5;
const MAX_BYTES = 15 * 1024 * 1024;
// Mismo set que routes/admin/programadoresChat.js (el backend es el que
// manda; esto es para avisar antes de subir).
const EXTENSIONES = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'heic',
  'pdf', 'txt', 'log', 'md', 'csv', 'json', 'xml', 'sql',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'zip', 'rar', '7z',
  'mp4', 'webm', 'mov', 'mp3', 'ogg', 'wav', 'm4a',
]);

const EMOJIS = [
  '😀', '😂', '🤣', '😅', '😊', '😉', '😍', '😎', '🤔', '🙄',
  '😬', '😴', '😢', '😭', '😡', '🤯', '🥳', '😱', '🤦', '🤷',
  '👍', '👎', '👏', '🙌', '🙏', '💪', '👀', '🤝', '👋', '👌',
  '✌️', '🔥', '✨', '🎉', '💯', '✅', '❌', '⚠️', '🐛', '🚀',
  '💻', '🖥️', '⌨️', '🧪', '🔧', '🛠️', '📦', '📌', '📎', '📝',
  '📊', '⏰', '☕', '🍕', '❤️', '💚', '💡', '🧠', '🙃', '😏',
];

const C = {
  fondo: '#efeae2',
  propio: '#d9fdd3',
  ajeno: '#ffffff',
  texto: '#111b21',
  suave: '#667781',
  tildeAzul: '#53bdeb',
  tildeGris: '#8696a0',
};

// En vw y no en %: un max-width en % no achica el ancho "intrínseco" que la
// burbuja (shrink-to-fit) calcula para una imagen grande, y quedaba un
// hueco en blanco al costado.
const MEDIA_MAX = 'min(280px, 62vw)';

function extensionDe(nombre) {
  const m = String(nombre || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

function formatBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function formatHora(iso) {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function claveDia(iso) {
  return new Date(iso).toDateString();
}

function etiquetaDia(iso) {
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return 'Hoy';
  if (d.toDateString() === ayer.toDateString()) return 'Ayer';
  const opts = { weekday: 'long', day: 'numeric', month: 'long' };
  if (d.getFullYear() !== hoy.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('es-AR', opts);
}

function iconoArchivo(nombre) {
  const ext = extensionDe(nombre);
  if (ext === 'pdf') return '📕';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
  if (['doc', 'docx'].includes(ext)) return '📝';
  if (['ppt', 'pptx'].includes(ext)) return '📽️';
  if (['zip', 'rar', '7z'].includes(ext)) return '🗜️';
  if (['mp3', 'ogg', 'wav', 'm4a'].includes(ext)) return '🎵';
  return '📄';
}

// Para el polling: no reemplazar el estado (y re-renderizar todo el chat
// cada 3s) si lecturas/miembros vinieron iguales.
function siCambio(nuevo) {
  return (prev) => (JSON.stringify(prev) === JSON.stringify(nuevo) ? prev : nuevo);
}

function mergeMensajes(prev, nuevos) {
  if (!nuevos?.length) return prev;
  const porId = new Map(prev.map((m) => [m.id, m]));
  for (const m of nuevos) porId.set(m.id, m);
  return [...porId.values()].sort((a, b) => a.id - b.id);
}

const URL_RE = /(https?:\/\/[^\s<]+)/g;

function ConLinks({ texto }) {
  return String(texto).split(URL_RE).map((p, i) => (i % 2 === 1
    ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" style={{ color: '#027eb5' }}>{p}</a>
    : <Fragment key={i}>{p}</Fragment>));
}

// ```bloques``` en monoespaciado, como en WhatsApp (útil para pegar código).
function TextoMensaje({ texto }) {
  const partes = String(texto || '').split('```');
  return partes.map((p, i) => (i % 2 === 1 && i < partes.length - 1
    ? (
      <code
        key={i}
        style={{
          display: 'block', fontFamily: 'Consolas, "Courier New", monospace', fontSize: 12.5,
          background: 'rgba(0,0,0,.05)', borderRadius: 6, padding: '6px 8px', margin: '2px 0',
          whiteSpace: 'pre-wrap', overflowX: 'auto',
        }}
      >
        {p.replace(/^\n/, '')}
      </code>
    )
    : <ConLinks key={i} texto={i % 2 === 1 ? '```' + p : p} />));
}

function Adjunto({ a, onMediaLoad }) {
  if (!a.url) {
    return <div style={{ fontSize: 12, color: C.suave, fontStyle: 'italic' }}>📎 {a.nombre} (no disponible)</div>;
  }
  const tipo = String(a.tipo || '');
  const ext = extensionDe(a.nombre);
  const esImagen = (tipo.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) && ext !== 'heic';
  if (esImagen) {
    return (
      <a href={a.url} target="_blank" rel="noopener noreferrer" title={a.nombre}>
        <img
          src={a.url}
          alt={a.nombre}
          onLoad={onMediaLoad}
          style={{ maxWidth: MEDIA_MAX, maxHeight: 320, minWidth: 48, minHeight: 48, objectFit: 'cover', borderRadius: 6, display: 'block' }}
        />
      </a>
    );
  }
  if (tipo.startsWith('video/') || ['mp4', 'webm', 'mov'].includes(ext)) {
    return <video src={a.url} controls onLoadedMetadata={onMediaLoad} style={{ maxWidth: MEDIA_MAX, borderRadius: 6, display: 'block' }} />;
  }
  if (tipo.startsWith('audio/')) {
    return <audio src={a.url} controls style={{ maxWidth: 260 }} />;
  }
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`Abrir ${a.nombre}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8,
        background: 'rgba(0,0,0,.05)', color: C.texto, textDecoration: 'none', minWidth: 200, maxWidth: 280,
      }}
    >
      <span style={{ fontSize: 26, lineHeight: 1 }}>{iconoArchivo(a.nombre)}</span>
      <span style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nombre}</div>
        <div style={{ fontSize: 11, color: C.suave }}>{formatBytes(a.tamano)}{ext ? ` · ${ext.toUpperCase()}` : ''}</div>
      </span>
    </a>
  );
}

// ✓ enviado · ✓✓ gris: lo vio alguien · ✓✓ azul: lo vieron todos los demás.
function Tildes({ m, lecturas, otrosMiembros }) {
  const vistos = lecturas
    .filter((l) => l.username !== m.autor_username && l.ultimo_leido_id >= m.id)
    .map((l) => l.username);
  const todos = otrosMiembros.length > 0 && otrosMiembros.every((u) => vistos.includes(u));
  const title = vistos.length ? `Visto por: ${vistos.join(', ')}` : 'Enviado';
  return (
    <span title={title} style={{ color: todos ? C.tildeAzul : C.tildeGris, fontWeight: 700, letterSpacing: -3, marginLeft: 3 }}>
      {vistos.length ? '✓✓' : '✓'}
    </span>
  );
}

function Burbuja({ m, propio, inicioDeTanda, lecturas, otrosMiembros, onMediaLoad }) {
  const soloMedia = !m.texto && m.adjuntos.length > 0;
  return (
    <div style={{ display: 'flex', justifyContent: propio ? 'flex-end' : 'flex-start', gap: 6, marginTop: inicioDeTanda ? 8 : 2 }}>
      {!propio && (
        <div style={{ width: 28, flex: '0 0 auto' }}>
          {inicioDeTanda && <UserAvatar username={m.autor_username} size={28} />}
        </div>
      )}
      <div
        style={{
          maxWidth: 'min(75%, 560px)', background: propio ? C.propio : C.ajeno, color: C.texto,
          borderRadius: 8, borderTopRightRadius: propio && inicioDeTanda ? 0 : 8,
          borderTopLeftRadius: !propio && inicioDeTanda ? 0 : 8,
          padding: soloMedia ? 4 : '6px 9px 4px', boxShadow: '0 1px 0.5px rgba(11,20,26,.13)',
          fontSize: 14, lineHeight: 1.35, wordBreak: 'break-word', whiteSpace: 'pre-wrap',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}
      >
        {!propio && inicioDeTanda && (
          <div style={{ fontSize: 12.5, fontWeight: 700, color: colorForUsername(m.autor_username), padding: soloMedia ? '2px 5px 0' : 0 }}>
            {m.autor_username}
          </div>
        )}
        {m.adjuntos.map((a, i) => <Adjunto key={i} a={a} onMediaLoad={onMediaLoad} />)}
        {m.texto && <div><TextoMensaje texto={m.texto} /></div>}
        <div style={{ alignSelf: 'flex-end', fontSize: 11, color: C.suave, marginTop: -2, padding: soloMedia ? '0 5px 2px' : 0 }}>
          {formatHora(m.created_at)}
          {propio && <Tildes m={m} lecturas={lecturas} otrosMiembros={otrosMiembros} />}
        </div>
      </div>
    </div>
  );
}

function Pastilla({ children, innerRef }) {
  return (
    <div ref={innerRef} style={{ display: 'flex', justifyContent: 'center', margin: '10px 0 4px' }}>
      <span
        style={{
          background: '#fff', color: '#54656f', fontSize: 12, padding: '5px 12px', borderRadius: 8,
          boxShadow: '0 1px 0.5px rgba(11,20,26,.13)', textTransform: 'none',
        }}
      >
        {children}
      </span>
    </div>
  );
}

const botonIcono = {
  background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, lineHeight: 1,
  padding: 6, borderRadius: 999, color: '#54656f', flex: '0 0 auto',
};

export default function ProgramadoresChatPage() {
  const yo = useMemo(() => getCurrentAdminUsername() || '', []);

  const [mensajes, setMensajes] = useState([]);
  const [hayMas, setHayMas] = useState(false);
  const [lecturas, setLecturas] = useState([]);
  const [miembros, setMiembros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoAnteriores, setCargandoAnteriores] = useState(false);
  const [error, setError] = useState('');
  const [sinAcceso, setSinAcceso] = useState(false);
  const [divisor, setDivisor] = useState(null); // { id, count } de "N mensajes no leídos"

  const [texto, setTexto] = useState('');
  const [pendientes, setPendientes] = useState([]); // [{ file, previewUrl }]
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState('');
  const [mostrarEmojis, setMostrarEmojis] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [lejosDelFondo, setLejosDelFondo] = useState(false);
  const [nuevosAbajo, setNuevosAbajo] = useState(0);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const emojiRef = useRef(null);
  const divisorRef = useRef(null);
  const lastIdRef = useRef(0);
  const lastMarkedRef = useRef(0);
  const atBottomRef = useRef(true);
  const scrollProgramaticoRef = useRef(null);
  const forzarBajarRef = useRef(false);
  const restaurarScrollRef = useRef(null);
  const scrollInicialRef = useRef(false);
  const pendientesRef = useRef(pendientes);
  pendientesRef.current = pendientes;
  const mensajesRef = useRef(mensajes);
  mensajesRef.current = mensajes;

  const otrosMiembros = useMemo(
    () => miembros.map((x) => x.username).filter((u) => u && u !== yo),
    [miembros, yo]
  );
  const textoMiembros = useMemo(() => {
    if (!miembros.length) return 'Chat del equipo';
    const nombres = otrosMiembros.slice();
    if (miembros.some((x) => x.username === yo)) nombres.push('Vos');
    return nombres.join(', ');
  }, [miembros, otrosMiembros, yo]);

  function bajarAlFondo() {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    scrollProgramaticoRef.current = el.scrollTop;
    atBottomRef.current = true;
  }

  // Carga inicial: últimos 50 + dónde quedó leyendo (para el divisor).
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const { data } = await fetchProgramadoresChat();
        if (cancel) return;
        const lista = data?.mensajes || [];
        const lects = data?.lecturas || [];
        setMensajes(lista);
        setHayMas(!!data?.hayMas);
        setLecturas(lects);
        setMiembros(data?.miembros || []);
        lastIdRef.current = lista.length ? lista[lista.length - 1].id : 0;
        // Sin fila de lectura = primera vez: nada cuenta como no leído.
        const mia = lects.find((l) => l.username === yo);
        if (mia) {
          const noLeidos = lista.filter((m) => m.id > mia.ultimo_leido_id && m.autor_username !== yo);
          // Si el primero no leído es el primero de la página, puede haber
          // más atrás que no se trajeron: "50+" en vez de un número exacto.
          if (noLeidos.length) {
            const puedeHaberMas = !!data?.hayMas && noLeidos[0].id === lista[0].id;
            setDivisor({ id: noLeidos[0].id, count: noLeidos.length, mas: puedeHaberMas });
          }
        }
      } catch (err) {
        if (cancel) return;
        if (err?.response?.status === 403) setSinAcceso(true);
        else setError(err?.response?.data?.error || 'No se pudo cargar el chat');
      } finally {
        if (!cancel) setCargando(false);
      }
    })();
    return () => { cancel = true; };
  }, [yo]);

  // Polling de lo nuevo (+ lecturas para los tildes).
  useEffect(() => {
    if (cargando || sinAcceso || error) return undefined;
    let cancel = false;
    let timer;
    async function tick() {
      try {
        const { data } = await fetchProgramadoresChat({ despues_de: lastIdRef.current });
        if (cancel) return;
        const nuevos = data?.mensajes || [];
        setLecturas(siCambio(data?.lecturas || []));
        setMiembros(siCambio(data?.miembros || []));
        if (nuevos.length) {
          lastIdRef.current = Math.max(lastIdRef.current, nuevos[nuevos.length - 1].id);
          const yaEstaban = new Set(mensajesRef.current.map((m) => m.id));
          const deOtros = nuevos.filter((m) => !yaEstaban.has(m.id) && m.autor_username !== yo).length;
          if (deOtros && !atBottomRef.current) setNuevosAbajo((n) => n + deOtros);
          setMensajes((prev) => mergeMensajes(prev, nuevos));
        }
      } catch {
        // silencioso: el 401 lo maneja el interceptor global, lo demás se reintenta
      } finally {
        if (!cancel) timer = setTimeout(tick, document.hidden ? POLL_OCULTO_MS : POLL_MS);
      }
    }
    timer = setTimeout(tick, POLL_MS);
    return () => { cancel = true; clearTimeout(timer); };
  }, [cargando, sinAcceso, error, yo]);

  // Marcar leído hasta el último mientras la pestaña esté visible.
  useEffect(() => {
    if (!mensajes.length) return undefined;
    const maxId = mensajes[mensajes.length - 1].id;
    function marcar() {
      if (document.hidden || maxId <= lastMarkedRef.current) return;
      lastMarkedRef.current = maxId;
      marcarProgramadoresChatLeido(maxId).catch(() => { lastMarkedRef.current = 0; });
    }
    marcar();
    document.addEventListener('visibilitychange', marcar);
    return () => document.removeEventListener('visibilitychange', marcar);
  }, [mensajes]);

  // Scroll: al abrir va al divisor (o al fondo); después sigue al fondo solo
  // si ya estaba abajo; al cargar anteriores conserva la posición.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (restaurarScrollRef.current != null) {
      el.scrollTop = el.scrollHeight - restaurarScrollRef.current;
      restaurarScrollRef.current = null;
      return;
    }
    if (!scrollInicialRef.current) {
      if (!mensajes.length) return;
      scrollInicialRef.current = true;
      if (divisorRef.current) {
        // no scrollIntoView: movería también la página, no solo la lista
        el.scrollTop += divisorRef.current.getBoundingClientRect().top - el.getBoundingClientRect().top - 8;
      } else {
        bajarAlFondo();
      }
      return;
    }
    if (forzarBajarRef.current || atBottomRef.current) {
      forzarBajarRef.current = false;
      bajarAlFondo();
    }
  }, [mensajes]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    // El evento del scroll que hizo bajarAlFondo() puede llegar DESPUÉS de
    // que una imagen terminó de cargar y agrandó la lista: medido ahí
    // parecería que el usuario subió, y el chat dejaría de seguir al fondo.
    if (scrollProgramaticoRef.current != null && Math.abs(el.scrollTop - scrollProgramaticoRef.current) < 2) {
      setLejosDelFondo(false);
      return;
    }
    scrollProgramaticoRef.current = null;
    const abajo = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottomRef.current = abajo;
    setLejosDelFondo(!abajo);
    if (abajo) setNuevosAbajo(0);
  }

  function onMediaLoad() {
    if (atBottomRef.current) bajarAlFondo();
  }

  async function cargarAnteriores() {
    if (!mensajes.length || cargandoAnteriores) return;
    setCargandoAnteriores(true);
    try {
      const { data } = await fetchProgramadoresChat({ antes_de: mensajes[0].id });
      const el = scrollRef.current;
      restaurarScrollRef.current = el ? el.scrollHeight - el.scrollTop : null;
      setMensajes((prev) => mergeMensajes(prev, data?.mensajes || []));
      setHayMas(!!data?.hayMas);
    } catch (err) {
      setErrorEnvio(err?.response?.data?.error || 'No se pudieron cargar los mensajes anteriores');
    } finally {
      setCargandoAnteriores(false);
    }
  }

  // ---- adjuntos pendientes ----
  function agregarArchivos(lista) {
    const files = Array.from(lista || []);
    if (!files.length) return;
    const actuales = pendientesRef.current;
    const nuevos = [];
    for (const f of files) {
      let file = f;
      // Captura pegada con Ctrl+V: llega como "image.png" - nombre más útil.
      if (/^image\.(png|jpe?g|gif|webp)$/i.test(file.name)) {
        const ext = extensionDe(file.name);
        const hora = new Date().toLocaleTimeString('es-AR', { hour12: false }).replace(/:/g, '-');
        file = new File([file], `captura-${hora}.${ext}`, { type: file.type });
      }
      if (!EXTENSIONES.has(extensionDe(file.name))) {
        setErrorEnvio(`Tipo de archivo no permitido: ${file.name}`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        setErrorEnvio(`"${file.name}" pesa ${formatBytes(file.size)} - el máximo es ${formatBytes(MAX_BYTES)}`);
        continue;
      }
      if (actuales.length + nuevos.length >= MAX_ARCHIVOS) {
        setErrorEnvio(`Máximo ${MAX_ARCHIVOS} archivos por mensaje`);
        break;
      }
      const previewUrl = file.type.startsWith('image/') && extensionDe(file.name) !== 'heic' ? URL.createObjectURL(file) : null;
      nuevos.push({ file, previewUrl });
    }
    if (nuevos.length) setPendientes([...actuales, ...nuevos]);
    inputRef.current?.focus();
  }

  function quitarPendiente(idx) {
    setPendientes((prev) => {
      const p = prev[idx];
      if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  }

  useEffect(() => () => {
    for (const p of pendientesRef.current) if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
  }, []);

  // ---- emojis ----
  useEffect(() => {
    if (!mostrarEmojis) return undefined;
    function fuera(e) {
      if (emojiRef.current && !emojiRef.current.contains(e.target)) setMostrarEmojis(false);
    }
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [mostrarEmojis]);

  function insertarEmoji(emoji) {
    const el = inputRef.current;
    const ini = el?.selectionStart ?? texto.length;
    const fin = el?.selectionEnd ?? texto.length;
    setTexto(texto.slice(0, ini) + emoji + texto.slice(fin));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = ini + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  }

  // textarea que crece con el texto, hasta ~6 líneas
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [texto]);

  async function enviar() {
    const t = texto.trim();
    if ((!t && !pendientes.length) || enviando) return;
    setEnviando(true);
    setErrorEnvio('');
    try {
      const { data } = await enviarProgramadoresChat({ texto: t, archivos: pendientes.map((p) => p.file) });
      forzarBajarRef.current = true;
      setMensajes((prev) => mergeMensajes(prev, [data.mensaje]));
      setTexto('');
      for (const p of pendientes) if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      setPendientes([]);
      setMostrarEmojis(false);
      setDivisor(null);
      setNuevosAbajo(0);
    } catch (err) {
      setErrorEnvio(err?.response?.data?.error || 'No se pudo enviar el mensaje');
    } finally {
      setEnviando(false);
      inputRef.current?.focus();
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      enviar();
    }
  }

  function onPaste(e) {
    const files = Array.from(e.clipboardData?.files || []);
    if (files.length) {
      e.preventDefault();
      agregarArchivos(files);
    }
  }

  function onDragOver(e) {
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
    e.preventDefault();
    setArrastrando(true);
  }

  function onDrop(e) {
    e.preventDefault();
    setArrastrando(false);
    agregarArchivos(e.dataTransfer?.files);
  }

  const encabezado = (
    <div className="header-row" style={{ alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <Link className="btn" to="/index">← Inicio</Link>
      <h2 style={{ margin: 0 }}>Chat de Programadores</h2>
      <div />
    </div>
  );

  if (sinAcceso) {
    return (
      <div>
        {encabezado}
        <div className="card" style={{ padding: 20, marginTop: 14 }}>
          No tenés acceso a este chat: es solo para usuarios con el permiso <b>programadores:admin</b>.
        </div>
      </div>
    );
  }

  const puedeEnviar = !enviando && (texto.trim() || pendientes.length);

  return (
    <div>
      {encabezado}
      <div
        onDragOver={onDragOver}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setArrastrando(false); }}
        onDrop={onDrop}
        style={{
          position: 'relative', marginTop: 12, height: 'calc(100vh - 150px)', minHeight: 440,
          display: 'flex', flexDirection: 'column', border: '1px solid var(--border)',
          borderRadius: 12, overflow: 'hidden', background: C.fondo,
        }}
      >
        {/* encabezado del grupo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--brand, #008241)', color: '#fff' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flex: '0 0 auto' }}>
            💻
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Programadores</div>
            <div style={{ fontSize: 12, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{textoMiembros}</div>
          </div>
        </div>

        {/* mensajes */}
        <div ref={scrollRef} onScroll={onScroll} style={{ flex: '1 1 auto', overflowY: 'auto', padding: '8px 5% 12px' }}>
          {cargando && <Pastilla>Cargando mensajes...</Pastilla>}
          {error && <Pastilla><span style={{ color: '#b3261e' }}>{error}</span></Pastilla>}
          {!cargando && !error && hayMas && (
            <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0' }}>
              <button type="button" className="btn" onClick={cargarAnteriores} disabled={cargandoAnteriores} style={{ fontSize: 12 }}>
                {cargandoAnteriores ? 'Cargando...' : 'Cargar mensajes anteriores'}
              </button>
            </div>
          )}
          {!cargando && !error && !mensajes.length && (
            <Pastilla>Todavía no hay mensajes. ¡Escribí el primero! 👋</Pastilla>
          )}
          {mensajes.map((m, i) => {
            const prev = mensajes[i - 1];
            const nuevoDia = !prev || claveDia(prev.created_at) !== claveDia(m.created_at);
            const esDivisor = divisor && divisor.id === m.id;
            const inicioDeTanda = nuevoDia || esDivisor || !prev || prev.autor_username !== m.autor_username
              || new Date(m.created_at) - new Date(prev.created_at) > 5 * 60 * 1000;
            return (
              <Fragment key={m.id}>
                {nuevoDia && <Pastilla>{etiquetaDia(m.created_at)}</Pastilla>}
                {esDivisor && (
                  <Pastilla innerRef={divisorRef}>
                    {divisor.count === 1 && !divisor.mas ? '1 mensaje no leído' : `${divisor.count}${divisor.mas ? '+' : ''} mensajes no leídos`}
                  </Pastilla>
                )}
                <Burbuja
                  m={m}
                  propio={m.autor_username === yo}
                  inicioDeTanda={inicioDeTanda}
                  lecturas={lecturas}
                  otrosMiembros={otrosMiembros}
                  onMediaLoad={onMediaLoad}
                />
              </Fragment>
            );
          })}
        </div>

        {lejosDelFondo && (
          <button
            type="button"
            onClick={() => { bajarAlFondo(); setNuevosAbajo(0); }}
            title="Ir al último mensaje"
            style={{
              position: 'absolute', right: 18, bottom: pendientes.length ? 170 : 86, width: 42, height: 42,
              borderRadius: '50%', border: 'none', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.25)',
              cursor: 'pointer', fontSize: 18, color: '#54656f',
            }}
          >
            ↓
            {nuevosAbajo > 0 && (
              <span style={{ position: 'absolute', top: -6, right: -4, background: '#25d366', color: '#fff', borderRadius: 999, fontSize: 11, fontWeight: 700, padding: '1px 6px' }}>
                {nuevosAbajo}
              </span>
            )}
          </button>
        )}

        {/* adjuntos por enviar */}
        {pendientes.length > 0 && (
          <div style={{ display: 'flex', gap: 8, padding: '8px 12px', background: '#f0f2f5', borderTop: '1px solid #d1d7db', overflowX: 'auto' }}>
            {pendientes.map((p, i) => (
              <div key={i} style={{ position: 'relative', flex: '0 0 auto' }}>
                {p.previewUrl ? (
                  <img src={p.previewUrl} alt={p.file.name} title={p.file.name} style={{ height: 64, width: 64, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
                ) : (
                  <div title={p.file.name} style={{ height: 64, width: 120, borderRadius: 6, background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 4, gap: 2 }}>
                    <span style={{ fontSize: 22 }}>{iconoArchivo(p.file.name)}</span>
                    <span style={{ fontSize: 10, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.file.name}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => quitarPendiente(i)}
                  title="Quitar"
                  style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: '#54656f', color: '#fff', cursor: 'pointer', fontSize: 12, lineHeight: '20px', padding: 0 }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {errorEnvio && (
          <div style={{ padding: '6px 14px', background: '#fdecea', color: '#b3261e', fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span>{errorEnvio}</span>
            <button type="button" onClick={() => setErrorEnvio('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>×</button>
          </div>
        )}

        {/* barra para escribir */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 4, padding: '8px 10px', background: '#f0f2f5' }}>
          <div ref={emojiRef} style={{ position: 'relative' }}>
            <button type="button" style={botonIcono} onClick={() => setMostrarEmojis((v) => !v)} title="Emojis">😊</button>
            {mostrarEmojis && (
              <div
                style={{
                  position: 'absolute', bottom: 46, left: 0, zIndex: 5, width: 300, padding: 8,
                  background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,.15)',
                  display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 2,
                }}
              >
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => insertarEmoji(e)}
                    style={{ fontSize: 20, background: 'none', border: 'none', cursor: 'pointer', padding: 2, borderRadius: 4 }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" style={botonIcono} onClick={() => fileInputRef.current?.click()} title="Adjuntar imágenes o archivos">📎</button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => { agregarArchivos(e.target.files); e.target.value = ''; }}
          />
          <textarea
            ref={inputRef}
            rows={1}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            disabled={cargando || !!error}
            placeholder="Escribí un mensaje"
            style={{
              flex: '1 1 auto', resize: 'none', border: 'none', outline: 'none', borderRadius: 8,
              padding: '10px 12px', fontSize: 14, lineHeight: 1.35, fontFamily: 'inherit',
              background: '#fff', color: C.texto, maxHeight: 140, margin: '0 4px',
            }}
          />
          <button
            type="button"
            onClick={enviar}
            disabled={!puedeEnviar}
            title="Enviar (Enter)"
            style={{
              width: 42, height: 42, borderRadius: '50%', border: 'none', flex: '0 0 auto',
              background: puedeEnviar ? 'var(--brand, #008241)' : '#b8c4cb', color: '#fff',
              cursor: puedeEnviar ? 'pointer' : 'default', fontSize: 18,
            }}
          >
            {enviando ? '…' : '➤'}
          </button>
        </div>

        {arrastrando && (
          <div
            style={{
              position: 'absolute', inset: 0, background: 'rgba(0,130,65,.12)', border: '3px dashed var(--brand, #008241)',
              borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 700, color: 'var(--brand, #008241)', pointerEvents: 'none',
            }}
          >
            Soltá los archivos para adjuntarlos
          </div>
        )}
      </div>
    </div>
  );
}

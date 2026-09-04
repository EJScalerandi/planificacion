// pages/DespachoV2Page.jsx
//
// /despacho_v2 - versión mobile-first de Despacho para la cuadrilla,
// pensada para reemplazar en el futuro a /despacho (el tablero clásico de
// workflow) - por ahora conviven, se desarrolla en paralelo (pedido
// explícito del usuario). Login propio (nombre de usuario QC + PIN, no es
// login de admin): cada integrante ve solo los viajes de su(s) cuadrilla(s).
// Standalone - sin sidebar/layout de admin, pantalla completa pensada para
// un celular.
import React, { useEffect, useMemo, useState } from 'react';
import {
  fetchDespachoV2QcUsers, despachoV2Login, fetchDespachoV2Viajes, marcarSalidaDespachoV2,
  fetchParadasDespachoV2, fetchNvDespachoV2, fetchNvAdjuntosDespachoV2, crearSolicitudStDespachoV2,
  fetchRemitosPorNv, getDespachoV2Token, getDespachoV2User, setDespachoV2Session, clearDespachoV2Session,
} from '../src/api';

const BRAND = '#0a6a33';

// ===========================================================================
// Helpers
// ===========================================================================
function fechaLegible(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
function tamanoLegible(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function waLink(telefono) {
  const digitos = String(telefono || '').replace(/\D/g, '');
  if (!digitos) return null;
  const conCodigo = digitos.startsWith('54') ? digitos : `54${digitos.replace(/^0/, '')}`;
  return `https://wa.me/${conCodigo}`;
}
function horaLegible(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function archivoADataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ===========================================================================
// Estilos compartidos (mobile-first: botones grandes, poco adorno)
// ===========================================================================
const s = {
  pantalla: { minHeight: '100dvh', background: '#f3f4f6', display: 'flex', flexDirection: 'column' },
  header: { background: BRAND, color: '#fff', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, zIndex: 10 },
  botonBloque: { display: 'block', width: '100%', padding: '14px', borderRadius: 12, border: '1px solid #d1d5db', background: '#fff', fontSize: 16, fontWeight: 800, textAlign: 'center', cursor: 'pointer' },
  botonPrimario: { display: 'block', width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: BRAND, color: '#fff', fontSize: 16, fontWeight: 900, textAlign: 'center', cursor: 'pointer' },
  input: { width: '100%', padding: '12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 16, boxSizing: 'border-box' },
  card: { background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,.06)' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
  hoja: { width: '100%', maxWidth: 520, maxHeight: '92dvh', overflowY: 'auto', background: '#fff', borderRadius: '18px 18px 0 0', padding: 18, boxSizing: 'border-box' },
};

// ===========================================================================
// Login
// ===========================================================================
function LoginScreen({ onLogueado }) {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [elegido, setElegido] = useState(null); // { id, name } | null
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [entrando, setEntrando] = useState(false);

  useEffect(() => {
    fetchDespachoV2QcUsers()
      .then((d) => setUsuarios(d?.usuarios || []))
      .catch((e) => setErr(e?.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, []);

  const entrar = async () => {
    if (!elegido || !/^\d{3,10}$/.test(pin)) return;
    setEntrando(true);
    setErr('');
    try {
      const data = await despachoV2Login({ qc_user_id: elegido.id, pin });
      setDespachoV2Session(data.token, data.qc_user);
      onLogueado(data.qc_user);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
      setPin('');
    } finally {
      setEntrando(false);
    }
  };

  if (elegido) {
    return (
      <div style={{ ...s.pantalla, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ ...s.card, width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <button type="button" onClick={() => { setElegido(null); setPin(''); setErr(''); }} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: BRAND, fontWeight: 800, fontSize: 14, padding: 0 }}>
            ← Volver
          </button>
          <div style={{ fontSize: 20, fontWeight: 900, textAlign: 'center' }}>Hola, {elegido.name}</div>
          <div style={{ fontSize: 13, opacity: 0.7, textAlign: 'center' }}>Ingresá tu PIN</div>
          <input
            type="password" inputMode="numeric" autoFocus value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 10))}
            onKeyDown={(e) => e.key === 'Enter' && entrar()}
            style={{ ...s.input, textAlign: 'center', fontSize: 28, letterSpacing: 8, padding: '16px' }}
            placeholder="••••"
          />
          {err ? <div style={{ color: 'crimson', fontWeight: 700, fontSize: 13, textAlign: 'center' }}>{err}</div> : null}
          <button type="button" style={s.botonPrimario} disabled={entrando || pin.length < 3} onClick={entrar}>
            {entrando ? 'Entrando…' : 'Entrar'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={s.pantalla}>
      <div style={s.header}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>🚚 Despacho</div>
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 14, opacity: 0.75, marginBottom: 4 }}>¿Quién sos?</div>
        {err ? <div style={{ color: 'crimson', fontWeight: 700, fontSize: 13 }}>{err}</div> : null}
        {loading ? (
          <div style={{ opacity: 0.7 }}>Cargando…</div>
        ) : usuarios.length === 0 ? (
          <div style={{ opacity: 0.7 }}>No hay usuarios de cuadrilla cargados todavía.</div>
        ) : (
          usuarios.map((u) => (
            <button key={u.id} type="button" style={s.botonBloque} onClick={() => setElegido(u)}>
              {u.name}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// Detalle de un NV (al tocar una parada-portón)
// ===========================================================================
function NvDetailSheet({ nv, onClose }) {
  const [detalle, setDetalle] = useState(null);
  const [adjuntos, setAdjuntos] = useState([]);
  const [remitos, setRemitos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [mostrarSt, setMostrarSt] = useState(false);

  useEffect(() => {
    setLoading(true);
    setErr('');
    Promise.all([
      fetchNvDespachoV2(nv).catch(() => null),
      fetchNvAdjuntosDespachoV2(nv).catch(() => null),
      fetchRemitosPorNv(nv).catch(() => null),
    ])
      .then(([d, a, r]) => {
        setDetalle(d?.nv || null);
        setAdjuntos(a?.adjuntos || []);
        setRemitos(r?.items || []);
      })
      .catch((e) => setErr(e?.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, [nv]);

  const wa = waLink(detalle?.telefono);

  return (
    <div style={s.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={s.hoja}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 20 }}>NV {nv}</div>
          <button type="button" onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 22, lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        {loading ? (
          <div style={{ opacity: 0.7 }}>Cargando…</div>
        ) : err ? (
          <div style={{ color: 'crimson', fontWeight: 700 }}>{err}</div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              <Campo label="Cliente" valor={detalle?.nombre_cliente} />
              <Campo label="Distribuidor" valor={detalle?.distribuidor} />
              <Campo label="Localidad" valor={detalle?.localidad} />
              <Campo label="Dirección" valor={detalle?.direccion} />
              {wa ? (
                <a href={wa} target="_blank" rel="noopener noreferrer" style={{ ...s.botonBloque, background: '#25D366', color: '#fff', border: 'none' }}>
                  💬 WhatsApp al cliente
                </a>
              ) : null}
              {detalle?.maps_url ? (
                <a href={detalle.maps_url} target="_blank" rel="noopener noreferrer" style={{ ...s.botonBloque, background: '#4285F4', color: '#fff', border: 'none' }}>
                  📍 Ver en Google Maps
                </a>
              ) : null}
            </div>

            <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 6 }}>📄 Remito</div>
            {remitos.length === 0 ? (
              <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 16 }}>No se encontró remito para este NV.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {remitos.map((r, i) => (
                  <a
                    key={i} href={`/remitos-proxy/${r.tipo}/${r.sucursal}/${r.numero}/pdf`}
                    target="_blank" rel="noopener noreferrer" style={s.botonBloque}
                  >
                    {r.tipo} {r.sucursal}-{r.numero} · {fechaLegible(r.fecha)}
                  </a>
                ))}
              </div>
            )}

            <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 6 }}>📎 Adjuntos</div>
            {adjuntos.length === 0 ? (
              <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 6 }}>Sin adjuntos cargados.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
                {adjuntos.map((a) => (
                  <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" style={{ ...s.botonBloque, textAlign: 'left', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span>{String(a.tipo_mime || '').startsWith('image/') ? '🖼️' : '📄'}</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{a.nombre_archivo}</span>
                  </a>
                ))}
              </div>
            )}
            <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 16 }}>Fotos adjuntas desde acá: más adelante.</div>

            <button type="button" style={{ ...s.botonPrimario, background: '#dc2626' }} onClick={() => setMostrarSt(true)}>
              🛠️ ST/PV — Reportar un problema
            </button>
          </>
        )}
      </div>
      {mostrarSt ? <StFormSheet nv={nv} onClose={() => setMostrarSt(false)} /> : null}
    </div>
  );
}

function Campo({ label, valor }) {
  if (!valor) return null;
  return (
    <div>
      <div style={{ fontSize: 11, opacity: 0.6, fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{valor}</div>
    </div>
  );
}

// ===========================================================================
// ST/PV: reportar un problema (Servicio Técnico / Post Venta) con foto/video
// ===========================================================================
function StFormSheet({ nv, onClose }) {
  const [descripcion, setDescripcion] = useState('');
  const [archivo, setArchivo] = useState(null); // { name, type, size, data_url } | null
  const [subiendo, setSubiendo] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);

  const onArchivoElegido = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const esVideo = f.type.startsWith('video/');
    const limite = esVideo ? 5 * 1024 * 1024 : 15 * 1024 * 1024;
    if (f.size > limite) {
      setErr(`El archivo es muy pesado (máximo ${esVideo ? '5MB para video' : '15MB'}).`);
      return;
    }
    setErr('');
    const dataUrl = await archivoADataUrl(f);
    setArchivo({ name: f.name, type: f.type, size: f.size, data_url: dataUrl });
  };

  const enviar = async () => {
    if (!descripcion.trim()) { setErr('Contá qué pasó.'); return; }
    setSubiendo(true);
    setErr('');
    try {
      await crearSolicitudStDespachoV2(nv, { descripcion: descripcion.trim(), attachment: archivo });
      setOk(true);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div style={{ ...s.overlay, zIndex: 10000 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={s.hoja}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>🛠️ ST/PV — NV {nv}</div>
          <button type="button" onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 22, lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        {ok ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 40 }}>✅</div>
            <div style={{ fontWeight: 800, fontSize: 16, textAlign: 'center' }}>Solicitud enviada</div>
            <button type="button" style={s.botonPrimario} onClick={onClose}>Listo</button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 10 }}>
              Contá qué pasó (se rayó, se golpeó, falta algo, etc.) - se manda como solicitud a Servicio Técnico / Post Venta.
            </div>
            <textarea
              className="pp-input" style={{ ...s.input, minHeight: 100, marginBottom: 10 }}
              placeholder="Ej: llegó con un rayón en la hoja izquierda"
              value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
            />
            <label style={{ ...s.botonBloque, marginBottom: 6, display: 'block' }}>
              {archivo ? `✅ ${archivo.name}` : '📷 Adjuntar foto o video'}
              <input type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={onArchivoElegido} />
            </label>
            {archivo?.type?.startsWith('image/') ? (
              <img src={archivo.data_url} alt="" style={{ width: '100%', borderRadius: 10, marginBottom: 10 }} />
            ) : null}
            {err ? <div style={{ color: 'crimson', fontWeight: 700, fontSize: 13, marginBottom: 10 }}>{err}</div> : null}
            <button type="button" style={s.botonPrimario} disabled={subiendo} onClick={enviar}>
              {subiendo ? 'Enviando…' : 'Enviar solicitud'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// Detalle de una parada extra (hotel, etc.)
// ===========================================================================
function ParadaExtraSheet({ parada, onClose }) {
  return (
    <div style={s.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={s.hoja}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>🏨 {parada.nombre}</div>
          <button type="button" onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 22, lineHeight: 1, padding: 4 }}>✕</button>
        </div>
        {parada.maps_url ? (
          <a href={parada.maps_url} target="_blank" rel="noopener noreferrer" style={{ ...s.botonBloque, background: '#4285F4', color: '#fff', border: 'none' }}>
            📍 Ver en Google Maps
          </a>
        ) : (
          <div style={{ opacity: 0.6, fontSize: 13 }}>Sin ubicación cargada.</div>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// Placeholder de Gastos (pedido explícito: "esto lo vemos después")
// ===========================================================================
function GastosSheet({ onClose }) {
  return (
    <div style={s.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={s.hoja}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>💰 Gastos del viaje</div>
          <button type="button" onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 22, lineHeight: 1, padding: 4 }}>✕</button>
        </div>
        <div style={{ opacity: 0.7, fontSize: 14, textAlign: 'center', padding: '20px 0' }}>
          🚧 Todavía no está listo — se comparte entre toda la cuadrilla, lo armamos en el próximo paso.
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Fila de una parada dentro de la lista desplegable de un viaje
// ===========================================================================
function ParadaRow({ parada, onAbrirNv, onAbrirExtra }) {
  if (parada.tipo === 'extra') {
    return (
      <div
        onClick={() => onAbrirExtra(parada)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 8px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}
      >
        <span style={{ fontSize: 18 }}>🏨</span>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{parada.nombre}</div>
      </div>
    );
  }
  const label = parada.tipos_pendientes.length === 2 ? 'Desp. + Inst.' : parada.tipos_pendientes[0] === 'despacho' ? 'Despacho' : 'Instalación';
  return (
    <div
      onClick={() => onAbrirNv(parada.nv)}
      style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 8px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 900, fontSize: 14 }}>NV {parada.nv}</div>
        <div style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: '#eef2ff', color: '#3730a3' }}>{label}</div>
      </div>
      <div style={{ fontSize: 13, opacity: 0.85 }}>{parada.nombre_cliente || 'Cliente sin nombre'}</div>
      <div style={{ fontSize: 12, opacity: 0.65 }}>
        {[parada.distribuidor, parada.localidad].filter(Boolean).join(' · ') || '—'}
      </div>
    </div>
  );
}

// ===========================================================================
// Tarjeta de un viaje
// ===========================================================================
function ViajeCard({ viaje, onCambio, onAbrirNv, onAbrirExtra }) {
  const [expandido, setExpandido] = useState(false);
  const [paradas, setParadas] = useState(null);
  const [cargandoParadas, setCargandoParadas] = useState(false);
  const [marcando, setMarcando] = useState(false);
  const [mostrarGastos, setMostrarGastos] = useState(false);

  const toggleExpandir = async () => {
    if (!expandido && paradas == null) {
      setCargandoParadas(true);
      try {
        const d = await fetchParadasDespachoV2(viaje.id);
        setParadas(d?.paradas || []);
      } catch {
        setParadas([]);
      } finally {
        setCargandoParadas(false);
      }
    }
    setExpandido((v) => !v);
  };

  const marcarSalida = async () => {
    if (marcando || viaje.hora_salida_real) return;
    setMarcando(true);
    try {
      await marcarSalidaDespachoV2(viaje.id);
      onCambio();
    } finally {
      setMarcando(false);
    }
  };

  return (
    <div style={s.card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <button type="button" onClick={toggleExpandir} style={{ background: 'none', border: 'none', fontSize: 22, padding: 4, lineHeight: 1, flex: '0 0 auto' }} title="Ver paradas">
          ☰
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{viaje.nombre}</div>
          <div style={{ fontSize: 13, opacity: 0.75 }}>
            {fechaLegible(viaje.fecha)}{viaje.hora_salida ? ` · sale ${viaje.hora_salida}` : ''}
          </div>
        </div>
        <button
          type="button" onClick={marcarSalida} disabled={marcando}
          style={{
            flex: '0 0 auto', width: 44, height: 44, borderRadius: 999, border: 'none',
            background: viaje.hora_salida_real ? '#16a34a' : BRAND, color: '#fff', fontSize: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          title={viaje.hora_salida_real ? `Salió a las ${horaLegible(viaje.hora_salida_real)}` : 'Marcar salida'}
        >
          {viaje.hora_salida_real ? '✅' : '▶'}
        </button>
      </div>

      {viaje.hora_salida_real ? (
        <div style={{ fontSize: 12, fontWeight: 800, color: '#0a6a33', marginTop: 6 }}>Salió a las {horaLegible(viaje.hora_salida_real)}</div>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, fontSize: 12 }}>
        <Chip>🚚 {viaje.vehiculo_nombre || 'sin vehículo'}</Chip>
        <Chip>🚪 {viaje.cantidad_portones} portón{viaje.cantidad_portones === 1 ? '' : 'es'}</Chip>
        <Chip>📍 {viaje.cantidad_paradas} parada{viaje.cantidad_paradas === 1 ? '' : 's'}</Chip>
        {viaje.distancia_km ? <Chip>🛣️ {viaje.distancia_km} km</Chip> : null}
      </div>

      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>
        👥 {viaje.cuadrilla_nombre}{viaje.cuadrilla_miembros?.length ? `: ${viaje.cuadrilla_miembros.join(', ')}` : ''}
      </div>

      <button type="button" style={{ ...s.botonBloque, marginTop: 10, padding: '10px', fontSize: 13 }} onClick={() => setMostrarGastos(true)}>
        💰 Gastos del viaje
      </button>

      {expandido ? (
        <div style={{ marginTop: 10, borderTop: '1px solid #eee', paddingTop: 6 }}>
          {cargandoParadas ? (
            <div style={{ fontSize: 13, opacity: 0.6, padding: 8 }}>Cargando paradas…</div>
          ) : !paradas?.length ? (
            <div style={{ fontSize: 13, opacity: 0.6, padding: 8 }}>Todavía no tiene paradas cargadas.</div>
          ) : (
            paradas.map((p, i) => (
              <ParadaRow key={p.tipo === 'extra' ? `extra-${i}` : `nv-${p.nv}`} parada={p} onAbrirNv={onAbrirNv} onAbrirExtra={onAbrirExtra} />
            ))
          )}
        </div>
      ) : null}

      {mostrarGastos ? <GastosSheet onClose={() => setMostrarGastos(false)} /> : null}
    </div>
  );
}

function Chip({ children }) {
  return <span style={{ padding: '3px 9px', borderRadius: 999, background: '#f3f4f6', border: '1px solid #e5e7eb', fontWeight: 700 }}>{children}</span>;
}

// ===========================================================================
// Lista de viajes (pantalla principal logueado)
// ===========================================================================
function ViajesScreen({ qcUser, onSalir }) {
  const [rango, setRango] = useState('10d'); // '10d' | 'todos'
  const [viajes, setViajes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [nvAbierto, setNvAbierto] = useState(null);
  const [extraAbierta, setExtraAbierta] = useState(null);

  const cargar = () => {
    setErr('');
    setLoading(true);
    fetchDespachoV2Viajes(rango)
      .then((d) => setViajes(d?.viajes || []))
      .catch((e) => {
        if (e?.response?.status === 401) { clearDespachoV2Session(); onSalir(); return; }
        setErr(e?.response?.data?.error || e.message);
      })
      .finally(() => setLoading(false));
  };

  useEffect(cargar, [rango]);

  return (
    <div style={s.pantalla}>
      <div style={s.header}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>👋 {qcUser?.name}</div>
        <button type="button" onClick={() => { clearDespachoV2Session(); onSalir(); }} style={{ marginLeft: 'auto', background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 700 }}>
          Salir
        </button>
      </div>

      <div style={{ padding: '10px 14px', display: 'flex', gap: 6 }}>
        <button
          type="button" onClick={() => setRango('10d')}
          style={{ flex: 1, padding: '9px', borderRadius: 10, border: '1px solid #d1d5db', fontWeight: 800, fontSize: 13, background: rango === '10d' ? BRAND : '#fff', color: rango === '10d' ? '#fff' : '#111' }}
        >
          Próximos 10 días
        </button>
        <button
          type="button" onClick={() => setRango('todos')}
          style={{ flex: 1, padding: '9px', borderRadius: 10, border: '1px solid #d1d5db', fontWeight: 800, fontSize: 13, background: rango === 'todos' ? BRAND : '#fff', color: rango === 'todos' ? '#fff' : '#111' }}
        >
          Toda la programación
        </button>
      </div>

      <div style={{ flex: 1, padding: '4px 14px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {err ? <div style={{ color: 'crimson', fontWeight: 700, fontSize: 13 }}>{err}</div> : null}
        {loading ? (
          <div style={{ opacity: 0.7, padding: 20, textAlign: 'center' }}>Cargando…</div>
        ) : viajes.length === 0 ? (
          <div style={{ opacity: 0.6, padding: 20, textAlign: 'center', fontSize: 14 }}>No hay viajes para mostrar.</div>
        ) : (
          viajes.map((v) => (
            <ViajeCard key={v.id} viaje={v} onCambio={cargar} onAbrirNv={setNvAbierto} onAbrirExtra={setExtraAbierta} />
          ))
        )}
      </div>

      {nvAbierto != null ? <NvDetailSheet nv={nvAbierto} onClose={() => setNvAbierto(null)} /> : null}
      {extraAbierta ? <ParadaExtraSheet parada={extraAbierta} onClose={() => setExtraAbierta(null)} /> : null}
    </div>
  );
}

// ===========================================================================
export default function DespachoV2Page() {
  const [qcUser, setQcUser] = useState(() => (getDespachoV2Token() ? getDespachoV2User() : null));

  if (!qcUser) {
    return <LoginScreen onLogueado={setQcUser} />;
  }
  return <ViajesScreen qcUser={qcUser} onSalir={() => setQcUser(null)} />;
}

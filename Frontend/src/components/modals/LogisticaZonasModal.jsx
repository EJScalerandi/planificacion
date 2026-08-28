// src/components/modals/LogisticaZonasModal.jsx
//
// ABM de zonas (Zona Sur, Zona Bs As, etc.) usadas al crear un viaje y para
// detectar por qué zonas pasa la ruta de cada viaje (logisticaRutaZonas.js).
// Guardado en backend (public.logistica_zonas), no localStorage: lo usa todo
// el equipo de logística, no solo quien lo configuró.
//
// Dos formas de definir una zona, compatibles entre sí (server/lib/
// logisticaZonificacion.js prueba primero el polígono, después las
// referencias):
//   1) Polígono dibujado a mano en el mapa - "pintar zonas a gusto", pedido
//      explícito del usuario. Un punto que cae ADENTRO se clasifica ahí sin
//      importar la distancia - más preciso para zonas alargadas/angostas
//      (ej. el corredor de una ruta) que "localidad más cercana".
//   2) Una o más "referencias" (localidades geocodificadas, ej. Zona Sur 1 =
//      Rosario + Bs As) - clasificación por la más cercana en línea recta.
//      Se mantiene como fallback y para zonas viejas que no tienen polígono.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  createLogisticaZona, updateLogisticaZona, deleteLogisticaZona,
  createLogisticaZonaReferencia, deleteLogisticaZonaReferencia,
} from '../../api';

const ARGENTINA_CENTER = [-38.4, -63.6];
const ARGENTINA_ZOOM = 4;

// Un color estable por zona (por posición en la lista, no por id crudo) para
// que el polígono y su pastilla en la lista se puedan asociar de un vistazo.
const ZONA_PALETTE = ['#dc2626', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#0d9488'];
function colorDeZona(zonaId, zonas) {
  const idx = (zonas || []).findIndex((z) => z.id === zonaId);
  return ZONA_PALETTE[(idx >= 0 ? idx : 0) % ZONA_PALETTE.length];
}

function centroide(poligono) {
  const lat = poligono.reduce((acc, p) => acc + p[0], 0) / poligono.length;
  const lng = poligono.reduce((acc, p) => acc + p[1], 0) / poligono.length;
  return [lat, lng];
}

export default function LogisticaZonasModal({ open, config, onClose, onChanged }) {
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [refInputs, setRefInputs] = useState({}); // { [zonaId]: texto en el input de nueva localidad }

  // Dibujo de polígono: null = no está dibujando. zonaId null = zona nueva
  // (se crea al finalizar); zonaId con valor = redibuja la forma de una
  // zona existente.
  const [dibujo, setDibujo] = useState(null); // { zonaId:number|null, nombre:string, puntos:[[lat,lng],...] } | null
  const [nombreNuevaConDibujo, setNombreNuevaConDibujo] = useState('');

  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const poligonosLayerRef = useRef(null);
  const dibujoLayerRef = useRef(null);

  useEffect(() => {
    if (open) { setNuevoNombre(''); setErr(''); setRefInputs({}); setDibujo(null); setNombreNuevaConDibujo(''); }
  }, [open]);

  const zonas = useMemo(() => config?.zonas || [], [config]);
  const referencias = config?.zona_referencias || [];

  // Init del mapa (una sola vez que el modal está abierto) - se recrea cada
  // vez que se abre porque el modal desmonta el <div> del contenedor al
  // cerrarse (return null más abajo).
  useEffect(() => {
    if (!open || !mapElRef.current || mapRef.current) return;
    const map = L.map(mapElRef.current).setView(ARGENTINA_CENTER, ARGENTINA_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    poligonosLayerRef.current = L.layerGroup().addTo(map);
    dibujoLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // Sin esto Leaflet mide el contenedor con tamaño 0 (recién visible) y el
    // mapa queda cortado hasta el próximo resize de la ventana.
    setTimeout(() => map.invalidateSize(), 50);
    return () => {
      map.remove();
      mapRef.current = null;
      poligonosLayerRef.current = null;
      dibujoLayerRef.current = null;
    };
  }, [open]);

  // Dibuja los polígonos ya guardados de cada zona.
  useEffect(() => {
    const map = mapRef.current;
    const layer = poligonosLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    for (const z of zonas) {
      if (!Array.isArray(z.poligono) || z.poligono.length < 3) continue;
      const color = colorDeZona(z.id, zonas);
      L.polygon(z.poligono, { color, weight: 2, fillOpacity: z.activo ? 0.22 : 0.08, opacity: z.activo ? 0.9 : 0.4 })
        .bindTooltip(z.nombre, { direction: 'center', permanent: false })
        .addTo(layer);
      const [lat, lng] = centroide(z.poligono);
      L.marker([lat, lng], {
        icon: L.divIcon({
          className: '', html: `<div style="font-size:11px;font-weight:900;color:${color};text-shadow:0 1px 2px #fff,0 -1px 2px #fff,1px 0 2px #fff,-1px 0 2px #fff;white-space:nowrap;">${z.nombre}</div>`,
          iconSize: [1, 1], iconAnchor: [-6, 6],
        }),
        interactive: false,
      }).addTo(layer);
    }
  }, [zonas]);

  // Modo dibujo: click en el mapa agrega un vértice; se dibuja el trazo
  // parcial (línea + puntos) en tiempo real.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !dibujo) return;
    const onClick = (e) => {
      setDibujo((d) => (d ? { ...d, puntos: [...d.puntos, [e.latlng.lat, e.latlng.lng]] } : d));
    };
    map.on('click', onClick);
    map.getContainer().style.cursor = 'crosshair';
    return () => {
      map.off('click', onClick);
      map.getContainer().style.cursor = '';
    };
  }, [dibujo]);

  useEffect(() => {
    const layer = dibujoLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!dibujo?.puntos?.length) return;
    for (const [lat, lng] of dibujo.puntos) {
      L.circleMarker([lat, lng], { radius: 5, color: '#dc2626', fillColor: '#dc2626', fillOpacity: 1, weight: 2 }).addTo(layer);
    }
    if (dibujo.puntos.length >= 2) {
      L.polyline([...dibujo.puntos, dibujo.puntos[0]], { color: '#dc2626', weight: 2, dashArray: '6 5', opacity: 0.8 }).addTo(layer);
    }
  }, [dibujo]);

  if (!open) return null;

  const empezarDibujoNuevo = () => {
    const nombre = nombreNuevaConDibujo.trim();
    if (!nombre) return;
    setDibujo({ zonaId: null, nombre, puntos: [] });
  };

  const redibujarZona = (z) => {
    setDibujo({ zonaId: z.id, nombre: z.nombre, puntos: [] });
  };

  const deshacerUltimoPunto = () => {
    setDibujo((d) => (d ? { ...d, puntos: d.puntos.slice(0, -1) } : d));
  };

  const cancelarDibujo = () => {
    setDibujo(null);
    setNombreNuevaConDibujo('');
  };

  const finalizarDibujo = async () => {
    if (!dibujo || dibujo.puntos.length < 3) return;
    setBusy(true);
    setErr('');
    try {
      if (dibujo.zonaId == null) {
        await createLogisticaZona({ nombre: dibujo.nombre, poligono: dibujo.puntos });
      } else {
        await updateLogisticaZona(dibujo.zonaId, { poligono: dibujo.puntos });
      }
      setDibujo(null);
      setNombreNuevaConDibujo('');
      await onChanged?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const borrarForma = async (z) => {
    if (!window.confirm(`¿Borrar la forma dibujada de "${z.nombre}"? La zona sigue existiendo, se clasifica por sus localidades de referencia (si tiene).`)) return;
    setBusy(true);
    setErr('');
    try {
      await updateLogisticaZona(z.id, { poligono: null });
      await onChanged?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const agregar = async () => {
    const nombre = nuevoNombre.trim();
    if (!nombre) return;
    setBusy(true);
    setErr('');
    try {
      await createLogisticaZona({ nombre });
      setNuevoNombre('');
      await onChanged?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleActivo = async (z) => {
    setBusy(true);
    setErr('');
    try {
      await updateLogisticaZona(z.id, { activo: !z.activo });
      await onChanged?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const borrar = async (z) => {
    if (!window.confirm(`¿Borrar la zona "${z.nombre}"? También se borran su forma y sus localidades de referencia.`)) return;
    setBusy(true);
    setErr('');
    try {
      await deleteLogisticaZona(z.id);
      await onChanged?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const agregarReferencia = async (zonaId) => {
    const nombre = (refInputs[zonaId] || '').trim();
    if (!nombre) return;
    setBusy(true);
    setErr('');
    try {
      await createLogisticaZonaReferencia({ zona_id: zonaId, nombre });
      setRefInputs((s) => ({ ...s, [zonaId]: '' }));
      await onChanged?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const borrarReferencia = async (r) => {
    setBusy(true);
    setErr('');
    try {
      await deleteLogisticaZonaReferencia(r.id);
      await onChanged?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div style={{ width: 'min(1400px, 100%)', height: 'min(880px, 96vh)', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.25)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Zonas</div>
          <button className="btn" style={{ marginLeft: 'auto' }} onClick={onClose}>Cerrar</button>
        </div>

        {err ? <div style={{ color: 'crimson', fontWeight: 800, fontSize: 12 }}>{err}</div> : null}

        <div style={{ flex: 1, display: 'flex', gap: 12, minHeight: 0 }}>
          <div style={{ width: 340, flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
            <div style={{ fontSize: 11, color: 'var(--muted, #6b7280)' }}>
              Dibujá la forma de una zona directo en el mapa (más preciso), y/o agregale localidades
              de referencia como respaldo. Si tiene forma, un punto adentro se clasifica ahí sin
              importar la distancia; si no, se usa la localidad de referencia más cercana.
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="pp-input" style={{ flex: 1 }} placeholder="Ej: Zona Sur" value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') agregar(); }}
              />
              <button className="btn btn--brand" disabled={busy || !nuevoNombre.trim()} onClick={agregar}>Agregar</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {zonas.map((z) => {
                const refsDeZona = referencias.filter((r) => r.zona_id === z.id);
                const color = colorDeZona(z.id, zonas);
                return (
                  <div key={z.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: color, flex: '0 0 auto' }} />
                      <div style={{ fontWeight: 800 }}>{z.nombre}</div>
                      <button className="btn" style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 11 }} disabled={busy} onClick={() => toggleActivo(z)}>
                        {z.activo ? 'Activa' : 'Inactiva'}
                      </button>
                      <button className="btn" style={{ padding: '2px 8px', fontSize: 11, borderColor: '#ef4444', color: '#991b1b' }} disabled={busy} onClick={() => borrar(z)}>
                        Borrar zona
                      </button>
                    </div>

                    <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                      <button
                        type="button" className="btn" style={{ fontSize: 11, padding: '3px 9px' }}
                        disabled={busy || (dibujo && dibujo.zonaId !== z.id)}
                        onClick={() => (dibujo?.zonaId === z.id ? cancelarDibujo() : redibujarZona(z))}
                      >
                        {dibujo?.zonaId === z.id ? '✏️ Dibujando… (cancelar)' : z.poligono ? '✏️ Redibujar forma' : '✏️ Dibujar forma'}
                      </button>
                      {z.poligono ? (
                        <button type="button" className="btn" style={{ fontSize: 11, padding: '3px 9px' }} disabled={busy} onClick={() => borrarForma(z)}>
                          🗑️ Borrar forma
                        </button>
                      ) : null}
                    </div>

                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {refsDeZona.map((r) => (
                        <span
                          key={r.id}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '3px 8px', borderRadius: 999, background: 'var(--surface-muted, #f3f4f6)', border: '1px solid var(--border)' }}
                        >
                          📍 {r.nombre}
                          <button
                            type="button" disabled={busy} onClick={() => borrarReferencia(r)}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#991b1b', fontWeight: 900, padding: 0, lineHeight: 1 }}
                            title="Quitar localidad"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      {refsDeZona.length === 0 && !z.poligono ? (
                        <span style={{ fontSize: 11, color: '#9ca3af' }}>Sin forma ni localidades de referencia todavía.</span>
                      ) : null}
                    </div>

                    <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                      <input
                        className="pp-input" style={{ flex: 1, fontSize: 12 }} placeholder="Agregar localidad (ej: Rosario, Santa Fe)"
                        value={refInputs[z.id] || ''}
                        onChange={(e) => setRefInputs((s) => ({ ...s, [z.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') agregarReferencia(z.id); }}
                      />
                      <button className="btn" style={{ fontSize: 12 }} disabled={busy || !(refInputs[z.id] || '').trim()} onClick={() => agregarReferencia(z.id)}>
                        + Localidad
                      </button>
                    </div>
                  </div>
                );
              })}
              {zonas.length === 0 ? (
                <div style={{ color: '#6b7280', fontSize: 12 }}>No hay zonas cargadas todavía.</div>
              ) : null}
            </div>
          </div>

          <div style={{ flex: '1 1 auto', minWidth: 0, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', position: 'relative' }}>
            <div ref={mapElRef} style={{ width: '100%', height: '100%' }} />

            {!dibujo ? (
              <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 1000, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 8, boxShadow: '0 1px 4px rgba(0,0,0,.25)', display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  className="pp-input" style={{ fontSize: 12, width: 200 }} placeholder="Nombre de la zona nueva…"
                  value={nombreNuevaConDibujo}
                  onChange={(e) => setNombreNuevaConDibujo(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') empezarDibujoNuevo(); }}
                />
                <button type="button" className="btn btn--brand" style={{ fontSize: 12 }} disabled={!nombreNuevaConDibujo.trim()} onClick={empezarDibujoNuevo}>
                  ✏️ Dibujar zona nueva
                </button>
              </div>
            ) : (
              <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 1000, background: 'var(--surface)', border: '1px solid var(--brand)', borderRadius: 8, padding: 10, boxShadow: '0 1px 4px rgba(0,0,0,.25)', maxWidth: 320 }}>
                <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 4 }}>
                  Dibujando "{dibujo.nombre}" — {dibujo.puntos.length} punto{dibujo.puntos.length === 1 ? '' : 's'}
                </div>
                <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 8 }}>
                  Click en el mapa para agregar cada vértice, en orden. Necesitás al menos 3.
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="btn" style={{ fontSize: 11 }} disabled={busy || !dibujo.puntos.length} onClick={deshacerUltimoPunto}>
                    Deshacer último
                  </button>
                  <button type="button" className="btn" style={{ fontSize: 11 }} disabled={busy} onClick={cancelarDibujo}>
                    Cancelar
                  </button>
                  <button type="button" className="btn btn--brand" style={{ fontSize: 11, marginLeft: 'auto' }} disabled={busy || dibujo.puntos.length < 3} onClick={finalizarDibujo}>
                    {busy ? 'Guardando…' : 'Finalizar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

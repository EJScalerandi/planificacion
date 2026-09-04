// src/components/modals/PortonesMapaModal.jsx
//
// "Ver mapa": un pin por NV (deduplicado - despacho e instalación del mismo
// NV son el mismo domicilio), para decidir de un vistazo qué portones
// agrupar por cercanía geográfica. Leaflet + OpenStreetMap (sin API key),
// mismo enfoque que la página "Mapa de Portones" del Presupuestador
// (cotizador-front/src/pages/PortonesMapaPage, commit 6df441c — quedó
// revertida junto con otros cambios no relacionados, nunca corrió contra la
// base real; ver Backend/server/lib/geocoding.js para el detalle).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchLogisticaMapa } from '../../api';

const ARGENTINA_CENTER = [-38.4, -63.6];
const ARGENTINA_ZOOM = 4;

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Formato "HH:MM" con "(+Nd)" si el acumulado de minutos cruza medianoche
// (viajes largos, ej. 27hs totales, son reales en esta app).
function formatearHorario(totalMin) {
  const dias = Math.floor(totalMin / 1440);
  const minDia = totalMin % 1440;
  const hora = `${String(Math.floor(minDia / 60)).padStart(2, '0')}:${String(minDia % 60).padStart(2, '0')}`;
  return dias > 0 ? `${hora} (+${dias}d)` : hora;
}

export default function PortonesMapaModal({ open, onClose, nvs, titulo, rutaNvs, rutaOrden, paradasExtra, rutaReal, horaSalida }) {
  const [puntos, setPuntos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markersLayerRef = useRef(null);
  const rutaLayerRef = useRef(null);

  const nvKey = useMemo(() => Array.from(new Set(nvs || [])).sort((a, b) => a - b).join(','), [nvs]);

  useEffect(() => {
    if (!open || !nvKey) return;
    let cancelled = false;
    setLoading(true);
    setErr('');
    fetchLogisticaMapa(nvKey.split(',').map(Number))
      .then((data) => { if (!cancelled) setPuntos(Array.isArray(data?.puntos) ? data.puntos : []); })
      .catch((e) => { if (!cancelled) setErr(e?.response?.data?.error || e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, nvKey]);

  const conUbicacion = useMemo(() => puntos.filter((p) => p.lat != null && p.lng != null), [puntos]);
  const sinUbicacion = useMemo(() => puntos.filter((p) => p.lat == null || p.lng == null), [puntos]);

  // Paradas que no son un portón (ej. alojamiento) - ya vienen con lat/lng
  // resueltos desde el padre (logistica_puntos_extra), no hace falta pedirlas.
  const paradasExtraConUbicacion = useMemo(() => (paradasExtra || []).filter((p) => p.lat != null && p.lng != null), [paradasExtra]);
  const paradasExtraPorId = useMemo(() => new Map((paradasExtra || []).map((p) => [p.punto_extra_id, p])), [paradasExtra]);

  // Init del mapa: una vez por apertura (el contenedor se desmonta al cerrar).
  useEffect(() => {
    if (!open || !mapElRef.current || mapRef.current) return;
    const map = L.map(mapElRef.current).setView(ARGENTINA_CENTER, ARGENTINA_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    markersLayerRef.current = L.layerGroup().addTo(map);
    // Después de los pines para que la línea/números de ruta se dibujen por
    // encima (si no, quedan tapados por los círculos verdes).
    rutaLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
      rutaLayerRef.current = null;
    };
  }, [open]);

  // Pines: se redibujan cada vez que cambian los puntos resueltos.
  useEffect(() => {
    const map = mapRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    conUbicacion.forEach((p) => {
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: 9,
        color: '#fff',
        weight: 2,
        fillColor: '#008241',
        fillOpacity: 0.9,
      });

      const popupEl = document.createElement('div');
      popupEl.style.minWidth = '200px';
      popupEl.innerHTML = `
        <div style="font-weight:700;margin-bottom:4px;color:#333;">NV ${escapeHtml(p.nv)}</div>
        <div style="margin-bottom:4px;color:#333;">${escapeHtml(p.nombre || '—')}</div>
        <div style="font-size:12px;color:#666;margin-bottom:6px;">${escapeHtml(p.direccion || 'Sin dirección')}</div>
        ${p.zona ? `<div style="font-size:11px;font-weight:700;color:#0a6a33;margin-bottom:4px;">📍 ${escapeHtml(p.zona.zona_nombre)}</div>` : ''}
      `;
      const link = document.createElement('a');
      link.href = `https://www.google.com/maps?q=${p.lat},${p.lng}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Abrir en Google Maps →';
      link.style.cssText = 'display:block;margin-top:4px;font-size:12px;font-weight:700;color:#0a6a33;';
      popupEl.appendChild(link);

      marker.bindPopup(popupEl);
      marker.addTo(layer);
    });

    // Paradas que no son un portón (ej. alojamiento) - mismo trato que un
    // portón en el mapa, con su propio color (ámbar) para distinguirlas.
    paradasExtraConUbicacion.forEach((p) => {
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: 9,
        color: '#fff',
        weight: 2,
        fillColor: '#f59e0b',
        fillOpacity: 0.9,
      });

      const popupEl = document.createElement('div');
      popupEl.style.minWidth = '200px';
      popupEl.innerHTML = `<div style="font-weight:700;margin-bottom:4px;color:#333;">🏨 ${escapeHtml(p.nombre)}</div>`;
      if (p.maps_url) {
        const link = document.createElement('a');
        link.href = p.maps_url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Abrir en Google Maps →';
        link.style.cssText = 'display:block;margin-top:4px;font-size:12px;font-weight:700;color:#b45309;';
        popupEl.appendChild(link);
      }
      marker.bindPopup(popupEl);
      marker.addTo(layer);
    });

    const todosLosPuntos = [...conUbicacion.map((p) => [p.lat, p.lng]), ...paradasExtraConUbicacion.map((p) => [p.lat, p.lng])];
    if (todosLosPuntos.length > 0) {
      map.fitBounds(L.latLngBounds(todosLosPuntos), { padding: [40, 40], maxZoom: 14 });
    }
  }, [conUbicacion, paradasExtraConUbicacion]);

  // Ruta guardada del viaje: línea recta que une las paradas en su orden
  // real + numerito (🏨 para una parada que no es un portón). No es la ruta
  // real por calle, mismo criterio que "Generar viaje con IA". rutaOrden
  // (mixto, [{nv}|{punto_extra_id}]) es el formato nuevo; si no viene, cae a
  // rutaNvs (solo NV, formato viejo) por compatibilidad.
  const puntosPorNv = useMemo(() => new Map(puntos.map((p) => [p.nv, p])), [puntos]);
  const ordenRuta = useMemo(() => rutaOrden || (rutaNvs || []).map((nv) => ({ nv })), [rutaOrden, rutaNvs]);
  useEffect(() => {
    const layer = rutaLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();
    if (!ordenRuta.length) return;

    // Reloj de llegada tramo a tramo - segmentos_horas viene de ruta_real
    // (uno por tramo real, OpenRouteService), y ordenRuta ya está dedupeado
    // por NV (armado así en el llamador) - mismo orden. Una parada extra
    // puede correr el reloj: duracion_minutos lo SUMA (cualquier parada, ej.
    // "retirar un cobro" = 15 min); hora_salida_siguiente lo hace SALTAR
    // (reemplaza, no suma) al día siguiente - solo descanso/hospedaje, gana
    // por sobre duracion_minutos si están las dos cargadas.
    const segmentosHoras = rutaReal?.segmentos_horas;
    let minutosClock = null;
    if (horaSalida && segmentosHoras?.length) {
      const [h, m] = horaSalida.split(':').map(Number);
      minutosClock = h * 60 + m;
    }
    let segIdx = 0;

    const puntosRuta = [];
    let numParada = 0;
    ordenRuta.forEach((w) => {
      const esExtra = w.punto_extra_id != null;
      const p = esExtra ? paradasExtraPorId.get(w.punto_extra_id) : puntosPorNv.get(w.nv);
      if (!p || p.lat == null || p.lng == null) return;
      puntosRuta.push([p.lat, p.lng]);
      numParada += 1;

      let horaLlegada = null;
      if (minutosClock != null && segmentosHoras[segIdx] != null) {
        minutosClock += segmentosHoras[segIdx] * 60;
        const totalMin = Math.round(minutosClock);
        horaLlegada = formatearHorario(totalMin);
        if (esExtra && p.hora_salida_siguiente) {
          const dia = Math.floor(totalMin / 1440);
          const [hs, ms] = p.hora_salida_siguiente.split(':').map(Number);
          minutosClock = (dia + 1) * 1440 + hs * 60 + ms;
        } else if (esExtra && p.duracion_minutos) {
          minutosClock += Number(p.duracion_minutos);
        }
        segIdx += 1;
      }

      const icon = L.divIcon({
        className: '',
        html: `<div style="background:${esExtra ? '#f59e0b' : '#dc2626'};color:#fff;border-radius:999px;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)">${esExtra ? '🏨' : numParada}</div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      const marker = L.marker([p.lat, p.lng], { icon, zIndexOffset: 1000 });
      if (horaLlegada) {
        marker.bindTooltip(`🕒 Llegada estimada: ${horaLlegada}`, { direction: 'top', permanent: false });
      }
      marker.addTo(layer);
    });
    // Ruta real por calle (OpenRouteService, perfil camión) si ya se
    // calculó para este viaje - si no, cae a la línea recta entre paradas.
    if (rutaReal?.geometria?.length >= 2) {
      L.polyline(rutaReal.geometria, { color: '#dc2626', weight: 4, opacity: 0.85 }).addTo(layer);
    } else if (puntosRuta.length >= 2) {
      L.polyline(puntosRuta, { color: '#dc2626', weight: 3, opacity: 0.8, dashArray: '8 6' }).addTo(layer);
    }
  }, [ordenRuta, puntosPorNv, paradasExtraPorId, rutaReal, horaSalida]);

  const rutaSinUbicacionNvs = useMemo(() => {
    return ordenRuta
      .filter((w) => w.punto_extra_id == null)
      .map((w) => w.nv)
      .filter((nv) => { const p = puntosPorNv.get(nv); return !p || p.lat == null || p.lng == null; });
  }, [ordenRuta, puntosPorNv]);

  if (!open) return null;

  return (
    <div
      // 10000, no un valor bajo cualquiera: Leaflet pone sus controles
      // propios en z-index 1000, y este modal a veces se abre DESDE OTRO
      // modal (LogisticaViajeSemanaModal, z-index 9999) - tiene que quedar
      // por encima de ambos.
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div style={{ width: 'min(1000px, 100%)', height: 'min(760px, 92vh)', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.25)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 15 }}>{titulo || 'Mapa'}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              {loading ? 'Resolviendo ubicaciones…' : `${conUbicacion.length} de ${puntos.length} portones con ubicación${paradasExtra?.length ? ` · ${paradasExtraConUbicacion.length} de ${paradasExtra.length} paradas 🏨` : ''}`}
            </div>
          </div>
          <button className="btn" style={{ marginLeft: 'auto' }} onClick={onClose}>Cerrar</button>
        </div>

        {err ? <div style={{ color: 'crimson', fontWeight: 800, fontSize: 12 }}>{err}</div> : null}

        {!loading && !err && sinUbicacion.length > 0 ? (
          <div style={{ fontSize: 12, background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', padding: '8px 10px', borderRadius: 10 }}>
            {conUbicacion.length === 0 ? (
              <b>Ningún portón tiene ubicación cargada.</b>
            ) : (
              <b>{sinUbicacion.length} portón{sinUbicacion.length === 1 ? '' : 'es'} sin ubicación</b>
            )}
            {' '}(sin link de Google Maps en el presupuesto, o sin presupuesto asociado): NV{' '}
            {sinUbicacion.map((p) => p.nv).join(', ')}.
          </div>
        ) : null}

        <div style={{ flex: '1 1 auto', minHeight: 0, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', position: 'relative' }}>
          <div ref={mapElRef} style={{ width: '100%', height: '100%' }} />
          {ordenRuta.length > 0 ? (
            <div style={{ position: 'absolute', bottom: 10, left: 10, zIndex: 1000, background: 'var(--surface)', border: '1px solid var(--border)', padding: '6px 10px', borderRadius: 8, fontSize: 11, boxShadow: '0 1px 4px rgba(0,0,0,.25)', maxWidth: 280 }}>
              🔴 {rutaReal?.geometria?.length >= 2
                ? `Ruta real por calle: ${rutaReal.distancia_km} km, ~${rutaReal.duracion_horas}h de viaje.`
                : 'Línea = orden guardado del viaje (distancia en línea recta, no la ruta real por calle).'}
              {rutaSinUbicacionNvs.length > 0 ? (
                <div style={{ marginTop: 4, color: '#92400e' }}>
                  NV {rutaSinUbicacionNvs.join(', ')} sin ubicación resuelta, no aparece{rutaSinUbicacionNvs.length === 1 ? '' : 'n'} en la línea.
                </div>
              ) : null}
            </div>
          ) : null}
          {!loading && conUbicacion.length === 0 && paradasExtraConUbicacion.length === 0 ? (
            <div
              style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.35)', color: '#fff', fontWeight: 800, fontSize: 14, textAlign: 'center', padding: 20,
              }}
            >
              Sin puntos para mostrar
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

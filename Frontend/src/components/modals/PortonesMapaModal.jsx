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

export default function PortonesMapaModal({ open, onClose, nvs, titulo }) {
  const [puntos, setPuntos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markersLayerRef = useRef(null);

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

  // Init del mapa: una vez por apertura (el contenedor se desmonta al cerrar).
  useEffect(() => {
    if (!open || !mapElRef.current || mapRef.current) return;
    const map = L.map(mapElRef.current).setView(ARGENTINA_CENTER, ARGENTINA_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    markersLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
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

    if (conUbicacion.length > 0) {
      const bounds = L.latLngBounds(conUbicacion.map((p) => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [conUbicacion]);

  if (!open) return null;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div style={{ width: 'min(1000px, 100%)', height: 'min(760px, 92vh)', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.25)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 15 }}>{titulo || 'Mapa'}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              {loading ? 'Resolviendo ubicaciones…' : `${conUbicacion.length} de ${puntos.length} portones con ubicación`}
            </div>
          </div>
          <button className="btn" style={{ marginLeft: 'auto' }} onClick={onClose}>Cerrar</button>
        </div>

        {err ? <div style={{ color: 'crimson', fontWeight: 800, fontSize: 12 }}>{err}</div> : null}

        <div style={{ flex: '1 1 auto', minHeight: 0, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <div ref={mapElRef} style={{ width: '100%', height: '100%' }} />
        </div>
      </div>
    </div>
  );
}

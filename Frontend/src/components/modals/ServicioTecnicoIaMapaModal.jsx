// src/components/modals/ServicioTecnicoIaMapaModal.jsx
//
// "Generar viaje con IA" para Servicio Técnico: espejo de
// LogisticaIaMapaModal.jsx, adaptado al dominio - los items son
// heterogéneos (solicitudes de ST + mediciones pendientes, identificados
// por {tipo,id} en vez de solo NV) y a diferencia de los portones de
// Logística (que YA tienen fecha de despacho/instalación cargada, solo les
// falta viaje) estos items TODAVÍA NO tienen fecha programada - por eso acá
// crear el viaje también programa la fecha de cada item (no solo asignarlo).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  fetchStItemsSinFecha,
  fetchStViajesConfig,
  recomendarStViajeIa,
  planificarStRutasIa,
  patchStFechaItem,
  crearStViaje,
  asignarStItem,
} from '../../api';
import { isoWeekStartEndFromLabel, weekNumberFromLabel, todayISO10 } from '../../utils/isoWeek';
import ServicioTecnicoIaConfigModal from './ServicioTecnicoIaConfigModal';

const ARGENTINA_CENTER = [-38.4, -63.6];
const ARGENTINA_ZOOM = 4;

const TIPO_COLOR = { solicitud: '#7c3aed', medicion: '#0891b2' };
const COLOR_SELECCIONADO = '#f59e0b';

function itemKey(it) { return `${it.tipo}:${it.id}`; }

export default function ServicioTecnicoIaMapaModal({ open, onClose, onCreated }) {
  const [items, setItems] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [selected, setSelected] = useState(() => new Set());

  const [recomendando, setRecomendando] = useState(false);
  const [recomendacion, setRecomendacion] = useState(null);

  const [vista, setVista] = useState('seleccion'); // 'seleccion' | 'planes'
  const [planificando, setPlanificando] = useState(false);
  const [planes, setPlanes] = useState(null);

  const [confirmando, setConfirmando] = useState(false);
  const [confirmForm, setConfirmForm] = useState(null);
  const [creando, setCreando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const [showIaConfig, setShowIaConfig] = useState(false);

  const [rutaOrdenParadas, setRutaOrdenParadas] = useState(null);
  const [rutaActivaKey, setRutaActivaKey] = useState(null);
  const limpiarRuta = () => { setRutaOrdenParadas(null); setRutaActivaKey(null); };

  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markersLayerRef = useRef(null);
  const rutaLayerRef = useRef(null);
  const markersByKeyRef = useRef(new Map());

  useEffect(() => {
    if (!open) return;
    setErr('');
    setSelected(new Set());
    setRecomendacion(null);
    setConfirmando(false);
    setResultado(null);
    setVista('seleccion');
    setPlanes(null);
    limpiarRuta();
    setLoading(true);
    Promise.all([fetchStItemsSinFecha(), fetchStViajesConfig()])
      .then(([itemsRes, configRes]) => {
        setItems(Array.isArray(itemsRes?.items) ? itemsRes.items : []);
        setConfig(configRes?.config || null);
      })
      .catch((e) => setErr(e?.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, [open]);

  const itemsByKey = useMemo(() => new Map(items.map((it) => [itemKey(it), it])), [items]);
  const conUbicacion = useMemo(() => items.filter((it) => it.lat != null && it.lng != null), [items]);
  const sinUbicacion = items.length - conUbicacion.length;

  useEffect(() => {
    if (!open || !mapElRef.current || mapRef.current) return;
    const map = L.map(mapElRef.current).setView(ARGENTINA_CENTER, ARGENTINA_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    markersLayerRef.current = L.layerGroup().addTo(map);
    rutaLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
      rutaLayerRef.current = null;
      markersByKeyRef.current = new Map();
    };
  }, [open]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    markersByKeyRef.current = new Map();

    conUbicacion.forEach((it) => {
      const key = itemKey(it);
      const marker = L.circleMarker([it.lat, it.lng], {
        radius: 8, color: '#fff', weight: 2, fillColor: TIPO_COLOR[it.tipo], fillOpacity: 0.9,
      });
      marker.bindTooltip(
        `${it.tipo === 'solicitud' ? '🔧 Solicitud' : '📏 Medición'}${it.nv ? ` — NV ${it.nv}` : ''} — ${it.nombre_cliente || 'sin nombre'}`,
        { direction: 'top' }
      );
      marker.on('click', () => {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key); else next.add(key);
          return next;
        });
      });
      marker.addTo(layer);
      markersByKeyRef.current.set(key, marker);
    });

    if (conUbicacion.length > 0) {
      const bounds = L.latLngBounds(conUbicacion.map((it) => [it.lat, it.lng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    }
  }, [conUbicacion]);

  useEffect(() => {
    for (const [key, marker] of markersByKeyRef.current.entries()) {
      const it = itemsByKey.get(key);
      const isSel = selected.has(key);
      marker.setStyle({ fillColor: isSel ? COLOR_SELECCIONADO : TIPO_COLOR[it?.tipo], radius: isSel ? 11 : 8, weight: isSel ? 3 : 2 });
    }
  }, [selected, itemsByKey]);

  // Ruta sugerida: línea recta + numerito por parada, mismo criterio que
  // Logística (no hay motor de ruteo real por calle acá).
  useEffect(() => {
    const layer = rutaLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();
    if (!rutaOrdenParadas || rutaOrdenParadas.length === 0) return;

    const ordenados = [...rutaOrdenParadas].sort((a, b) => a.orden - b.orden);
    const puntos = [];
    ordenados.forEach((p, i) => {
      const it = itemsByKey.get(itemKey(p));
      if (!it || it.lat == null || it.lng == null) return;
      puntos.push([it.lat, it.lng]);
      const icon = L.divIcon({
        className: '',
        html: `<div style="background:#dc2626;color:#fff;border-radius:999px;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)">${i + 1}</div>`,
        iconSize: [20, 20], iconAnchor: [10, 10],
      });
      L.marker([it.lat, it.lng], { icon, interactive: false, zIndexOffset: 1000 }).addTo(layer);
    });
    if (puntos.length >= 2) {
      const polyline = L.polyline(puntos, { color: '#dc2626', weight: 3, opacity: 0.8, dashArray: '8 6' }).addTo(layer);
      map.fitBounds(polyline.getBounds(), { padding: [60, 60], maxZoom: 13 });
    }
  }, [rutaOrdenParadas, itemsByKey]);

  const rutaSinUbicacionKeys = useMemo(() => {
    if (!rutaOrdenParadas) return [];
    return rutaOrdenParadas.filter((p) => { const it = itemsByKey.get(itemKey(p)); return !it || it.lat == null || it.lng == null; });
  }, [rutaOrdenParadas, itemsByKey]);

  if (!open) return null;

  const generarRecomendacion = async () => {
    setRecomendando(true);
    setErr('');
    try {
      const itemsSel = Array.from(selected).map((key) => { const it = itemsByKey.get(key); return { tipo: it.tipo, id: it.id }; });
      const data = await recomendarStViajeIa(itemsSel);
      setRecomendacion(data);
      setRutaOrdenParadas(data?.recomendacion?.orden_paradas || null);
      setRutaActivaKey('recomendacion');
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setRecomendando(false);
    }
  };

  // itemsList: [{tipo,id,nv?}] en el orden final deseado. opts: { semanaSugerida, vehiculoSugerido, nombreSugerido }.
  const abrirConfirmacion = (itemsList, opts = {}) => {
    if (!itemsList?.length) { setErr('No hay items para armar el viaje.'); return; }
    const semana = opts.semanaSugerida;
    if (!semana) { setErr('La recomendación no trajo una semana sugerida.'); return; }

    const { start, end } = isoWeekStartEndFromLabel(semana);
    const hoy = todayISO10();
    const fechaDefault = hoy >= start && hoy <= end ? hoy : start;

    const vehiculoSugerido = (config?.vehiculos || []).find(
      (v) => v.activo && opts.vehiculoSugerido && v.nombre.trim().toLowerCase() === String(opts.vehiculoSugerido).trim().toLowerCase()
    );

    const zonaCounts = new Map();
    for (const it of itemsList) {
      const zid = itemsByKey.get(itemKey(it))?.zona?.zona_id;
      if (zid) zonaCounts.set(zid, (zonaCounts.get(zid) || 0) + 1);
    }
    let zonaId = null, zonaMax = 0;
    for (const [zid, c] of zonaCounts) if (c > zonaMax) { zonaMax = c; zonaId = zid; }

    setConfirmForm({
      items: itemsList, semana, fecha: fechaDefault,
      zona_id: zonaId ? String(zonaId) : '',
      cuadrilla_id: '',
      vehiculo_id: vehiculoSugerido ? String(vehiculoSugerido.id) : '',
      nombre: opts.nombreSugerido || `Viaje IA · Semana ${weekNumberFromLabel(semana)}`,
    });
    setConfirmando(true);
  };

  const planificarTodo = async () => {
    setPlanificando(true);
    setErr('');
    try {
      const data = await planificarStRutasIa();
      setPlanes(data);
      setVista('planes');
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setPlanificando(false);
    }
  };

  const crear = async () => {
    setCreando(true);
    setErr('');
    try {
      const { items: itemsList, fecha, semana, zona_id, cuadrilla_id, vehiculo_id, nombre } = confirmForm;

      // Los items de ST no tienen fecha todavía (a diferencia de los
      // portones de Logística) - primero hay que programarla, recién
      // después el item "existe" en esa semana para poder asignarlo a un viaje.
      const fallidos = [];
      const itemsConFecha = [];
      for (const it of itemsList) {
        try { await patchStFechaItem(it.tipo, it.id, fecha); itemsConFecha.push(it); }
        catch { fallidos.push(it); }
      }
      if (!itemsConFecha.length) throw new Error('No se pudo programar la fecha de ningún item.');

      const crearRes = await crearStViaje(semana, {
        fecha, zona_id: zona_id ? Number(zona_id) : null,
        cuadrilla_id: cuadrilla_id ? Number(cuadrilla_id) : null,
        vehiculo_id: vehiculo_id ? Number(vehiculo_id) : null,
        nombre: nombre || null,
      });
      const detalle = crearRes?.detalle;
      const viaje = (detalle?.viajes || []).reduce((max, v) => (max == null || v.id > max.id ? v : max), null);
      if (!viaje) throw new Error('El viaje se creó pero no lo pude encontrar para asignar los items');

      let asignados = 0;
      for (const it of itemsConFecha) {
        try {
          await asignarStItem(viaje.id, { tipo: it.tipo, solicitud_id: it.tipo === 'solicitud' ? it.id : null, quote_id: it.tipo === 'medicion' ? it.id : null });
          asignados += 1;
        } catch {
          fallidos.push(it);
        }
      }

      setResultado({ viajeId: viaje.id, semana, asignados, fallidos });
      setConfirmando(false);
      onCreated?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setCreando(false);
    }
  };

  const rec = recomendacion?.recomendacion;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 85, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div style={{ width: 'min(1400px, 100%)', height: 'min(880px, 96vh)', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.25)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 15 }}>🤖 Generar viaje de Técnica con IA</div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>
              {loading ? 'Cargando…' : `${conUbicacion.length} items sin fecha con ubicación${sinUbicacion ? ` (+${sinUbicacion} sin ubicación resuelta, no aparecen acá)` : ''} · ${selected.size} seleccionado${selected.size === 1 ? '' : 's'}`}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, fontSize: 11, alignItems: 'center' }}>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: TIPO_COLOR.solicitud, marginRight: 3 }} />🔧 solicitud</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: TIPO_COLOR.medicion, marginRight: 3 }} />📏 medición</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: COLOR_SELECCIONADO, marginRight: 3 }} />seleccionado</span>
          </div>
          <button className="btn" onClick={() => setShowIaConfig(true)}>🤖 Config IA</button>
          <button className="btn" onClick={onClose}>Cerrar</button>
        </div>

        {err ? <div style={{ color: 'crimson', fontWeight: 800, fontSize: 12 }}>{err}</div> : null}

        <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', gap: 10 }}>
          <div style={{ flex: '1 1 auto', minWidth: 0, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', position: 'relative' }}>
            <div ref={mapElRef} style={{ width: '100%', height: '100%' }} />
            {rutaOrdenParadas?.length > 0 ? (
              <div style={{ position: 'absolute', bottom: 10, left: 10, zIndex: 1000, background: 'var(--surface)', border: '1px solid var(--border)', padding: '6px 10px', borderRadius: 8, fontSize: 11, boxShadow: '0 1px 4px rgba(0,0,0,.25)', maxWidth: 280 }}>
                🔴 Línea = orden sugerido de paradas (distancia en línea recta, no la ruta real por calle).
                {rutaSinUbicacionKeys.length > 0 ? (
                  <div style={{ marginTop: 4, color: '#92400e' }}>
                    {rutaSinUbicacionKeys.length} parada{rutaSinUbicacionKeys.length === 1 ? '' : 's'} sin ubicación resuelta, no aparece{rutaSinUbicacionKeys.length === 1 ? '' : 'n'} en la línea.
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div style={{ width: 340, flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
            {resultado ? (
              <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--surface-muted, #f9fafb)' }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>✅ Viaje creado</div>
                <div style={{ fontSize: 12, marginBottom: 6 }}>
                  Semana {weekNumberFromLabel(resultado.semana)} · {resultado.asignados} item{resultado.asignados === 1 ? '' : 's'} asignado{resultado.asignados === 1 ? '' : 's'}.
                </div>
                {resultado.fallidos.length > 0 ? (
                  <div style={{ fontSize: 11, color: '#991b1b', marginBottom: 6 }}>
                    {resultado.fallidos.length} no se pudieron programar/asignar (revisalos en Planificación de Fechas).
                  </div>
                ) : null}
                <button className="btn" onClick={onClose}>Cerrar</button>
              </div>
            ) : confirmando && confirmForm ? (
              <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Crear viaje — Semana {weekNumberFromLabel(confirmForm.semana)}</div>
                <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 8 }}>{confirmForm.items.length} item{confirmForm.items.length === 1 ? '' : 's'}.</div>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, marginBottom: 8 }}>
                  Fecha
                  <input className="pp-input" type="date" min={isoWeekStartEndFromLabel(confirmForm.semana).start} max={isoWeekStartEndFromLabel(confirmForm.semana).end} value={confirmForm.fecha} onChange={(e) => setConfirmForm((f) => ({ ...f, fecha: e.target.value }))} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, marginBottom: 8 }}>
                  Zona
                  <select className="pp-select" value={confirmForm.zona_id} onChange={(e) => setConfirmForm((f) => ({ ...f, zona_id: e.target.value }))}>
                    <option value="">—</option>
                    {(config?.zonas || []).map((z) => <option key={z.id} value={z.id}>{z.nombre}</option>)}
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, marginBottom: 8 }}>
                  Cuadrilla
                  <select className="pp-select" value={confirmForm.cuadrilla_id} onChange={(e) => setConfirmForm((f) => ({ ...f, cuadrilla_id: e.target.value }))}>
                    <option value="">—</option>
                    {(config?.cuadrillas || []).filter((c) => c.activo).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, marginBottom: 8 }}>
                  Vehículo
                  <select className="pp-select" value={confirmForm.vehiculo_id} onChange={(e) => setConfirmForm((f) => ({ ...f, vehiculo_id: e.target.value }))}>
                    <option value="">—</option>
                    {(config?.vehiculos || []).filter((v) => v.activo).map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, marginBottom: 10 }}>
                  Nombre
                  <input className="pp-input" value={confirmForm.nombre} onChange={(e) => setConfirmForm((f) => ({ ...f, nombre: e.target.value }))} />
                </label>

                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn" disabled={creando} onClick={() => setConfirmando(false)}>Volver</button>
                  <button className="btn btn--brand" disabled={creando} onClick={crear}>{creando ? 'Creando…' : 'Confirmar y crear'}</button>
                </div>
              </div>
            ) : rec ? (
              <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontWeight: 900 }}>Recomendación de la IA</div>
                <div style={{ fontSize: 12 }}>{rec.resumen}</div>
                <div style={{ fontSize: 12 }}><b>Semana sugerida:</b> {rec.semana_sugerida}</div>
                <div style={{ fontSize: 12 }}><b>Tiempo estimado:</b> {rec.tiempo_total_estimado_horas}h</div>
                {rec.vehiculo_sugerido ? <div style={{ fontSize: 12 }}><b>Vehículo sugerido:</b> {rec.vehiculo_sugerido}</div> : null}

                <div style={{ fontSize: 12, fontWeight: 800, marginTop: 4 }}>Orden de paradas 🔴 (dibujado en el mapa)</div>
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 11 }}>
                  {[...rec.orden_paradas].sort((a, b) => a.orden - b.orden).map((p) => (
                    <li key={itemKey(p)} style={{ marginBottom: 4 }}>{p.tipo === 'solicitud' ? '🔧' : '📏'} {p.nv ? `NV ${p.nv}` : 'sin NV'} — {p.motivo}</li>
                  ))}
                </ol>

                {rec.alertas?.length > 0 ? (
                  <div style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: 8 }}>
                    {rec.alertas.map((a, i) => <div key={i}>⚠️ {a}</div>)}
                  </div>
                ) : null}

                <details style={{ fontSize: 11, opacity: 0.8 }}>
                  <summary style={{ cursor: 'pointer' }}>Razonamiento completo</summary>
                  {rec.razonamiento}
                </details>

                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button className="btn" onClick={() => { setRecomendacion(null); limpiarRuta(); }}>Descartar</button>
                  <button
                    className="btn btn--brand"
                    onClick={() => abrirConfirmacion([...rec.orden_paradas].sort((a, b) => a.orden - b.orden).map((p) => ({ tipo: p.tipo, id: p.id, nv: p.nv })), { semanaSugerida: rec.semana_sugerida, vehiculoSugerido: rec.vehiculo_sugerido })}
                  >
                    Crear viaje con esta recomendación
                  </button>
                </div>
              </div>
            ) : vista === 'planes' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => { setVista('seleccion'); limpiarRuta(); }}>← Volver a selección manual</button>

                {planes?.sin_zona?.cantidad > 0 ? (
                  <div style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: 8 }}>
                    {planes.sin_zona.cantidad} item{planes.sin_zona.cantidad === 1 ? '' : 's'} con ubicación pero sin zona clasificada (no se pudieron agrupar).
                    Cargá localidades de referencia en "Zonas" (Logística de Viajes) para incluirlos.
                  </div>
                ) : null}
                {planes?.sin_ubicacion > 0 ? (
                  <div style={{ fontSize: 11, opacity: 0.7 }}>{planes.sin_ubicacion} items sin ubicación resuelta, no evaluados.</div>
                ) : null}

                {(planes?.planes || []).map((plan) => (
                  <div key={plan.zona} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 10 }}>
                    <div style={{ fontWeight: 900, marginBottom: 6 }}>📍 {plan.zona} ({plan.total_en_zona} pendientes{plan.truncado ? ', mostrando solo una parte' : ''})</div>
                    {plan.error ? (
                      <div style={{ fontSize: 11, color: '#991b1b' }}>Error: {plan.error}</div>
                    ) : (plan.viajes_propuestos || []).length === 0 ? (
                      <div style={{ fontSize: 11, opacity: 0.7 }}>La IA no propuso viajes para esta zona.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {plan.viajes_propuestos.map((viaje, i) => {
                          const key = `${plan.zona}::${i}`;
                          const rutaActiva = rutaActivaKey === key;
                          return (
                            <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 8, background: 'var(--surface-muted, #f9fafb)' }}>
                              <div style={{ fontWeight: 800, fontSize: 12 }}>{viaje.nombre}</div>
                              <div style={{ fontSize: 11, opacity: 0.8 }}>
                                {viaje.items.length} item{viaje.items.length === 1 ? '' : 's'} · Semana {viaje.semana_sugerida} · {viaje.tiempo_total_estimado_horas}h
                                {viaje.vehiculo_sugerido ? ` · ${viaje.vehiculo_sugerido}` : ''}
                              </div>
                              {viaje.alertas?.length > 0 ? (
                                <div style={{ fontSize: 10, color: '#92400e', marginTop: 4 }}>
                                  {viaje.alertas.map((a, j) => <div key={j}>⚠️ {a}</div>)}
                                </div>
                              ) : null}
                              <details style={{ fontSize: 10, opacity: 0.8, marginTop: 4 }}>
                                <summary style={{ cursor: 'pointer' }}>Ver detalle</summary>
                                <div style={{ marginTop: 4 }}>Items: {viaje.items.map((it) => it.nv ? `NV ${it.nv}` : (it.tipo === 'solicitud' ? 'solicitud sin NV' : 'medición')).join(', ')}</div>
                                <div style={{ marginTop: 4 }}>{viaje.razonamiento}</div>
                              </details>
                              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                <button
                                  className="btn" style={{ fontSize: 11, padding: '3px 9px', ...(rutaActiva ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)' } : {}) }}
                                  onClick={() => { if (rutaActiva) { limpiarRuta(); } else { setRutaOrdenParadas(viaje.orden_paradas); setRutaActivaKey(key); } }}
                                >
                                  {rutaActiva ? '🗺️ Ocultar ruta' : '🗺️ Ver ruta'}
                                </button>
                                <button
                                  className="btn btn--brand" style={{ fontSize: 11, padding: '3px 9px' }}
                                  onClick={() => abrirConfirmacion(viaje.items, { semanaSugerida: viaje.semana_sugerida, vehiculoSugerido: viaje.vehiculo_sugerido, nombreSugerido: viaje.nombre })}
                                >
                                  Crear este viaje
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
                  Hacé click en los pines del mapa para seleccionar los items (solicitudes/mediciones) que querés
                  incluir en un viaje nuevo. Cuando termines, pedile a la IA que te recomiende semana, orden y vehículo.
                </div>

                <button className="btn" style={{ marginBottom: 12, width: '100%' }} disabled={planificando} onClick={planificarTodo}>
                  {planificando ? 'Planificando (puede tardar unos minutos)…' : '🗺️ Planificar todas las zonas automáticamente'}
                </button>
                <div style={{ fontSize: 10, opacity: 0.6, marginTop: -8, marginBottom: 12 }}>
                  Sin seleccionar nada: la IA agrupa TODOS los items pendientes por zona y propone qué viajes armar.
                </div>

                {selected.size > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                    {Array.from(selected).map((key) => {
                      const it = itemsByKey.get(key);
                      return (
                        <span key={key} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, background: 'var(--surface-muted, #f3f4f6)', border: '1px solid var(--border)' }}>
                          {it?.tipo === 'solicitud' ? '🔧' : '📏'} {it?.nv ? `NV ${it.nv}` : 'sin NV'}
                        </span>
                      );
                    })}
                  </div>
                ) : null}
                <button className="btn btn--brand" disabled={selected.size === 0 || recomendando} onClick={generarRecomendacion}>
                  {recomendando ? 'Pensando…' : `Generar viaje con IA (${selected.size})`}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <ServicioTecnicoIaConfigModal open={showIaConfig} onClose={() => setShowIaConfig(false)} />
    </div>
  );
}

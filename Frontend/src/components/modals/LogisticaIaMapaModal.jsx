// src/components/modals/LogisticaIaMapaModal.jsx
//
// "Generar viaje con IA": mapa de TODOS los portones con despacho y/o
// instalación pendiente que todavía no están asignados a ningún viaje
// (cualquier semana). El usuario selecciona un subconjunto (click en cada
// pin), pide una recomendación a Claude (semana, orden de paradas, tiempo
// estimado, vehículo sugerido, alertas), y desde ahí puede crear el viaje
// real y asignarle los portones - siempre con revisión humana antes de
// aplicar nada.
//
// Un portón solo puede asignarse a un viaje de SU semana (fecha_salida_imput
// / fecha_llegada_imput ya cargada en /a) - así que si la selección mezcla
// portones de semanas distintas, el viaje se crea en la semana mayoritaria y
// el resto queda afuera (se lo avisa claro, no se inventa un movimiento de
// fecha solo).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  fetchLogisticaPortonesSinViaje,
  fetchLogisticaViajesConfig,
  recomendarLogisticaViajeIa,
  planificarLogisticaRutasIa,
  crearLogisticaViaje,
  asignarLogisticaPorton,
} from '../../api';
import { isoWeekStartEndFromLabel, isoWeekLabelFromDate, weekNumberFromLabel, todayISO10 } from '../../utils/isoWeek';
import LogisticaZonasModal from './LogisticaZonasModal';
import LogisticaIaConfigModal from './LogisticaIaConfigModal';

const ARGENTINA_CENTER = [-38.4, -63.6];
const ARGENTINA_ZOOM = 4;

const COLOR_AMBOS = '#7c3aed';
const COLOR_DESPACHO = '#008241';
const COLOR_INSTALACION = '#2563eb';
const COLOR_SELECCIONADO = '#f59e0b';

function colorDe(item) {
  if (item.despacho_pendiente && item.instalacion_pendiente) return COLOR_AMBOS;
  if (item.despacho_pendiente) return COLOR_DESPACHO;
  return COLOR_INSTALACION;
}

// Agrupa la selección por semana real (cada NV/tipo pendiente tiene su
// propia semana); la semana con más pares gana, el resto queda afuera.
function agruparPorSemana(nvsSeleccionados, itemsByNv) {
  const pares = [];
  for (const nv of nvsSeleccionados) {
    const it = itemsByNv.get(nv);
    if (!it) continue;
    if (it.despacho_pendiente) pares.push({ nv, tipo: 'despacho', semana: it.semana_despacho, zona_id: it.zona?.zona_id ?? null });
    if (it.instalacion_pendiente) pares.push({ nv, tipo: 'instalacion', semana: it.semana_instalacion, zona_id: it.zona?.zona_id ?? null });
  }
  const counts = new Map();
  for (const p of pares) counts.set(p.semana, (counts.get(p.semana) || 0) + 1);
  let semana = null;
  let max = 0;
  for (const [wk, c] of counts) { if (c > max) { max = c; semana = wk; } }
  const incluidos = pares.filter((p) => p.semana === semana);
  const excluidos = pares.filter((p) => p.semana !== semana);
  return { semana, incluidos, excluidos };
}

// Reordena una lista de NV según el orden_paradas que propuso la IA, para
// que al crear el viaje (asignación secuencial, ver crear()) las columnas ya
// nazcan en el orden real de la ruta - así el usuario no tiene que rehacer a
// mano el orden que la IA ya pensó. NV que no aparecen en orden_paradas
// (no debería pasar, pero por las dudas) quedan al final, en su orden original.
function nvsEnOrdenSugerido(nvsList, ordenParadas) {
  if (!ordenParadas?.length) return nvsList;
  const ordenPorNv = new Map(ordenParadas.map((p) => [p.nv, p.orden]));
  return [...nvsList].sort((a, b) => {
    const oa = ordenPorNv.has(a) ? ordenPorNv.get(a) : Infinity;
    const ob = ordenPorNv.has(b) ? ordenPorNv.get(b) : Infinity;
    return oa - ob;
  });
}

export default function LogisticaIaMapaModal({ open, onClose, onCreated }) {
  const [items, setItems] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [selected, setSelected] = useState(() => new Set());

  const [recomendando, setRecomendando] = useState(false);
  const [recomendacion, setRecomendacion] = useState(null);

  // Vista alternativa: en vez de seleccionar a mano, la IA mira TODOS los
  // portones pendientes, los agrupa por zona y propone qué viajes armar en
  // cada una (Fase 3).
  const [vista, setVista] = useState('seleccion'); // 'seleccion' | 'planes'
  const [planificando, setPlanificando] = useState(false);
  const [planes, setPlanes] = useState(null); // { planes, sin_zona, sin_ubicacion } | null

  const [confirmando, setConfirmando] = useState(false);
  const [confirmForm, setConfirmForm] = useState(null);
  const [creando, setCreando] = useState(false);
  const [resultado, setResultado] = useState(null); // { asignados, excluidos } | null

  const [showZonas, setShowZonas] = useState(false);
  const [showIaConfig, setShowIaConfig] = useState(false);

  // Ruta sugerida dibujada sobre el mapa: línea recta (no ruta real por
  // calle - acá no hay motor de ruteo) que une los puntos en el orden que
  // propuso la IA, con un numerito por parada. rutaActivaKey identifica cuál
  // botón "Ver ruta" está activo (recomendación manual, o cuál viaje
  // propuesto en la vista de planes por zona) para poder resaltarlo/togglearlo.
  const [rutaOrdenParadas, setRutaOrdenParadas] = useState(null); // [{nv, orden}] | null
  const [rutaActivaKey, setRutaActivaKey] = useState(null);

  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markersLayerRef = useRef(null);
  const rutaLayerRef = useRef(null);
  const markersByNvRef = useRef(new Map());

  const limpiarRuta = () => { setRutaOrdenParadas(null); setRutaActivaKey(null); };

  const reloadConfig = () => {
    fetchLogisticaViajesConfig().then((c) => setConfig(c?.config || null)).catch(() => {});
  };

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
    Promise.all([fetchLogisticaPortonesSinViaje(), fetchLogisticaViajesConfig()])
      .then(([itemsRes, configRes]) => {
        setItems(Array.isArray(itemsRes?.items) ? itemsRes.items : []);
        setConfig(configRes?.config || null);
      })
      .catch((e) => setErr(e?.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, [open]);

  const itemsByNv = useMemo(() => new Map(items.map((i) => [i.nv, i])), [items]);
  const conUbicacion = useMemo(() => items.filter((i) => i.lat != null && i.lng != null), [items]);
  const sinUbicacion = items.length - conUbicacion.length;

  // Init del mapa
  useEffect(() => {
    if (!open || !mapElRef.current || mapRef.current) return;
    const map = L.map(mapElRef.current).setView(ARGENTINA_CENTER, ARGENTINA_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    markersLayerRef.current = L.layerGroup().addTo(map);
    // Se agrega DESPUÉS de los pines para que la línea/números de la ruta
    // se dibujen por encima (si no, quedan tapados por los círculos de color).
    rutaLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
      rutaLayerRef.current = null;
      markersByNvRef.current = new Map();
    };
  }, [open]);

  // Pines: se redibujan cuando cambian los items resueltos (no cuando cambia
  // la selección - eso se pinta aparte, ver el efecto de abajo).
  useEffect(() => {
    const map = mapRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    markersByNvRef.current = new Map();

    conUbicacion.forEach((it) => {
      const marker = L.circleMarker([it.lat, it.lng], {
        radius: 8,
        color: '#fff',
        weight: 2,
        fillColor: colorDe(it),
        fillOpacity: 0.9,
      });
      marker.bindTooltip(
        `NV ${it.nv} — ${it.nombre || 'sin nombre'}${it.despacho_pendiente ? ' · despacho' : ''}${it.instalacion_pendiente ? ' · instalación' : ''}`,
        { direction: 'top' }
      );
      marker.on('click', () => {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(it.nv)) next.delete(it.nv); else next.add(it.nv);
          return next;
        });
      });
      marker.addTo(layer);
      markersByNvRef.current.set(it.nv, marker);
    });

    if (conUbicacion.length > 0) {
      const bounds = L.latLngBounds(conUbicacion.map((it) => [it.lat, it.lng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    }
  }, [conUbicacion]);

  // Pinta la selección sobre los markers ya dibujados, sin re-crearlos.
  useEffect(() => {
    for (const [nv, marker] of markersByNvRef.current.entries()) {
      const it = itemsByNv.get(nv);
      const isSel = selected.has(nv);
      marker.setStyle({
        fillColor: isSel ? COLOR_SELECCIONADO : colorDe(it),
        radius: isSel ? 11 : 8,
        weight: isSel ? 3 : 2,
      });
    }
  }, [selected, itemsByNv]);

  // Dibuja la ruta sugerida: línea recta que une los puntos en el orden
  // propuesto (no es la ruta real por calle - no hay motor de ruteo acá) más
  // un numerito por parada. Se redibuja cada vez que cambia el orden activo.
  useEffect(() => {
    const layer = rutaLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();
    if (!rutaOrdenParadas || rutaOrdenParadas.length === 0) return;

    const ordenados = [...rutaOrdenParadas].sort((a, b) => a.orden - b.orden);
    const puntos = [];
    ordenados.forEach((p, i) => {
      const it = itemsByNv.get(p.nv);
      if (!it || it.lat == null || it.lng == null) return;
      puntos.push([it.lat, it.lng]);
      const icon = L.divIcon({
        className: '',
        html: `<div style="background:#dc2626;color:#fff;border-radius:999px;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)">${i + 1}</div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      L.marker([it.lat, it.lng], { icon, interactive: false, zIndexOffset: 1000 }).addTo(layer);
    });
    if (puntos.length >= 2) {
      const polyline = L.polyline(puntos, { color: '#dc2626', weight: 3, opacity: 0.8, dashArray: '8 6' }).addTo(layer);
      map.fitBounds(polyline.getBounds(), { padding: [60, 60], maxZoom: 13 });
    }
  }, [rutaOrdenParadas, itemsByNv]);

  const rutaSinUbicacionNvs = useMemo(() => {
    if (!rutaOrdenParadas) return [];
    return rutaOrdenParadas
      .filter((p) => { const it = itemsByNv.get(p.nv); return !it || it.lat == null || it.lng == null; })
      .map((p) => p.nv);
  }, [rutaOrdenParadas, itemsByNv]);

  if (!open) return null;

  const generarRecomendacion = async () => {
    setRecomendando(true);
    setErr('');
    try {
      const data = await recomendarLogisticaViajeIa(Array.from(selected));
      setRecomendacion(data);
      setRutaOrdenParadas(data?.recomendacion?.orden_paradas || null);
      setRutaActivaKey('recomendacion');
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setRecomendando(false);
    }
  };

  // nvsList: NV a incluir (de la selección manual, o de un viaje propuesto
  // por la planificación automática). opts: { vehiculoSugerido, nombreSugerido }.
  const abrirConfirmacion = (nvsList, opts = {}) => {
    const { semana, incluidos, excluidos } = agruparPorSemana(nvsList, itemsByNv);
    if (!semana) { setErr('Ninguno de los portones de esta propuesta tiene semana asignada.'); return; }

    const { start, end } = isoWeekStartEndFromLabel(semana);
    const hoy = todayISO10();
    const fechaDefault = hoy >= start && hoy <= end ? hoy : start;

    const vehiculoSugerido = (config?.vehiculos || []).find(
      (v) => v.activo && opts.vehiculoSugerido &&
        v.nombre.trim().toLowerCase() === String(opts.vehiculoSugerido).trim().toLowerCase()
    );

    // Zona más frecuente entre los portones incluidos
    const zonaCounts = new Map();
    for (const p of incluidos) if (p.zona_id) zonaCounts.set(p.zona_id, (zonaCounts.get(p.zona_id) || 0) + 1);
    let zonaId = null, zonaMax = 0;
    for (const [zid, c] of zonaCounts) if (c > zonaMax) { zonaMax = c; zonaId = zid; }

    setConfirmForm({
      semana, incluidos, excluidos,
      fecha: fechaDefault,
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
      const data = await planificarLogisticaRutasIa();
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
      const { semana, incluidos, excluidos, fecha, zona_id, cuadrilla_id, vehiculo_id, nombre } = confirmForm;
      const crearRes = await crearLogisticaViaje(semana, {
        fecha,
        zona_id: zona_id ? Number(zona_id) : null,
        cuadrilla_id: cuadrilla_id ? Number(cuadrilla_id) : null,
        vehiculo_id: vehiculo_id ? Number(vehiculo_id) : null,
        nombre: nombre || null,
      });
      const detalle = crearRes?.detalle;
      const viaje = (detalle?.viajes || []).reduce((max, v) => (max == null || v.id > max.id ? v : max), null);
      if (!viaje) throw new Error('El viaje se creó pero no lo pude encontrar para asignar los portones');

      let asignados = 0;
      const fallidos = [];
      for (const p of incluidos) {
        const item = (detalle.items || []).find((it) => it.nv === p.nv && it.tipo === p.tipo);
        if (!item) { fallidos.push(p); continue; }
        try {
          await asignarLogisticaPorton(viaje.id, item.porton_id, p.tipo);
          asignados += 1;
        } catch {
          fallidos.push(p);
        }
      }

      setResultado({ viajeId: viaje.id, semana, asignados, excluidos, fallidos });
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
            <div style={{ fontWeight: 900, fontSize: 15 }}>🤖 Generar viaje con IA</div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>
              {loading ? 'Cargando…' : `${conUbicacion.length} portones sin viaje con ubicación${sinUbicacion ? ` (+${sinUbicacion} sin ubicación resuelta, no aparecen acá)` : ''} · ${selected.size} seleccionado${selected.size === 1 ? '' : 's'}`}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, fontSize: 11, alignItems: 'center' }}>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: COLOR_DESPACHO, marginRight: 3 }} />despacho</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: COLOR_INSTALACION, marginRight: 3 }} />instalación</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: COLOR_AMBOS, marginRight: 3 }} />ambos</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: COLOR_SELECCIONADO, marginRight: 3 }} />seleccionado</span>
          </div>
          <button className="btn" onClick={() => setShowZonas(true)}>Zonas</button>
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
                {rutaSinUbicacionNvs.length > 0 ? (
                  <div style={{ marginTop: 4, color: '#92400e' }}>
                    NV {rutaSinUbicacionNvs.join(', ')} sin ubicación resuelta, no aparece{rutaSinUbicacionNvs.length === 1 ? '' : 'n'} en la línea.
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
                  Semana {weekNumberFromLabel(resultado.semana)} · {resultado.asignados} portón{resultado.asignados === 1 ? '' : 'es'} asignado{resultado.asignados === 1 ? '' : 's'}.
                </div>
                {resultado.excluidos.length > 0 ? (
                  <div style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: 8, marginBottom: 6 }}>
                    {resultado.excluidos.length} quedaron afuera por estar en otra semana: NV{' '}
                    {resultado.excluidos.map((p) => p.nv).join(', ')}. Movelos en Planificación de Fechas si querés incluirlos.
                  </div>
                ) : null}
                {resultado.fallidos.length > 0 ? (
                  <div style={{ fontSize: 11, color: '#991b1b', marginBottom: 6 }}>
                    {resultado.fallidos.length} no se pudieron asignar (revisalos en Logística de Viajes).
                  </div>
                ) : null}
                <button className="btn" onClick={onClose}>Cerrar</button>
              </div>
            ) : confirmando && confirmForm ? (
              <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Crear viaje — Semana {weekNumberFromLabel(confirmForm.semana)}</div>
                <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 8 }}>
                  {confirmForm.incluidos.length} portón{confirmForm.incluidos.length === 1 ? '' : 'es'} de esta semana.
                  {confirmForm.excluidos.length > 0 ? ` ${confirmForm.excluidos.length} quedan afuera (otra semana): NV ${confirmForm.excluidos.map((p) => p.nv).join(', ')}.` : ''}
                </div>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, marginBottom: 8 }}>
                  Fecha
                  <input className="pp-input" type="date" value={confirmForm.fecha} onChange={(e) => setConfirmForm((f) => ({ ...f, fecha: e.target.value }))} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, marginBottom: 8 }}>
                  Zona
                  <select className="pp-select" value={confirmForm.zona_id} onChange={(e) => setConfirmForm((f) => ({ ...f, zona_id: e.target.value }))}>
                    <option value="">—</option>
                    {(config?.zonas || []).filter((z) => z.activo).map((z) => <option key={z.id} value={z.id}>{z.nombre}</option>)}
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
                  {rec.orden_paradas.sort((a, b) => a.orden - b.orden).map((p) => (
                    <li key={p.nv} style={{ marginBottom: 4 }}>NV {p.nv} — {p.motivo}</li>
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
                  <button className="btn btn--brand" onClick={() => abrirConfirmacion(nvsEnOrdenSugerido(Array.from(selected), rec.orden_paradas), { vehiculoSugerido: rec.vehiculo_sugerido })}>
                    Crear viaje con esta recomendación
                  </button>
                </div>
              </div>
            ) : vista === 'planes' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => { setVista('seleccion'); limpiarRuta(); }}>← Volver a selección manual</button>

                {planes?.sin_zona?.cantidad > 0 ? (
                  <div style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: 8 }}>
                    {planes.sin_zona.cantidad} portón{planes.sin_zona.cantidad === 1 ? '' : 'es'} con ubicación pero sin zona clasificada
                    (no se pudieron agrupar): NV {planes.sin_zona.nvs.join(', ')}. Cargá localidades de referencia en "Zonas" para incluirlos.
                  </div>
                ) : null}
                {planes?.sin_ubicacion > 0 ? (
                  <div style={{ fontSize: 11, opacity: 0.7 }}>
                    {planes.sin_ubicacion} portones sin ubicación resuelta, no evaluados.
                  </div>
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
                                {viaje.nvs.length} portón{viaje.nvs.length === 1 ? '' : 'es'} · Semana {viaje.semana_sugerida} · {viaje.tiempo_total_estimado_horas}h
                                {viaje.vehiculo_sugerido ? ` · ${viaje.vehiculo_sugerido}` : ''}
                              </div>
                              {viaje.alertas?.length > 0 ? (
                                <div style={{ fontSize: 10, color: '#92400e', marginTop: 4 }}>
                                  {viaje.alertas.map((a, j) => <div key={j}>⚠️ {a}</div>)}
                                </div>
                              ) : null}
                              <details style={{ fontSize: 10, opacity: 0.8, marginTop: 4 }}>
                                <summary style={{ cursor: 'pointer' }}>Ver detalle</summary>
                                <div style={{ marginTop: 4 }}>NV: {viaje.nvs.join(', ')}</div>
                                <div style={{ marginTop: 4 }}>{viaje.razonamiento}</div>
                              </details>
                              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                <button
                                  className="btn" style={{ fontSize: 11, padding: '3px 9px', ...(rutaActiva ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)' } : {}) }}
                                  onClick={() => {
                                    if (rutaActiva) { limpiarRuta(); }
                                    else { setRutaOrdenParadas(viaje.orden_paradas); setRutaActivaKey(key); }
                                  }}
                                >
                                  {rutaActiva ? '🗺️ Ocultar ruta' : '🗺️ Ver ruta'}
                                </button>
                                <button
                                  className="btn btn--brand" style={{ fontSize: 11, padding: '3px 9px' }}
                                  onClick={() => abrirConfirmacion(nvsEnOrdenSugerido(viaje.nvs, viaje.orden_paradas), { vehiculoSugerido: viaje.vehiculo_sugerido, nombreSugerido: viaje.nombre })}
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
                  Hacé click en los pines del mapa para seleccionar los portones que querés incluir en un viaje nuevo.
                  Cuando termines, pedile a la IA que te recomiende semana, orden y vehículo.
                </div>

                <button className="btn" style={{ marginBottom: 12, width: '100%' }} disabled={planificando} onClick={planificarTodo}>
                  {planificando ? 'Planificando (puede tardar unos minutos)…' : '🗺️ Planificar todas las zonas automáticamente'}
                </button>
                <div style={{ fontSize: 10, opacity: 0.6, marginTop: -8, marginBottom: 12 }}>
                  Sin seleccionar nada: la IA agrupa TODOS los portones pendientes por zona y propone qué viajes armar.
                </div>

                {selected.size > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                    {Array.from(selected).map((nv) => (
                      <span key={nv} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, background: 'var(--surface-muted, #f3f4f6)', border: '1px solid var(--border)' }}>
                        NV {nv}
                      </span>
                    ))}
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

      <LogisticaZonasModal open={showZonas} config={config} onClose={() => setShowZonas(false)} onChanged={reloadConfig} />
      <LogisticaIaConfigModal open={showIaConfig} onClose={() => setShowIaConfig(false)} />
    </div>
  );
}

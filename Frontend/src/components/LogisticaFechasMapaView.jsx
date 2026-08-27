// src/components/LogisticaFechasMapaView.jsx
//
// Nueva vista principal de Planificación de Fechas: mapa embebido (no modal)
// con los portones pendientes de asignar a un viaje. Sin filtro de semana
// muestra TODOS los pendientes (cualquier semana, como ya hacía "Generar
// viaje con IA"); con una semana elegida, muestra TODOS los portones de esa
// semana - asignados (con la ruta de su viaje, coloreada por vehículo) y sin
// asignar (seleccionables) - para poder armar/consultar/ajustar viajes sin
// perder el contexto geográfico.
//
// Selección + recomendación de IA + confirmar y crear: mismo motor que
// LogisticaIaMapaModal.jsx (no se duplica la lógica de negocio, se adapta a
// vivir embebido en la página en vez de en un modal).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  fetchLogisticaPortonesSinViaje,
  fetchLogisticaSemanaMapa,
  fetchLogisticaSemanaPromesaMapa,
  fetchLogisticaViajesConfig,
  recomendarLogisticaViajeIa,
  planificarLogisticaRutasIa,
  crearLogisticaViaje,
  asignarLogisticaPorton,
} from '../api';
import { isoWeekStartEndFromLabel, weekNumberFromLabel, weekTitleFromSelection, todayISO10, buildWeekRange, isoWeekLabelFromDate } from '../utils/isoWeek';
import LogisticaZonasModal from './modals/LogisticaZonasModal';
import LogisticaIaConfigModal from './modals/LogisticaIaConfigModal';
import LogisticaPromesaConfigModal from './modals/LogisticaPromesaConfigModal';
import LogisticaMensajeViajeModal from './modals/LogisticaMensajeViajeModal';

const ARGENTINA_CENTER = [-38.4, -63.6];
const ARGENTINA_ZOOM = 4;

const COLOR_AMBOS = '#7c3aed';
const COLOR_DESPACHO = '#008241';
const COLOR_INSTALACION = '#2563eb';
const COLOR_SELECCIONADO = '#f59e0b';
const COLOR_ASIGNADO_SIN_PENDIENTE = '#9ca3af';
const COLOR_PROMESA_INFO = '#0891b2';

// Un color estable por vehículo (por posición en la lista de config, no por
// id crudo, para que el orden sea predecible) + gris para "sin vehículo".
const VEHICULO_PALETTE = ['#dc2626', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#0d9488'];
function colorPorVehiculo(vehiculoId, vehiculos) {
  if (vehiculoId == null) return '#6b7280';
  const idx = (vehiculos || []).findIndex((v) => v.id === vehiculoId);
  return VEHICULO_PALETTE[(idx >= 0 ? idx : 0) % VEHICULO_PALETTE.length];
}

function colorDe(item) {
  if (item.despacho_pendiente && item.instalacion_pendiente) return COLOR_AMBOS;
  if (item.despacho_pendiente) return COLOR_DESPACHO;
  if (item.instalacion_pendiente) return COLOR_INSTALACION;
  // Modo "semana prometida": sabemos explícitamente que este NV todavía no
  // tiene despacho/instalación real (tiene_pendiente_real===false, no solo
  // "no aplica") - se distingue del gris de "ya asignado" del modo real.
  if (item.tiene_pendiente_real === false) return COLOR_PROMESA_INFO;
  return COLOR_ASIGNADO_SIN_PENDIENTE;
}

// Barrita de etapas de producción: Pendiente=rojo, En Proceso=amarillo,
// Finalizado=verde (pedido explícito del usuario).
function colorPorEstadoEtapa(estado) {
  if (estado === 'Finalizado') return '#16a34a';
  if (estado === 'En Proceso') return '#eab308';
  return '#dc2626';
}

// Semana cruzada a mostrar arriba del pin: en modo real, la semana
// prometida; en modo promesa, la semana real (despacho/instalación) - así
// se puede comparar sin cambiar de vista.
function semanaCruzadaLabel(it, modoSemana, weekNumberFromLabel) {
  if (modoSemana === 'promesa') {
    const partes = [];
    if (it.semana_real?.semana_despacho) partes.push(`D S${weekNumberFromLabel(it.semana_real.semana_despacho)}`);
    if (it.semana_real?.semana_instalacion) partes.push(`I S${weekNumberFromLabel(it.semana_real.semana_instalacion)}`);
    return partes.length ? `Real: ${partes.join(' / ')}` : '';
  }
  return it.semana_prometida ? `Prom: S${weekNumberFromLabel(it.semana_prometida)}` : '';
}

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

function nvsEnOrdenSugerido(nvsList, ordenParadas) {
  if (!ordenParadas?.length) return nvsList;
  const ordenPorNv = new Map(ordenParadas.map((p) => [p.nv, p.orden]));
  return [...nvsList].sort((a, b) => {
    const oa = ordenPorNv.has(a) ? ordenPorNv.get(a) : Infinity;
    const ob = ordenPorNv.has(b) ? ordenPorNv.get(b) : Infinity;
    return oa - ob;
  });
}

// Normaliza los items "sin viaje" (una fila por NV, con flags
// despacho_pendiente/instalacion_pendiente) al mismo formato de fila-por-
// tipo que devuelve getSemanaMapa, para poder alimentar UNA sola lógica de
// agrupación/dibujo sea cual sea la fuente activa.
function expandirSinViaje(items) {
  const out = [];
  for (const it of items) {
    const base = { nv: it.nv, lat: it.lat, lng: it.lng, zona: it.zona, nombre: it.nombre, direccion: it.direccion, etapas: it.etapas, semana_prometida: it.semana_prometida };
    if (it.despacho_pendiente) out.push({ ...base, tipo: 'despacho', semana: it.semana_despacho, viaje_id: null });
    if (it.instalacion_pendiente) out.push({ ...base, tipo: 'instalacion', semana: it.semana_instalacion, viaje_id: null });
  }
  return out;
}

// Igual que expandirSinViaje, pero para getSemanaPromesaMapa: además de los
// NV con despacho/instalación pendiente real (accionables, se expanden
// igual), agrega una fila "promesa" para los que todavía NO tienen fecha
// real - si no, expandirSinViaje los descartaría del todo y no aparecerían
// como pin en el mapa.
function expandirPromesa(items) {
  const out = [];
  for (const it of items) {
    const base = { nv: it.nv, lat: it.lat, lng: it.lng, zona: it.zona, nombre: it.nombre, direccion: it.direccion, fecha_prometida: it.fecha_prometida, tiene_pendiente_real: it.tiene_pendiente_real, etapas: it.etapas, semana_real: it.semana_real };
    if (it.despacho_pendiente) out.push({ ...base, tipo: 'despacho', semana: it.semana_despacho, viaje_id: null });
    if (it.instalacion_pendiente) out.push({ ...base, tipo: 'instalacion', semana: it.semana_instalacion, viaje_id: null });
    if (!it.despacho_pendiente && !it.instalacion_pendiente) out.push({ ...base, tipo: 'promesa', semana: null, viaje_id: null });
  }
  return out;
}

export default function LogisticaFechasMapaView({ canEdit, onCreated }) {
  const [semanaFiltro, setSemanaFiltro] = useState(''); // '' = sin filtro (pendientes de cualquier semana)
  // 'real' = fecha_salida_imput/fecha_llegada_imput (lo de siempre); 'promesa'
  // = semana de producción ya reservada por el Presupuestador + margen
  // configurable (ver LogisticaPromesaConfigModal) - requiere semana elegida.
  const [modoSemana, setModoSemana] = useState('real');
  const [showPromesaConfig, setShowPromesaConfig] = useState(false);
  const [rawItems, setRawItems] = useState([]); // fila por (nv,tipo)
  const [viajesSemana, setViajesSemana] = useState([]); // solo con filtro activo
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

  const [showZonas, setShowZonas] = useState(false);
  const [showIaConfig, setShowIaConfig] = useState(false);
  const [mensajeViaje, setMensajeViaje] = useState(null); // { viajeId, titulo } | null

  const [rutaOrdenParadas, setRutaOrdenParadas] = useState(null); // ruta sugerida por la IA (preview, antes de crear)
  const [rutaActivaKey, setRutaActivaKey] = useState(null);
  const limpiarRutaSugerida = () => { setRutaOrdenParadas(null); setRutaActivaKey(null); };

  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markersLayerRef = useRef(null);
  const rutaSugeridaLayerRef = useRef(null);
  const rutasViajesLayerRef = useRef(null);
  const infoExtraLayerRef = useRef(null); // etiqueta de semana cruzada + barrita de etapas
  const markersByNvRef = useRef(new Map());

  const reloadConfig = () => {
    fetchLogisticaViajesConfig().then((c) => setConfig(c?.config || null)).catch(() => {});
  };

  const load = useCallback(async () => {
    setErr('');
    if (modoSemana === 'promesa' && !semanaFiltro) { setRawItems([]); setViajesSemana([]); return; }
    setLoading(true);
    try {
      const [configRes, dataRes] = await Promise.all([
        fetchLogisticaViajesConfig(),
        modoSemana === 'promesa'
          ? fetchLogisticaSemanaPromesaMapa(semanaFiltro)
          : (semanaFiltro ? fetchLogisticaSemanaMapa(semanaFiltro) : fetchLogisticaPortonesSinViaje()),
      ]);
      setConfig(configRes?.config || null);
      if (modoSemana === 'promesa') {
        setRawItems(expandirPromesa(Array.isArray(dataRes?.items) ? dataRes.items : []));
        setViajesSemana([]);
      } else if (semanaFiltro) {
        // getSemanaMapa no devuelve `semana` por item (es implícito: son
        // todos de la semana que pedimos) - se la taggeamos acá para que
        // agruparPorSemana/itemsByNv puedan armar el viaje.
        const itemsConSemana = (dataRes?.detalle?.items || []).map((it) => ({ ...it, semana: semanaFiltro }));
        setRawItems(itemsConSemana);
        setViajesSemana(dataRes?.detalle?.viajes || []);
      } else {
        setRawItems(expandirSinViaje(Array.isArray(dataRes?.items) ? dataRes.items : []));
        setViajesSemana([]);
      }
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, [semanaFiltro, modoSemana]);

  useEffect(() => {
    setSelected(new Set());
    setRecomendacion(null);
    setConfirmando(false);
    setResultado(null);
    setVista('seleccion');
    setPlanes(null);
    limpiarRutaSugerida();
    load();
  }, [load]);

  // Al pasar a "semana prometida" sin ninguna semana elegida todavía, arranca
  // en la actual (no tiene sentido un "sin filtro" ahí - podrían ser cientos
  // de semanas futuras).
  useEffect(() => {
    if (modoSemana === 'promesa' && !semanaFiltro) setSemanaFiltro(isoWeekLabelFromDate(todayISO10()));
  }, [modoSemana, semanaFiltro]);

  // Resumen por NV (une despacho/instalación) - mismo shape que ya usaba
  // LogisticaIaMapaModal, así toda la lógica de selección/agrupación/creación
  // se reutiliza tal cual sea cual sea la fuente de datos activa.
  const itemsByNv = useMemo(() => {
    const map = new Map();
    for (const it of rawItems) {
      if (!map.has(it.nv)) {
        map.set(it.nv, {
          nv: it.nv, lat: it.lat, lng: it.lng, zona: it.zona, nombre: it.nombre, direccion: it.direccion,
          despacho_pendiente: false, instalacion_pendiente: false, semana_despacho: null, semana_instalacion: null,
          fecha_prometida: it.fecha_prometida ?? null, tiene_pendiente_real: it.tiene_pendiente_real ?? null,
          etapas: it.etapas ?? null, semana_prometida: it.semana_prometida ?? null, semana_real: it.semana_real ?? null,
        });
      }
      const acc = map.get(it.nv);
      if (it.tipo === 'despacho' && it.viaje_id == null) { acc.despacho_pendiente = true; acc.semana_despacho = it.semana; }
      if (it.tipo === 'instalacion' && it.viaje_id == null) { acc.instalacion_pendiente = true; acc.semana_instalacion = it.semana; }
    }
    return map;
  }, [rawItems]);

  const items = useMemo(() => Array.from(itemsByNv.values()), [itemsByNv]);
  const conUbicacion = useMemo(() => items.filter((i) => i.lat != null && i.lng != null), [items]);
  const sinUbicacion = items.length - conUbicacion.length;

  // Viajes de la semana filtrada, con su lista de NV únicos en orden real
  // (dedup despacho/instalación del mismo NV) para dibujar la ruta.
  const rutasPorViaje = useMemo(() => {
    if (!semanaFiltro) return [];
    const porViaje = new Map();
    for (const it of rawItems) {
      if (it.viaje_id == null) continue;
      if (!porViaje.has(it.viaje_id)) porViaje.set(it.viaje_id, []);
      porViaje.get(it.viaje_id).push(it);
    }
    return Array.from(porViaje.entries()).map(([viajeId, rows]) => {
      const viaje = viajesSemana.find((v) => v.id === viajeId) || {};
      const ordenados = [...rows].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
      const seen = new Set();
      const nvsEnOrden = [];
      for (const r of ordenados) { if (seen.has(r.nv)) continue; seen.add(r.nv); nvsEnOrden.push(r.nv); }
      return { viajeId, viaje, nvsEnOrden, color: colorPorVehiculo(viaje.vehiculo_id, config?.vehiculos) };
    });
  }, [rawItems, viajesSemana, semanaFiltro, config]);

  // Init del mapa (una sola vez)
  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return;
    const map = L.map(mapElRef.current).setView(ARGENTINA_CENTER, ARGENTINA_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    markersLayerRef.current = L.layerGroup().addTo(map);
    infoExtraLayerRef.current = L.layerGroup().addTo(map);
    rutasViajesLayerRef.current = L.layerGroup().addTo(map);
    rutaSugeridaLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
      infoExtraLayerRef.current = null;
      rutasViajesLayerRef.current = null;
      rutaSugeridaLayerRef.current = null;
      markersByNvRef.current = new Map();
    };
  }, []);

  // Pines
  useEffect(() => {
    const map = mapRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    markersByNvRef.current = new Map();

    conUbicacion.forEach((it) => {
      const seleccionable = canEdit && (it.despacho_pendiente || it.instalacion_pendiente);
      const marker = L.circleMarker([it.lat, it.lng], {
        radius: 10, color: '#fff', weight: 2, fillColor: colorDe(it), fillOpacity: 0.9,
        // interactive siempre true (así se puede ver el tooltip al pasar el
        // mouse aunque ya esté asignado - "consultar" es un caso de uso
        // explícito), el click a seleccionar se ata aparte solo si aplica.
      });
      const estadoExtra = it.despacho_pendiente ? ' · despacho pendiente'
        : it.instalacion_pendiente ? ' · instalación pendiente'
        : it.tiene_pendiente_real === false ? ' · prometido, sin fecha real todavía'
        : ' · ya asignado';
      marker.bindTooltip(`NV ${it.nv} — ${it.nombre || 'sin nombre'}${estadoExtra}`, { direction: 'top' });
      if (seleccionable) {
        marker.on('click', () => {
          setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(it.nv)) next.delete(it.nv); else next.add(it.nv);
            return next;
          });
        });
      }
      marker.addTo(layer);
      markersByNvRef.current.set(it.nv, marker);
    });

    if (conUbicacion.length > 0) {
      const bounds = L.latLngBounds(conUbicacion.map((it) => [it.lat, it.lng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    }
  }, [conUbicacion, canEdit]);

  // Etiqueta de semana cruzada (arriba del pin) + barrita de etapas de
  // producción (al lado, de abajo hacia arriba: diseño -> pintura sistema ->
  // armado final, roja/amarilla/verde según Pendiente/En Proceso/Finalizado).
  useEffect(() => {
    const map = mapRef.current;
    const layer = infoExtraLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    conUbicacion.forEach((it) => {
      const label = semanaCruzadaLabel(it, modoSemana, weekNumberFromLabel);
      if (label) {
        const labelIcon = L.divIcon({
          className: '',
          html: `<div style="background:#fff;color:#111;border:1px solid #999;border-radius:4px;padding:1px 4px;font-size:9px;font-weight:800;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,.35);">${label}</div>`,
          iconSize: [1, 1], iconAnchor: [-4, 20],
        });
        L.marker([it.lat, it.lng], { icon: labelIcon, interactive: false, zIndexOffset: 800 }).addTo(layer);
      }

      if (it.etapas) {
        const segs = [
          colorPorEstadoEtapa(it.etapas.armado_final), // arriba
          colorPorEstadoEtapa(it.etapas.pintura),       // medio
          colorPorEstadoEtapa(it.etapas.diseno),        // abajo (empieza acá)
        ];
        const barIcon = L.divIcon({
          className: '',
          html: `<div style="display:flex;flex-direction:column;gap:1px;">${segs.map((c) => `<div style="width:6px;height:6px;background:${c};border:1px solid rgba(0,0,0,.25);"></div>`).join('')}</div>`,
          // Anchor a la DERECHA del ícono (valor positivo) para que el
          // dibujo quede a la IZQUIERDA del pin - así no se pisa con la
          // etiqueta de semana cruzada, que va arriba/derecha.
          iconSize: [6, 20], iconAnchor: [18, 10],
        });
        const marker = L.marker([it.lat, it.lng], { icon: barIcon, interactive: false, zIndexOffset: 700 });
        marker.bindTooltip(`Diseño: ${it.etapas.diseno}<br>Pintura sistema: ${it.etapas.pintura}<br>Armado final: ${it.etapas.armado_final}`, { direction: 'left' });
        marker.addTo(layer);
      }
    });
  }, [conUbicacion, modoSemana]);

  // Selección resaltada
  useEffect(() => {
    for (const [nv, marker] of markersByNvRef.current.entries()) {
      const it = itemsByNv.get(nv);
      const isSel = selected.has(nv);
      marker.setStyle({
        fillColor: isSel ? COLOR_SELECCIONADO : colorDe(it),
        radius: isSel ? 13 : 10,
        weight: isSel ? 3 : 2,
      });
    }
  }, [selected, itemsByNv]);

  // Rutas YA guardadas de los viajes de la semana filtrada, coloreadas por
  // vehículo (distinto de la ruta SUGERIDA por la IA, que es solo un preview
  // antes de crear - ver el efecto de abajo).
  useEffect(() => {
    const map = mapRef.current;
    const layer = rutasViajesLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    for (const { nvsEnOrden, color, viaje, viajeId } of rutasPorViaje) {
      const puntos = [];
      nvsEnOrden.forEach((nv, i) => {
        const it = itemsByNv.get(nv);
        if (!it || it.lat == null || it.lng == null) return;
        puntos.push([it.lat, it.lng]);
        const icon = L.divIcon({
          className: '',
          html: `<div style="background:${color};color:#fff;border-radius:999px;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)">${i + 1}</div>`,
          iconSize: [18, 18], iconAnchor: [9, 9],
        });
        const m = L.marker([it.lat, it.lng], { icon, zIndexOffset: 900 });
        m.bindTooltip(`${viaje.nombre?.trim() || `Viaje #${viajeId}`} · parada ${i + 1}`, { direction: 'top' });
        m.addTo(layer);
      });
      if (puntos.length >= 2) {
        L.polyline(puntos, { color, weight: 3, opacity: 0.75 }).addTo(layer);
      }
    }
  }, [rutasPorViaje, itemsByNv]);

  // Ruta SUGERIDA por la IA (preview antes de crear) - línea punteada roja +
  // numerito, se dibuja por encima de todo lo demás.
  useEffect(() => {
    const layer = rutaSugeridaLayerRef.current;
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
        iconSize: [20, 20], iconAnchor: [10, 10],
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
    return rutaOrdenParadas.filter((p) => { const it = itemsByNv.get(p.nv); return !it || it.lat == null || it.lng == null; }).map((p) => p.nv);
  }, [rutaOrdenParadas, itemsByNv]);

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

  const abrirConfirmacion = (nvsList, opts = {}) => {
    const { semana, incluidos, excluidos } = agruparPorSemana(nvsList, itemsByNv);
    if (!semana) { setErr('Ninguno de los portones de esta propuesta tiene semana asignada.'); return; }

    const { start, end } = isoWeekStartEndFromLabel(semana);
    const hoy = todayISO10();
    const fechaDefault = hoy >= start && hoy <= end ? hoy : start;

    const vehiculoSugerido = (config?.vehiculos || []).find(
      (v) => v.activo && opts.vehiculoSugerido && v.nombre.trim().toLowerCase() === String(opts.vehiculoSugerido).trim().toLowerCase()
    );

    const zonaCounts = new Map();
    for (const p of incluidos) if (p.zona_id) zonaCounts.set(p.zona_id, (zonaCounts.get(p.zona_id) || 0) + 1);
    let zonaId = null, zonaMax = 0;
    for (const [zid, c] of zonaCounts) if (c > zonaMax) { zonaMax = c; zonaId = zid; }

    setConfirmForm({
      semana, incluidos, excluidos, fecha: fechaDefault,
      zona_id: zonaId ? String(zonaId) : '',
      cuadrilla_id: '',
      vehiculo_id: vehiculoSugerido ? String(vehiculoSugerido.id) : '',
      nombre: opts.nombreSugerido || `Viaje · Semana ${weekNumberFromLabel(semana)}`,
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
        fecha, zona_id: zona_id ? Number(zona_id) : null,
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
        try { await asignarLogisticaPorton(viaje.id, item.porton_id, p.tipo); asignados += 1; }
        catch { fallidos.push(p); }
      }

      setResultado({ viajeId: viaje.id, semana, asignados, excluidos, fallidos });
      setConfirmando(false);
      setRecomendacion(null);
      setVista('seleccion');
      setPlanes(null);
      setSelected(new Set());
      limpiarRutaSugerida();
      onCreated?.();
      // Los portones recién asignados tienen que desaparecer del pool "sin
      // viaje" (vista sin filtro) o aparecer con su ruta nueva (vista de esa
      // semana) - en ambos casos hace falta recargar.
      load();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setCreando(false);
    }
  };

  const rec = recomendacion?.recomendacion;

  const semanasDisponibles = useMemo(() => {
    const base = buildWeekRange(12, 30);
    const actual = isoWeekLabelFromDate(todayISO10());
    return Array.from(new Set([...base, actual])).sort();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div className="btn" style={{ display: 'inline-flex', padding: 2, gap: 2 }}>
          <button
            type="button" className="btn" onClick={() => setModoSemana('real')}
            style={{ border: 'none', background: modoSemana === 'real' ? 'var(--brand)' : 'transparent', color: modoSemana === 'real' ? '#fff' : undefined }}
          >
            Fecha real
          </button>
          <button
            type="button" className="btn" onClick={() => setModoSemana('promesa')}
            style={{ border: 'none', background: modoSemana === 'promesa' ? 'var(--brand)' : 'transparent', color: modoSemana === 'promesa' ? '#fff' : undefined }}
          >
            Fecha prometida
          </button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
          Semana
          <select className="pp-select" value={semanaFiltro} onChange={(e) => setSemanaFiltro(e.target.value)}>
            {modoSemana === 'real' ? <option value="">— Pendientes de asignar (todas) —</option> : null}
            {semanasDisponibles.map((wk) => (
              <option key={wk} value={wk}>Semana {weekNumberFromLabel(wk)} — {weekTitleFromSelection(wk).replace(/^Semana \d+ /, '')}</option>
            ))}
          </select>
        </label>
        <div style={{ fontSize: 11, opacity: 0.7 }}>
          {loading ? 'Cargando…' : modoSemana === 'promesa'
            ? `${conUbicacion.length} de ${items.length} portones prometidos para esta semana con ubicación${sinUbicacion ? ` (+${sinUbicacion} sin ubicación)` : ''} · ${selected.size} seleccionado${selected.size === 1 ? '' : 's'}`
            : semanaFiltro
              ? `${conUbicacion.length} de ${items.length} portones de la semana con ubicación${sinUbicacion ? ` (+${sinUbicacion} sin ubicación)` : ''} · ${rutasPorViaje.length} viaje${rutasPorViaje.length === 1 ? '' : 's'} · ${selected.size} seleccionado${selected.size === 1 ? '' : 's'}`
              : `${conUbicacion.length} portones sin viaje con ubicación${sinUbicacion ? ` (+${sinUbicacion} sin ubicación resuelta)` : ''} · ${selected.size} seleccionado${selected.size === 1 ? '' : 's'}`}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, fontSize: 11, alignItems: 'center', flexWrap: 'wrap' }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: COLOR_DESPACHO, marginRight: 3 }} />despacho</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: COLOR_INSTALACION, marginRight: 3 }} />instalación</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: COLOR_AMBOS, marginRight: 3 }} />ambos</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: COLOR_SELECCIONADO, marginRight: 3 }} />seleccionado</span>
          {modoSemana === 'promesa'
            ? <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: COLOR_PROMESA_INFO, marginRight: 3 }} />prometido, sin fecha real</span>
            : semanaFiltro ? <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: COLOR_ASIGNADO_SIN_PENDIENTE, marginRight: 3 }} />ya asignado</span> : null}
        </div>
        {canEdit ? <button className="btn" onClick={() => setShowZonas(true)}>Zonas</button> : null}
        {canEdit ? <button className="btn" onClick={() => setShowIaConfig(true)}>🤖 Config IA</button> : null}
        {canEdit ? <button className="btn" onClick={() => setShowPromesaConfig(true)}>📅 Config promesa</button> : null}
      </div>

      {semanaFiltro && rutasPorViaje.length > 0 ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, alignItems: 'center' }}>
          <span style={{ fontWeight: 700, opacity: 0.75 }}>Viajes de esta semana:</span>
          {rutasPorViaje.map(({ viajeId, viaje, color }) => (
            <span key={viajeId} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'inline-block', width: 10, height: 3, background: color, verticalAlign: 2 }} />
              {viaje.nombre?.trim() || `Viaje #${viajeId}`} ({viaje.vehiculo_nombre || 'sin vehículo'})
              <button
                className="btn" style={{ fontSize: 10, padding: '1px 6px' }}
                onClick={() => setMensajeViaje({ viajeId, titulo: viaje.nombre?.trim() || `Viaje #${viajeId}` })}
              >
                📋 Mensaje
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {err ? <div style={{ color: 'crimson', fontWeight: 800, fontSize: 12 }}>{err}</div> : null}

      <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', gap: 10 }}>
        <div style={{ flex: '1 1 auto', minWidth: 0, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', position: 'relative' }}>
          <div ref={mapElRef} style={{ width: '100%', height: '100%' }} />
          {rutaOrdenParadas?.length > 0 ? (
            <div style={{ position: 'absolute', bottom: 10, left: 10, zIndex: 1000, background: 'var(--surface)', border: '1px solid var(--border)', padding: '6px 10px', borderRadius: 8, fontSize: 11, boxShadow: '0 1px 4px rgba(0,0,0,.25)', maxWidth: 280 }}>
              🔴 Línea punteada = orden sugerido por la IA (todavía no creado). Distancia en línea recta, no la ruta real por calle.
              {rutaSinUbicacionNvs.length > 0 ? (
                <div style={{ marginTop: 4, color: '#92400e' }}>NV {rutaSinUbicacionNvs.join(', ')} sin ubicación resuelta, no aparece{rutaSinUbicacionNvs.length === 1 ? '' : 'n'} en la línea.</div>
              ) : null}
            </div>
          ) : null}
        </div>

        {canEdit ? (
          <div style={{ width: 340, flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
            {resultado ? (
              <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--surface-muted, #f9fafb)' }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>✅ Viaje creado</div>
                <div style={{ fontSize: 12, marginBottom: 6 }}>
                  Semana {weekNumberFromLabel(resultado.semana)} · {resultado.asignados} portón{resultado.asignados === 1 ? '' : 'es'} asignado{resultado.asignados === 1 ? '' : 's'}.
                </div>
                {resultado.excluidos.length > 0 ? (
                  <div style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: 8, marginBottom: 6 }}>
                    {resultado.excluidos.length} quedaron afuera por estar en otra semana: NV {resultado.excluidos.map((p) => p.nv).join(', ')}.
                  </div>
                ) : null}
                {resultado.fallidos.length > 0 ? (
                  <div style={{ fontSize: 11, color: '#991b1b', marginBottom: 6 }}>{resultado.fallidos.length} no se pudieron asignar.</div>
                ) : null}
                <button className="btn btn--brand" onClick={() => setResultado(null)}>Listo</button>
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
                  <button className="btn" onClick={() => { setRecomendacion(null); limpiarRutaSugerida(); }}>Descartar</button>
                  <button className="btn btn--brand" onClick={() => abrirConfirmacion(nvsEnOrdenSugerido(Array.from(selected), rec.orden_paradas), { vehiculoSugerido: rec.vehiculo_sugerido })}>
                    Crear viaje con esta recomendación
                  </button>
                </div>
              </div>
            ) : vista === 'planes' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => { setVista('seleccion'); limpiarRutaSugerida(); }}>← Volver a selección manual</button>

                {planes?.sin_zona?.cantidad > 0 ? (
                  <div style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: 8 }}>
                    {planes.sin_zona.cantidad} portón{planes.sin_zona.cantidad === 1 ? '' : 'es'} con ubicación pero sin zona clasificada: NV {planes.sin_zona.nvs.join(', ')}.
                  </div>
                ) : null}
                {planes?.sin_ubicacion > 0 ? (
                  <div style={{ fontSize: 11, opacity: 0.7 }}>{planes.sin_ubicacion} portones sin ubicación resuelta, no evaluados.</div>
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
                                <div style={{ fontSize: 10, color: '#92400e', marginTop: 4 }}>{viaje.alertas.map((a, j) => <div key={j}>⚠️ {a}</div>)}</div>
                              ) : null}
                              <details style={{ fontSize: 10, opacity: 0.8, marginTop: 4 }}>
                                <summary style={{ cursor: 'pointer' }}>Ver detalle</summary>
                                <div style={{ marginTop: 4 }}>NV: {viaje.nvs.join(', ')}</div>
                                <div style={{ marginTop: 4 }}>{viaje.razonamiento}</div>
                              </details>
                              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                <button
                                  className="btn" style={{ fontSize: 11, padding: '3px 9px', ...(rutaActiva ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)' } : {}) }}
                                  onClick={() => { if (rutaActiva) { limpiarRutaSugerida(); } else { setRutaOrdenParadas(viaje.orden_paradas); setRutaActivaKey(key); } }}
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
                  {modoSemana === 'promesa'
                    ? 'Hacé click en los pines de colores para seleccionarlos. Los pines celestes todavía no tienen fecha real imputada en /a (solo consulta, para planificar con anticipación).'
                    : 'Hacé click en los pines pendientes para seleccionarlos. Los pines grises ya están en un viaje (solo consulta).'}
                </div>

                {selected.size > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                    {Array.from(selected).map((nv) => (
                      <span key={nv} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, background: 'var(--surface-muted, #f3f4f6)', border: '1px solid var(--border)' }}>NV {nv}</span>
                    ))}
                  </div>
                ) : null}

                <button className="btn btn--brand" style={{ width: '100%', marginBottom: 8 }} disabled={selected.size === 0} onClick={() => abrirConfirmacion(Array.from(selected))}>
                  Crear viaje con esta selección ({selected.size})
                </button>
                <div style={{ fontSize: 10, opacity: 0.6, marginTop: -4, marginBottom: 12 }}>
                  Armalo vos: elegís fecha, zona, cuadrilla y vehículo a mano en el paso siguiente.
                </div>

                <button className="btn" style={{ width: '100%', marginBottom: 4 }} disabled={selected.size === 0 || recomendando} onClick={generarRecomendacion}>
                  {recomendando ? 'Pensando…' : `🤖 Que la IA recomiende (${selected.size})`}
                </button>
                <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 12 }}>
                  Te sugiere orden de paradas, semana y vehículo antes de crear — revisás y confirmás igual.
                </div>

                <button className="btn" style={{ width: '100%' }} disabled={planificando} onClick={planificarTodo}>
                  {planificando ? 'Planificando (puede tardar unos minutos)…' : '🗺️ Planificar todas las zonas automáticamente'}
                </button>
                <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>
                  Mira TODOS los portones pendientes (cualquier semana), no solo lo que estás filtrando acá.
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <LogisticaZonasModal open={showZonas} config={config} onClose={() => setShowZonas(false)} onChanged={reloadConfig} />
      <LogisticaIaConfigModal open={showIaConfig} onClose={() => setShowIaConfig(false)} />
      <LogisticaPromesaConfigModal open={showPromesaConfig} onClose={() => setShowPromesaConfig(false)} onChanged={load} />
      <LogisticaMensajeViajeModal open={!!mensajeViaje} viajeId={mensajeViaje?.viajeId} titulo={mensajeViaje?.titulo} onClose={() => setMensajeViaje(null)} />
    </div>
  );
}

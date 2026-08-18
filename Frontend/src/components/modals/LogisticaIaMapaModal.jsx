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

export default function LogisticaIaMapaModal({ open, onClose, onCreated }) {
  const [items, setItems] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [selected, setSelected] = useState(() => new Set());

  const [recomendando, setRecomendando] = useState(false);
  const [recomendacion, setRecomendacion] = useState(null);

  const [confirmando, setConfirmando] = useState(false);
  const [confirmForm, setConfirmForm] = useState(null);
  const [creando, setCreando] = useState(false);
  const [resultado, setResultado] = useState(null); // { asignados, excluidos } | null

  const [showZonas, setShowZonas] = useState(false);
  const [showIaConfig, setShowIaConfig] = useState(false);

  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markersLayerRef = useRef(null);
  const markersByNvRef = useRef(new Map());

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
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
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

  if (!open) return null;

  const generarRecomendacion = async () => {
    setRecomendando(true);
    setErr('');
    try {
      const data = await recomendarLogisticaViajeIa(Array.from(selected));
      setRecomendacion(data);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setRecomendando(false);
    }
  };

  const abrirConfirmacion = () => {
    const { semana, incluidos, excluidos } = agruparPorSemana(Array.from(selected), itemsByNv);
    if (!semana) { setErr('Ninguno de los portones seleccionados tiene semana asignada.'); return; }

    const { start, end } = isoWeekStartEndFromLabel(semana);
    const hoy = todayISO10();
    const fechaDefault = hoy >= start && hoy <= end ? hoy : start;

    const vehiculoSugerido = (config?.vehiculos || []).find(
      (v) => v.activo && recomendacion?.recomendacion?.vehiculo_sugerido &&
        v.nombre.trim().toLowerCase() === String(recomendacion.recomendacion.vehiculo_sugerido).trim().toLowerCase()
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
      nombre: `Viaje IA · Semana ${weekNumberFromLabel(semana)}`,
    });
    setConfirmando(true);
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

                <div style={{ fontSize: 12, fontWeight: 800, marginTop: 4 }}>Orden de paradas</div>
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
                  <button className="btn" onClick={() => setRecomendacion(null)}>Descartar</button>
                  <button className="btn btn--brand" onClick={abrirConfirmacion}>Crear viaje con esta recomendación</button>
                </div>
              </div>
            ) : (
              <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
                  Hacé click en los pines del mapa para seleccionar los portones que querés incluir en un viaje nuevo.
                  Cuando termines, pedile a la IA que te recomiende semana, orden y vehículo.
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

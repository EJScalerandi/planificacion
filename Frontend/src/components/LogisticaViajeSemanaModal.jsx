// src/components/LogisticaViajeSemanaModal.jsx
//
// Detalle de una semana: a la izquierda los portones sin asignar (despacho +
// instalación), a la derecha una columna por viaje creado. Arrastrás los
// chips de la izquierda a un viaje (o entre viajes, o de vuelta al pool).
// Mismo espíritu que la ventana de "Asociación de comprobantes" que mostró el
// usuario como referencia, pero con columnas dinámicas (una por viaje) en vez
// de una sola lista de destino.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchLogisticaViajesConfig,
  fetchLogisticaSemanaDetalle,
  crearLogisticaViaje,
  patchLogisticaViaje,
  borrarLogisticaViaje,
  asignarLogisticaPorton,
  desasignarLogisticaPorton,
  cerrarLogisticaSemana,
  reabrirLogisticaSemana,
} from '../api';
import { isoWeekStartEndFromLabel, weekTitleFromSelection, todayISO10 } from '../utils/isoWeek';
import LogisticaZonasModal from './modals/LogisticaZonasModal';
import LogisticaVehiculosModal from './modals/LogisticaVehiculosModal';
import LogisticaCuadrillasModal from './modals/LogisticaCuadrillasModal';
import LogisticaReglasCapacidadModal from './modals/LogisticaReglasCapacidadModal';
import LogisticaReglasEnvioModal from './modals/LogisticaReglasEnvioModal';
import LogisticaIaConfigModal from './modals/LogisticaIaConfigModal';
import PortonesMapaModal from './modals/PortonesMapaModal';

// NV únicos (despacho e instalación del mismo NV son el mismo domicilio).
function uniqueNvs(items) {
  return Array.from(new Set((items || []).map((it) => Number(it.nv)).filter(Number.isInteger)));
}

const DND_MIME = 'application/x-logistica-porton';

function medidasLabel(item) {
  const alto = Number(item.alto);
  const ancho = Number(item.ancho);
  if (!Number.isFinite(alto) || !Number.isFinite(ancho)) return '';
  return `${item.alto}x${item.ancho}`;
}

function TipoBadge({ tipo }) {
  const isDespacho = tipo === 'despacho';
  return (
    <span
      style={{
        fontSize: 10, fontWeight: 900, padding: '2px 7px', borderRadius: 999,
        background: isDespacho ? 'var(--brand-100)' : '#eef2ff',
        color: isDespacho ? 'var(--brand-700)' : '#3730a3',
        border: `1px solid ${isDespacho ? 'var(--brand)' : '#818cf8'}`,
        whiteSpace: 'nowrap',
      }}
    >
      {isDespacho ? 'Despacho' : 'Instalación'}
    </span>
  );
}

function PortonChip({ item, draggable, onDragStart, onDragEnd }) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '8px 10px',
        background: 'var(--surface)',
        cursor: draggable ? 'grab' : 'default',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
      title={item.direccion || ''}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontWeight: 900, fontSize: 13 }}>NV {item.nv}</span>
        <TipoBadge tipo={item.tipo} />
      </div>
      <div style={{ fontSize: 12, opacity: 0.85 }}>{item.nombre?.trim() || item.sistema || '—'}</div>
      <div style={{ fontSize: 11, opacity: 0.7, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {item.direccion?.trim() ? <span>{item.direccion.trim()}</span> : null}
        {medidasLabel(item) ? <span>{medidasLabel(item)}</span> : null}
        {item.peso > 1 ? <span style={{ fontWeight: 800 }}>pesa {item.peso}</span> : null}
      </div>
    </div>
  );
}

function NuevoViajeForm({ semana, config, onCreate, onCancel, busy, initial, submitLabel }) {
  const { start, end } = isoWeekStartEndFromLabel(semana);
  const today = todayISO10();
  const [fecha, setFecha] = useState(() => {
    const initFecha = initial?.fecha ? String(initial.fecha).slice(0, 10) : '';
    if (initFecha) return initFecha;
    return today >= start && today <= end ? today : start;
  });
  const [zonaId, setZonaId] = useState(() => (initial?.zona_id != null ? String(initial.zona_id) : ''));
  const [cuadrillaId, setCuadrillaId] = useState(() => (initial?.cuadrilla_id != null ? String(initial.cuadrilla_id) : ''));
  const [vehiculoId, setVehiculoId] = useState(() => (initial?.vehiculo_id != null ? String(initial.vehiculo_id) : ''));
  const [nombre, setNombre] = useState(() => initial?.nombre || '');

  const zonasActivas = (config?.zonas || []).filter((z) => z.activo !== false);
  const cuadrillasActivas = (config?.cuadrillas || []).filter((c) => c.activo !== false);
  const vehiculosActivos = (config?.vehiculos || []).filter((v) => v.activo !== false);

  return (
    <div
      style={{
        border: '1px dashed var(--brand)', borderRadius: 12, padding: 12,
        background: 'var(--brand-100)', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end',
      }}
    >
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
        Fecha
        <input type="date" className="pp-input" min={start} max={end} value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
        Zona
        <select className="pp-select" value={zonaId} onChange={(e) => setZonaId(e.target.value)}>
          <option value="">(sin zona)</option>
          {zonasActivas.map((z) => <option key={z.id} value={z.id}>{z.nombre}</option>)}
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
        Cuadrilla
        <select className="pp-select" value={cuadrillaId} onChange={(e) => setCuadrillaId(e.target.value)}>
          <option value="">(sin cuadrilla)</option>
          {cuadrillasActivas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
        Vehículo
        <select className="pp-select" value={vehiculoId} onChange={(e) => setVehiculoId(e.target.value)}>
          <option value="">(sin vehículo)</option>
          {vehiculosActivos.map((v) => <option key={v.id} value={v.id}>{v.nombre} (cap. {v.capacidad_portones})</option>)}
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
        Nombre (opcional)
        <input className="pp-input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Viaje 1" />
      </label>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="btn btn--brand"
          disabled={busy || !fecha}
          onClick={() =>
            onCreate({
              fecha,
              zona_id: zonaId ? Number(zonaId) : null,
              cuadrilla_id: cuadrillaId ? Number(cuadrillaId) : null,
              vehiculo_id: vehiculoId ? Number(vehiculoId) : null,
              nombre: nombre.trim() || null,
            })
          }
        >
          {submitLabel || 'Crear viaje'}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

function ViajeColumn({ viaje, items, canEdit, cerrada, onDropItem, onEditar, onBorrar, onDragStartChip, onDragEndChip, onVerMapa }) {
  const [over, setOver] = useState(false);
  const capacidad = Number(viaje.vehiculo_capacidad || 0);
  const usado = Number(viaje.peso_despacho_usado || 0);

  return (
    <div
      onDragOver={(e) => { if (!canEdit || cerrada) return; e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!canEdit || cerrada) return;
        e.preventDefault();
        setOver(false);
        onDropItem(viaje.id, e);
      }}
      style={{
        minWidth: 260, maxWidth: 260, display: 'flex', flexDirection: 'column', gap: 8,
        border: `1px solid ${over ? 'var(--brand)' : 'var(--border)'}`,
        borderRadius: 12, padding: 10,
        background: over ? 'var(--brand-100)' : 'var(--surface)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 13 }}>{viaje.nombre?.trim() || `Viaje #${viaje.id}`}</div>
          <div style={{ fontSize: 11, opacity: 0.75 }}>{String(viaje.fecha).slice(0, 10).split('-').reverse().join('/')}</div>
          <button
            type="button"
            className="btn"
            style={{ padding: '1px 6px', fontSize: 10, marginTop: 4 }}
            disabled={items.length === 0}
            onClick={() => onVerMapa(viaje, items)}
          >
            🗺️ Mapa
          </button>
        </div>
        {canEdit && !cerrada ? (
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="button" className="btn" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => onEditar(viaje)}>Editar</button>
            <button
              type="button"
              className="btn"
              style={{ padding: '2px 8px', fontSize: 11, borderColor: '#ef4444', color: '#991b1b' }}
              onClick={() => onBorrar(viaje)}
            >
              Borrar
            </button>
          </div>
        ) : null}
      </div>

      <div style={{ fontSize: 11, opacity: 0.8 }}>
        {viaje.zona_nombre || '(sin zona)'} · {viaje.cuadrilla_nombre || '(sin cuadrilla)'}
      </div>
      <div style={{ fontSize: 11, opacity: 0.8 }}>
        {viaje.vehiculo_nombre ? (
          <span style={{ fontWeight: usado > capacidad ? 900 : 400, color: usado > capacidad ? '#b91c1c' : undefined }}>
            {viaje.vehiculo_nombre}: {usado}/{capacidad} despacho
          </span>
        ) : (
          <span style={{ color: '#b91c1c' }}>Sin vehículo (no puede sumar despacho)</span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 60 }}>
        {items.length === 0 ? (
          <div style={{ fontSize: 11, opacity: 0.5, padding: 8, textAlign: 'center' }}>Arrastrá portones acá</div>
        ) : (
          items.map((it) => (
            <PortonChip
              key={`${it.porton_id}-${it.tipo}`}
              item={it}
              draggable={canEdit && !cerrada}
              onDragStart={(e) => onDragStartChip(e, it)}
              onDragEnd={onDragEndChip}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default function LogisticaViajeSemanaModal({ semana, open, canEdit, onClose, onChanged }) {
  const [detalle, setDetalle] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const [showNuevoViaje, setShowNuevoViaje] = useState(false);
  const [editandoViaje, setEditandoViaje] = useState(null);
  const [showZonas, setShowZonas] = useState(false);
  const [showVehiculos, setShowVehiculos] = useState(false);
  const [showCuadrillas, setShowCuadrillas] = useState(false);
  const [showReglas, setShowReglas] = useState(false);
  const [showReglasEnvio, setShowReglasEnvio] = useState(false);
  const [showIaConfig, setShowIaConfig] = useState(false);
  const [mapa, setMapa] = useState(null); // { nvs, titulo } | null

  const load = useCallback(async () => {
    if (!semana) return;
    setErr('');
    setLoading(true);
    try {
      const [d, c] = await Promise.all([fetchLogisticaSemanaDetalle(semana), fetchLogisticaViajesConfig()]);
      setDetalle(d?.detalle || null);
      setConfig(c?.config || null);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, [semana]);

  useEffect(() => {
    if (open && semana) load();
    if (!open) {
      setShowNuevoViaje(false);
      setEditandoViaje(null);
      setDetalle(null);
      setErr('');
    }
  }, [open, semana, load]);

  // Recarga liviana solo del detalle (no del config), para no perder el
  // scroll/estado de los sub-modales de config innecesariamente.
  const reloadDetalle = useCallback(async () => {
    if (!semana) return;
    const d = await fetchLogisticaSemanaDetalle(semana);
    setDetalle(d?.detalle || null);
  }, [semana]);

  // Refresca config (zonas/vehículos/cuadrillas/reglas) sin tocar el detalle.
  const reloadConfig = useCallback(async () => {
    const c = await fetchLogisticaViajesConfig();
    setConfig(c?.config || null);
  }, []);

  const pool = useMemo(() => (detalle?.items || []).filter((it) => it.viaje_id == null), [detalle]);
  const itemsPorViaje = useMemo(() => {
    const map = new Map();
    for (const it of detalle?.items || []) {
      if (it.viaje_id == null) continue;
      if (!map.has(it.viaje_id)) map.set(it.viaje_id, []);
      map.get(it.viaje_id).push(it);
    }
    return map;
  }, [detalle]);

  const cerrada = !!detalle?.cerrada;
  const counts = detalle?.counts || { despacho_total: 0, despacho_asignados: 0, instalacion_total: 0, instalacion_asignados: 0 };
  const faltan = (counts.despacho_total - counts.despacho_asignados) + (counts.instalacion_total - counts.instalacion_asignados);
  const puedeCerrar = canEdit && !cerrada && faltan === 0 && (counts.despacho_total + counts.instalacion_total) > 0;

  // Devuelve true/false según éxito, para que los que cierran un form al
  // terminar (crear/editar viaje) no lo cierren si la mutación falló (el
  // usuario perdería lo que tenía cargado).
  const runMutation = useCallback(async (fn) => {
    setBusy(true);
    setErr('');
    try {
      const res = await fn();
      if (res?.detalle) setDetalle(res.detalle);
      onChanged?.();
      return true;
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }, [onChanged]);

  const onDragStartChip = (e, item) => {
    e.dataTransfer.setData(DND_MIME, JSON.stringify({ porton_id: item.porton_id, tipo: item.tipo, viaje_id: item.viaje_id ?? null }));
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragEndChip = () => {};

  const handleDrop = useCallback((targetViajeId, e) => {
    const raw = e.dataTransfer.getData(DND_MIME);
    if (!raw) return;
    let payload;
    try { payload = JSON.parse(raw); } catch { return; }
    if (!payload?.porton_id || !payload?.tipo) return;
    if (payload.viaje_id === targetViajeId) return; // soltó en la misma columna

    runMutation(() => asignarLogisticaPorton(targetViajeId, payload.porton_id, payload.tipo));
  }, [runMutation]);

  const [poolOver, setPoolOver] = useState(false);
  const handleDropToPool = useCallback((e) => {
    const raw = e.dataTransfer.getData(DND_MIME);
    if (!raw) return;
    let payload;
    try { payload = JSON.parse(raw); } catch { return; }
    if (!payload?.porton_id || !payload?.tipo || payload.viaje_id == null) return;

    runMutation(() => desasignarLogisticaPorton(payload.viaje_id, payload.porton_id, payload.tipo));
  }, [runMutation]);

  const crearViaje = (payload) => {
    runMutation(() => crearLogisticaViaje(semana, payload)).then((ok) => { if (ok) setShowNuevoViaje(false); });
  };

  const guardarEdicionViaje = (payload) => {
    runMutation(() => patchLogisticaViaje(editandoViaje.id, payload)).then((ok) => { if (ok) setEditandoViaje(null); });
  };

  const borrarViaje = (viaje) => {
    if (!window.confirm(`¿Borrar "${viaje.nombre?.trim() || `Viaje #${viaje.id}`}"? Sus portones vuelven a "sin asignar".`)) return;
    runMutation(() => borrarLogisticaViaje(viaje.id));
  };

  const onCerrarSemana = () => {
    if (!window.confirm(`¿Cerrar la semana ${weekTitleFromSelection(semana)}? El tablero de viajes queda de solo lectura (se puede reabrir después).`)) return;
    runMutation(() => cerrarLogisticaSemana(semana));
  };

  const onReabrirSemana = () => {
    runMutation(() => reabrirLogisticaSemana(semana));
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        style={{
          width: 'min(1500px, 100%)', height: 'min(920px, 96vh)', background: 'var(--surface)',
          borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
          padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>
            {semana ? weekTitleFromSelection(semana) : ''} {cerrada ? <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: 'var(--brand)', color: '#fff' }}>Cerrada</span> : null}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn"
              disabled={!detalle || uniqueNvs(detalle.items).length === 0}
              onClick={() => setMapa({ nvs: uniqueNvs(detalle.items), titulo: `Mapa · ${weekTitleFromSelection(semana)}` })}
            >
              🗺️ Ver mapa de la semana
            </button>
            {canEdit ? (
              <>
                <button className="btn" onClick={() => setShowZonas(true)}>Zonas</button>
                <button className="btn" onClick={() => setShowVehiculos(true)}>Vehículos</button>
                <button className="btn" onClick={() => setShowCuadrillas(true)}>Cuadrillas</button>
                <button className="btn" onClick={() => setShowReglas(true)}>Reglas de capacidad</button>
                <button className="btn" onClick={() => setShowReglasEnvio(true)}>Reglas de envío</button>
                <button className="btn" onClick={() => setShowIaConfig(true)}>🤖 Config IA</button>
              </>
            ) : null}
            <button className="btn" onClick={onClose}>Cerrar ventana</button>
          </div>
        </div>

        {err ? <div style={{ color: 'crimson', fontWeight: 800, fontSize: 12 }}>{err}</div> : null}

        {loading ? (
          <div style={{ opacity: 0.75 }}>Cargando…</div>
        ) : (
          <>
            {canEdit && !cerrada ? (
              showNuevoViaje ? (
                <NuevoViajeForm semana={semana} config={config} busy={busy} onCreate={crearViaje} onCancel={() => setShowNuevoViaje(false)} />
              ) : (
                <div>
                  <button className="btn btn--brand" onClick={() => setShowNuevoViaje(true)}>+ Nuevo viaje</button>
                </div>
              )
            ) : null}

            {editandoViaje ? (
              <NuevoViajeForm
                key={editandoViaje.id}
                semana={semana}
                config={config}
                busy={busy}
                initial={editandoViaje}
                submitLabel="Guardar cambios"
                onCreate={guardarEdicionViaje}
                onCancel={() => setEditandoViaje(null)}
              />
            ) : null}

            <div style={{ flex: 1, display: 'flex', gap: 12, overflow: 'hidden' }}>
              <div
                onDragOver={(e) => { if (!canEdit || cerrada) return; e.preventDefault(); setPoolOver(true); }}
                onDragLeave={() => setPoolOver(false)}
                onDrop={(e) => { if (!canEdit || cerrada) return; e.preventDefault(); setPoolOver(false); handleDropToPool(e); }}
                style={{
                  minWidth: 280, maxWidth: 280, display: 'flex', flexDirection: 'column', gap: 8,
                  border: `1px solid ${poolOver ? 'var(--brand)' : 'var(--border)'}`,
                  borderRadius: 12, padding: 10, background: poolOver ? 'var(--brand-100)' : 'var(--surface-muted, #f9fafb)',
                  overflowY: 'auto',
                }}
              >
                <div style={{ fontWeight: 900, fontSize: 13 }}>Sin asignar ({pool.length})</div>
                {pool.length === 0 ? (
                  <div style={{ fontSize: 11, opacity: 0.6 }}>Todo repartido.</div>
                ) : (
                  pool.map((it) => (
                    <PortonChip
                      key={`${it.porton_id}-${it.tipo}`}
                      item={it}
                      draggable={canEdit && !cerrada}
                      onDragStart={(e) => onDragStartChip(e, it)}
                      onDragEnd={onDragEndChip}
                    />
                  ))
                )}
              </div>

              <div style={{ flex: 1, display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
                {(detalle?.viajes || []).map((v) => (
                  <ViajeColumn
                    key={v.id}
                    viaje={v}
                    items={itemsPorViaje.get(v.id) || []}
                    canEdit={canEdit}
                    cerrada={cerrada}
                    onDropItem={handleDrop}
                    onEditar={setEditandoViaje}
                    onBorrar={borrarViaje}
                    onDragStartChip={onDragStartChip}
                    onDragEndChip={onDragEndChip}
                    onVerMapa={(viaje, items) => setMapa({ nvs: uniqueNvs(items), titulo: `Mapa · ${viaje.nombre?.trim() || `Viaje #${viaje.id}`}` })}
                  />
                ))}
                {(detalle?.viajes || []).length === 0 ? (
                  <div style={{ opacity: 0.6, fontSize: 12, padding: 10 }}>Todavía no hay viajes creados para esta semana.</div>
                ) : null}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                Despacho: {counts.despacho_asignados}/{counts.despacho_total} · Instalación: {counts.instalacion_asignados}/{counts.instalacion_total}
              </div>
              <div style={{ marginLeft: 'auto' }}>
                {cerrada ? (
                  canEdit ? <button className="btn" disabled={busy} onClick={onReabrirSemana}>Reabrir semana</button> : null
                ) : (
                  <button className="btn btn--brand" disabled={!puedeCerrar || busy} onClick={onCerrarSemana} title={faltan > 0 ? `Faltan ${faltan} por asignar` : ''}>
                    Cerrar semana{faltan > 0 ? ` (faltan ${faltan})` : ''}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <LogisticaZonasModal open={showZonas} config={config} onClose={() => setShowZonas(false)} onChanged={reloadConfig} />
      <LogisticaVehiculosModal open={showVehiculos} config={config} onClose={() => setShowVehiculos(false)} onChanged={reloadConfig} />
      <LogisticaCuadrillasModal open={showCuadrillas} config={config} onClose={() => setShowCuadrillas(false)} onChanged={reloadConfig} />
      <LogisticaReglasCapacidadModal open={showReglas} config={config} onClose={() => setShowReglas(false)} onChanged={() => { reloadConfig(); reloadDetalle(); }} />
      <LogisticaReglasEnvioModal open={showReglasEnvio} config={config} onClose={() => setShowReglasEnvio(false)} onChanged={reloadConfig} />
      <LogisticaIaConfigModal open={showIaConfig} onClose={() => setShowIaConfig(false)} />
      <PortonesMapaModal open={!!mapa} nvs={mapa?.nvs} titulo={mapa?.titulo} onClose={() => setMapa(null)} />
    </div>
  );
}

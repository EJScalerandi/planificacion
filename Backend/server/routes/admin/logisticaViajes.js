// routes/admin/logisticaViajes.js
//
// Logística de Viajes: pantalla nueva (linkeada desde /a) para armar viajes
// (fecha + zona + cuadrilla + vehículo) por semana y repartir en ellos los
// portones con despacho/instalación de esa semana. Ver server/lib/logisticaViajesDb.js
// para el detalle de las queries.
const express = require('express');
const { adminAuth } = require('../../middleware/adminAuth');
const db = require('../../lib/logisticaViajesDb');
const { resolveCoordsForNvs, getSemanaMapa } = require('../../lib/logisticaMapa');
const { getIaConfig, updateIaConfig } = require('../../lib/logisticaIaConfig');
const { recomendarViaje, planificarRutas } = require('../../lib/logisticaIaRecomendacion');
const { listarPortonesSinViajeConUbicacion } = require('../../lib/logisticaIaContexto');
const { getPromesaConfig, updatePromesaConfig } = require('../../lib/logisticaPromesaConfig');
const { getSemanaPromesaMapa } = require('../../lib/logisticaPromesaMapa');
const { buildMensajeViaje } = require('../../lib/logisticaMensajeViaje');
const { resolveEtapasPorNv, resolveSemanaPrometidaPorNv, resolveSemanaRealPorNv } = require('../../lib/logisticaMapaExtras');
const { listPortonesSinFechaSalida, asignarFechaSalida } = require('../../lib/logisticaSinFechaSalida');
const { sincronizarZonasViaje, listZonasViaje, setZonaHabilitada } = require('../../lib/logisticaRutaZonas');
const { sincronizarRutaReal } = require('../../lib/logisticaRuteo');
const {
  listPuntosExtra, crearPuntoExtra, updatePuntoExtra, deletePuntoExtra,
  listParadasExtraViaje, asignarParadaExtra, desasignarParadaExtra,
} = require('../../lib/logisticaParadasExtra');

// Zonas del corredor + ruta real por calle comparten el mismo trigger
// (cualquier cambio de paradas/orden de un viaje) - se disparan juntas.
async function sincronizarRuta(viajeId) {
  await Promise.all([sincronizarZonasViaje(viajeId), sincronizarRutaReal(viajeId)]);
}

// Zonas que cada viaje de la semana atraviesa (no solo la parada, todo el
// corredor - ver logisticaRutaZonas.js) + paradas que no son un portón (ej.
// alojamiento - logisticaParadasExtra.js). Se agrega acá, a nivel ruta, para
// no crear otro ciclo de require entre logisticaViajesDb.js/logisticaMapa.js
// (logisticaRutaZonas.js depende de logisticaMapa.js, que depende de
// logisticaViajesDb.js).
async function conDetallesViajes(detalle) {
  if (!detalle?.viajes?.length) return detalle;
  const viajes = await Promise.all(detalle.viajes.map(async (v) => ({
    ...v,
    zonas: await listZonasViaje(v.id),
    paradas_extra: await listParadasExtraViaje(v.id),
  })));
  return { ...detalle, viajes };
}

// Le suma a cada item {nv,...} su barrita de etapas de producción (diseño/
// pintura/armado final) - común a los 3 mapas (sin filtro, semana real,
// semana prometida).
async function conEtapas(items) {
  const etapasPorNv = await resolveEtapasPorNv(items.map((it) => it.nv));
  return items.map((it) => ({ ...it, etapas: etapasPorNv.get(it.nv) || null }));
}

const router = express.Router();

const PREPROD_SCOPES = ['preproduccion:full', 'preproduccion:admin', 'preproduccion:comercial_view'];

function normalizeScopes(scopesRaw) {
  if (Array.isArray(scopesRaw)) return scopesRaw.map((s) => String(s || '').trim()).filter(Boolean);
  if (typeof scopesRaw === 'string') return scopesRaw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  return [];
}

function scopesOf(req) {
  return normalizeScopes(req?.admin?.scopes ?? req?.admin?.scope ?? req?.admin?.permissions ?? []);
}

// Lectura: cualquiera de los 3 scopes de Preproducción (igual que /a y que
// logistica-consultas). Escritura (crear/editar viajes, asignar portones,
// cerrar/reabrir semana, tocar config): solo preproduccion:full, el mismo
// scope que hoy es el único habilitado para tocar fecha_salida/fecha_llegada
// en /a.
function requirePreproduccionAccess(req, res, next) {
  if (!PREPROD_SCOPES.some((s) => scopesOf(req).includes(s))) {
    return res.status(403).json({ error: 'Requiere permisos de Preproducción' });
  }
  return next();
}

function requireFullAccess(req, res, next) {
  if (!scopesOf(req).includes('preproduccion:full')) {
    return res.status(403).json({ error: 'Requiere permisos completos de Preproducción (Logística)' });
  }
  return next();
}

router.use('/logistica', adminAuth, requirePreproduccionAccess);

function asyncRoute(fn) {
  return (req, res) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      console.error('logistica-viajes error:', err);
      const status = err.status || 400;
      res.status(status).json({ error: err.message || 'Error inesperado' });
    });
  };
}

// ===== Config =====
router.get('/logistica/config', asyncRoute(async (_req, res) => {
  res.json({ ok: true, config: await db.getConfig() });
}));

// ===== Mapa (puntos de portones por NV, para "Ver mapa" por semana/viaje) =====
// Solo lectura: alcanza con cualquiera de los 3 scopes de Preproducción.
router.get('/logistica/mapa', asyncRoute(async (req, res) => {
  const nvs = String(req.query?.nvs || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter(Number.isInteger)
    .slice(0, 200); // cap defensivo
  res.json({ ok: true, puntos: await resolveCoordsForNvs(nvs) });
}));

// Detalle de una semana + ubicación/zona por item - para el mapa de
// Planificación de Fechas filtrado por semana (a diferencia de
// portones-sin-viaje, acá se ven TAMBIÉN los que ya tienen viaje, con su
// ruta, para poder consultar/ajustar sin perder el contexto geográfico).
router.get('/logistica/semana/:semana/mapa', asyncRoute(async (req, res) => {
  const detalle = await getSemanaMapa(req.params.semana);
  const [items, semanaPrometidaPorNv, detalleConZonas] = await Promise.all([
    conEtapas(detalle.items),
    resolveSemanaPrometidaPorNv(detalle.items.map((it) => it.nv)),
    conDetallesViajes(detalle),
  ]);
  const itemsFinal = items.map((it) => ({ ...it, semana_prometida: semanaPrometidaPorNv.get(it.nv) || null }));
  res.json({ ok: true, detalle: { ...detalleConZonas, items: itemsFinal } });
}));

// ===== Semana prometida (producción reservada por el Presupuestador + margen configurable) =====
router.get('/logistica/promesa-config', asyncRoute(async (_req, res) => {
  res.json({ ok: true, config: await getPromesaConfig() });
}));
router.patch('/logistica/promesa-config', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, config: await updatePromesaConfig(req.body || {}) });
}));
router.get('/logistica/semana/:semana/mapa-promesa', asyncRoute(async (req, res) => {
  const data = await getSemanaPromesaMapa(req.params.semana);
  const [items, semanaRealPorNv] = await Promise.all([
    conEtapas(data.items),
    resolveSemanaRealPorNv(data.items.map((it) => it.nv)),
  ]);
  const itemsFinal = items.map((it) => ({ ...it, semana_real: semanaRealPorNv.get(it.nv) || null }));
  res.json({ ok: true, ...data, items: itemsFinal });
}));

router.post('/logistica/zonas', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, zona: await db.createZona(req.body || {}) });
}));
router.patch('/logistica/zonas/:id', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, zona: await db.updateZona(req.params.id, req.body || {}) });
}));
router.delete('/logistica/zonas/:id', requireFullAccess, asyncRoute(async (req, res) => {
  await db.deleteZona(req.params.id);
  res.json({ ok: true });
}));

router.post('/logistica/vehiculos', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, vehiculo: await db.createVehiculo(req.body || {}) });
}));
router.patch('/logistica/vehiculos/:id', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, vehiculo: await db.updateVehiculo(req.params.id, req.body || {}) });
}));
router.delete('/logistica/vehiculos/:id', requireFullAccess, asyncRoute(async (req, res) => {
  await db.deleteVehiculo(req.params.id);
  res.json({ ok: true });
}));

router.post('/logistica/cuadrillas', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, cuadrilla: await db.createCuadrilla(req.body || {}) });
}));
router.patch('/logistica/cuadrillas/:id', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, cuadrilla: await db.updateCuadrilla(req.params.id, req.body || {}) });
}));
router.delete('/logistica/cuadrillas/:id', requireFullAccess, asyncRoute(async (req, res) => {
  await db.deleteCuadrilla(req.params.id);
  res.json({ ok: true });
}));
router.put('/logistica/cuadrillas/:id/miembros', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, cuadrilla: await db.setCuadrillaMiembros(req.params.id, req.body?.qc_user_ids) });
}));

router.post('/logistica/reglas-capacidad', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, regla: await db.createReglaCapacidad(req.body || {}) });
}));
router.patch('/logistica/reglas-capacidad/:id', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, regla: await db.updateReglaCapacidad(req.params.id, req.body || {}) });
}));
router.delete('/logistica/reglas-capacidad/:id', requireFullAccess, asyncRoute(async (req, res) => {
  await db.deleteReglaCapacidad(req.params.id);
  res.json({ ok: true });
}));

// ===== Motor de logística IA (Fase 1): config editable + recomendación =====
router.get('/logistica/ia/config', asyncRoute(async (_req, res) => {
  res.json({ ok: true, config: await getIaConfig() });
}));
router.patch('/logistica/ia/config', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, config: await updateIaConfig(req.body || {}) });
}));
// Portones con despacho/instalación pendiente (cualquier semana) y sin viaje
// asignado todavía, con ubicación+zona resuelta - para el mapa de selección
// de "Generar viaje con IA" en Planificación de Fechas.
router.get('/logistica/portones-sin-viaje', asyncRoute(async (_req, res) => {
  const pendientes = await listarPortonesSinViajeConUbicacion();
  const [items, semanaPrometidaPorNv] = await Promise.all([
    conEtapas(pendientes),
    resolveSemanaPrometidaPorNv(pendientes.map((it) => it.nv)),
  ]);
  const itemsFinal = items.map((it) => ({ ...it, semana_prometida: semanaPrometidaPorNv.get(it.nv) || null }));
  res.json({ ok: true, items: itemsFinal });
}));

// NV (portones/puertas/iPanel) sin "Fecha Salida" cargada todavía en /a -
// mismo criterio EXACTO que el filtro "Sin fecha" de esa columna ahí (ver
// lib/logisticaSinFechaSalida.js). Vista de solo consulta: sin fecha no hay
// con qué agrupar en un viaje, es para decidir prioridad de carga por
// cercanía geográfica.
router.get('/logistica/sin-fecha-salida', asyncRoute(async (_req, res) => {
  const items = await listPortonesSinFechaSalida();
  res.json({ ok: true, items });
}));

// Carga "Fecha Salida" para un lote de NV elegidos en el mapa - mismo campo
// que /a, pero de a varios a la vez agrupados por cercanía geográfica.
router.patch('/logistica/sin-fecha-salida/asignar', requireFullAccess, asyncRoute(async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const fecha = req.body?.fecha;
  const resultado = await asignarFechaSalida(items, fecha);
  res.json({ ok: true, ...resultado });
}));

router.post('/logistica/ia/recomendar-viaje', requireFullAccess, asyncRoute(async (req, res) => {
  const nvs = Array.isArray(req.body?.nvs)
    ? req.body.nvs.map((n) => Number(n)).filter(Number.isInteger).slice(0, 30)
    : [];
  res.json({ ok: true, ...(await recomendarViaje(nvs)) });
}));

// Planificación proactiva: mira TODOS los portones sin viaje, los agrupa por
// zona, y le pide a la IA que proponga qué viajes armar en cada zona (no
// requiere selección manual previa).
router.post('/logistica/ia/planificar', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, ...(await planificarRutas()) });
}));

// ===== Zonificación geográfica (referencias por zona, para clasificar portones por ubicación) =====
router.post('/logistica/zona-referencias', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, referencia: await db.createZonaReferencia(req.body || {}) });
}));
router.delete('/logistica/zona-referencias/:id', requireFullAccess, asyncRoute(async (req, res) => {
  await db.deleteZonaReferencia(req.params.id);
  res.json({ ok: true });
}));

// ===== Reglas de envío (días mínimos antes de poder despachar) =====
router.post('/logistica/reglas-envio', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, regla: await db.createReglaEnvio(req.body || {}) });
}));
router.patch('/logistica/reglas-envio/:id', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, regla: await db.updateReglaEnvio(req.params.id, req.body || {}) });
}));
router.delete('/logistica/reglas-envio/:id', requireFullAccess, asyncRoute(async (req, res) => {
  await db.deleteReglaEnvio(req.params.id);
  res.json({ ok: true });
}));

// ===== Semanas / viajes / asignaciones =====
router.get('/logistica/semanas', asyncRoute(async (_req, res) => {
  res.json({ ok: true, semanas: await db.getSemanas() });
}));

router.get('/logistica/semanas/:semana', asyncRoute(async (req, res) => {
  res.json({ ok: true, detalle: await conDetallesViajes(await db.getSemanaDetalle(req.params.semana)) });
}));

router.post('/logistica/semanas/:semana/viajes', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, detalle: await conDetallesViajes(await db.crearViaje(req.params.semana, req.body || {})) });
}));

router.patch('/logistica/viajes/:id', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, detalle: await conDetallesViajes(await db.patchViaje(req.params.id, req.body || {})) });
}));

router.delete('/logistica/viajes/:id', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, detalle: await conDetallesViajes(await db.borrarViaje(req.params.id)) });
}));

router.post('/logistica/viajes/:id/portones', requireFullAccess, asyncRoute(async (req, res) => {
  const detalle = await db.asignarPorton(req.params.id, req.body || {});
  await sincronizarRuta(req.params.id);
  res.json({ ok: true, detalle: await conDetallesViajes(detalle) });
}));

router.delete('/logistica/viajes/:id/portones/:porton_id', requireFullAccess, asyncRoute(async (req, res) => {
  const detalle = await db.desasignarPorton(req.params.id, req.params.porton_id, req.query?.tipo);
  await sincronizarRuta(req.params.id);
  res.json({ ok: true, detalle: await conDetallesViajes(detalle) });
}));

// Reordenar los portones DENTRO de un viaje (orden de ruta: primero el que
// queda arriba). Body: { items: [{ porton_id, tipo }, ...] } en el orden final.
router.put('/logistica/viajes/:id/orden', requireFullAccess, asyncRoute(async (req, res) => {
  const detalle = await db.reordenarViaje(req.params.id, req.body?.items);
  // El orden cambia la forma del corredor (los tramos entre paradas
  // consecutivas son otros) - las zonas que atraviesa pueden cambiar aunque
  // las paradas sean las mismas.
  await sincronizarRuta(req.params.id);
  res.json({ ok: true, detalle: await conDetallesViajes(detalle) });
}));

// ===== Paradas extra (catálogo reutilizable, ej. "Hotel San Vicente" para
// alojamiento de la cuadrilla) - lectura: cualquiera de los 3 scopes;
// escritura: preproduccion:full, igual que el resto de la config. =====
router.get('/logistica/puntos-extra', asyncRoute(async (_req, res) => {
  res.json({ ok: true, puntos: await listPuntosExtra() });
}));
router.post('/logistica/puntos-extra', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, punto: await crearPuntoExtra(req.body || {}) });
}));
router.patch('/logistica/puntos-extra/:id', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, punto: await updatePuntoExtra(req.params.id, req.body || {}) });
}));
router.delete('/logistica/puntos-extra/:id', requireFullAccess, asyncRoute(async (req, res) => {
  await deletePuntoExtra(req.params.id);
  res.json({ ok: true });
}));

// Asigna/saca una parada extra (del catálogo) a un viaje - se trata como un
// portón más para la ruta: entra en la misma secuencia de `orden`, cuenta
// para la detección de zonas del corredor, y aparece en el mensaje.
router.post('/logistica/viajes/:id/paradas-extra', requireFullAccess, asyncRoute(async (req, res) => {
  await asignarParadaExtra(req.params.id, req.body?.punto_extra_id);
  await sincronizarRuta(req.params.id);
  const semana = await db.getViajeSemana(req.params.id);
  res.json({ ok: true, detalle: await conDetallesViajes(await db.getSemanaDetalle(semana)) });
}));
router.delete('/logistica/viajes/:id/paradas-extra/:punto_extra_id', requireFullAccess, asyncRoute(async (req, res) => {
  await desasignarParadaExtra(req.params.id, req.params.punto_extra_id);
  await sincronizarRuta(req.params.id);
  const semana = await db.getViajeSemana(req.params.id);
  res.json({ ok: true, detalle: await conDetallesViajes(await db.getSemanaDetalle(semana)) });
}));

// Habilita/deshabilita una zona detectada para un viaje (queda guardado
// para una integración futura con el Presupuestador - por ahora es solo
// informativo). No requiere semana abierta: es un dato posterior a la
// ruta, tiene sentido seguir tocándolo incluso con el viaje ya en curso.
router.patch('/logistica/viajes/:id/zonas/:zona_id', requireFullAccess, asyncRoute(async (req, res) => {
  await setZonaHabilitada(req.params.id, req.params.zona_id, req.body?.habilitada);
  const semana = await db.getViajeSemana(req.params.id);
  res.json({ ok: true, detalle: await conDetallesViajes(await db.getSemanaDetalle(semana)) });
}));

// Mensaje de texto (borrador) para mandarle a la cuadrilla - solo lectura,
// no modifica nada, alcanza con cualquiera de los 3 scopes de Preproducción.
router.get('/logistica/viajes/:id/mensaje', asyncRoute(async (req, res) => {
  res.json({ ok: true, texto: await buildMensajeViaje(req.params.id) });
}));

router.post('/logistica/semanas/:semana/cerrar', requireFullAccess, asyncRoute(async (req, res) => {
  const cerradaBy = req?.admin?.username || req?.admin?.name || null;
  res.json({ ok: true, detalle: await db.cerrarSemana(req.params.semana, cerradaBy) });
}));

router.post('/logistica/semanas/:semana/reabrir', requireFullAccess, asyncRoute(async (req, res) => {
  res.json({ ok: true, detalle: await db.reabrirSemana(req.params.semana) });
}));

module.exports = router;

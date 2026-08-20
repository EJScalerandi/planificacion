// lib/servicioTecnicoIaContexto.js
//
// Arma el contexto de un conjunto de items (solicitudes de ST + mediciones
// pendientes) para el motor de recomendación de rutas de Técnica - espejo de
// logisticaIaContexto.js, pero sin reglas de envío ni capacidad de vehículo
// (no aplican a este dominio: una visita técnica no "pesa" como un despacho
// de portones, y no hay una fecha mínima habilitada por regla de negocio).
const { resolveCoordsForQuoteIds, resolveCoordsForSolicitudIds } = require('./servicioTecnicoMapaGeo');
const { clasificarZonas, haversineKm } = require('./logisticaZonificacion');
const solicitudesDb = require('./servicioTecnicoSolicitudesDb');
const medicionDb = require('./servicioTecnicoMedicionDb');

// Todos los items pendientes (sin fecha_programada todavía) de CUALQUIER
// tipo, con ubicación/zona resuelta - para el mapa de selección y la
// planificación automática por zona.
async function listarItemsPendientesConUbicacion() {
  const [solicitudesRaw, medicionesRaw] = await Promise.all([
    solicitudesDb.listSolicitudes({}),
    medicionDb.listMedicionesPendientes(),
  ]);
  const solicitudesPend = solicitudesRaw.filter((s) => !s.fecha_programada && !['resuelto', 'cancelado'].includes(s.estado));
  const medicionesPend = medicionesRaw.filter((m) => !m.fecha_programada);

  const [coordsSol, coordsMed] = await Promise.all([
    resolveCoordsForSolicitudIds(solicitudesPend.map((s) => s.id)),
    resolveCoordsForQuoteIds(medicionesPend.map((m) => m.quote_id)),
  ]);

  const items = [
    ...solicitudesPend.map((s) => ({
      tipo: 'solicitud', id: s.id, nv: s.nv, nombre_cliente: s.nombre_cliente, direccion: s.direccion,
      descripcion: s.descripcion, ...(coordsSol.get(s.id) || { lat: null, lng: null, source: null }),
    })),
    ...medicionesPend.map((m) => ({
      tipo: 'medicion', id: m.quote_id, nv: m.nv, nombre_cliente: m.nombre_cliente, direccion: m.direccion,
      descripcion: 'Medición pendiente', ...(coordsMed.get(m.quote_id) || { lat: null, lng: null, source: null }),
    })),
  ];

  const zonas = await clasificarZonas(items.map((it) => ({ lat: it.lat, lng: it.lng }))).catch(() => items.map(() => null));
  return items.map((it, i) => ({ ...it, zona: zonas[i] }));
}

// Contexto para un subconjunto elegido por el usuario (selección manual) o
// por zona (planificación automática). items = [{ tipo, id }].
async function construirContexto(items) {
  const todos = await listarItemsPendientesConUbicacion();
  const byKey = new Map(todos.map((it) => [`${it.tipo}:${it.id}`, it]));
  const elegidos = (items || []).map((it) => byKey.get(`${it.tipo}:${it.id}`)).filter(Boolean);

  const conUbicacion = elegidos.filter((it) => it.lat != null && it.lng != null);
  const distancias_km = [];
  for (let i = 0; i < conUbicacion.length; i++) {
    for (let j = i + 1; j < conUbicacion.length; j++) {
      const a = conUbicacion[i];
      const b = conUbicacion[j];
      distancias_km.push({ de: `${a.tipo}:${a.id}`, a: `${b.tipo}:${b.id}`, km: Math.round(haversineKm(a.lat, a.lng, b.lat, b.lng) * 10) / 10 });
    }
  }

  return { items: elegidos, distancias_km };
}

module.exports = { listarItemsPendientesConUbicacion, construirContexto };

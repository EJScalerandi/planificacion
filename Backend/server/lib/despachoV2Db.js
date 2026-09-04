// lib/despachoV2Db.js
//
// /despacho_v2: versión mobile-first para la cuadrilla, pensada para
// reemplazar en el futuro a /despacho (el tablero de workflow clásico) - por
// ahora conviven, se desarrolla en paralelo. Login con nombre de usuario QC
// + PIN (no es el login de admin) - solo ve sus propios viajes (los de su
// cuadrilla), reutiliza las tablas que ya existen de Logística de Viajes
// (logistica_cuadrilla_miembros/qc_users/logistica_viajes) y de Servicio
// Técnico (servicio_tecnico_solicitudes, para el botón ST/PV) sin tocarlas.
const { pool } = require('../db');
const { fetchItems, fetchParadasExtra, fetchDatosPorNv } = require('./logisticaMensajeViaje');
const solicitudesDb = require('./servicioTecnicoSolicitudesDb');

// Solo usuarios QC activos que están en AL MENOS una cuadrilla - son la
// única audiencia de este login (alguien de calidad que nunca maneja un
// camión no tiene sentido que aparezca acá).
async function listQcUsersDeCuadrillas() {
  const { rows } = await pool.query(
    `select distinct u.id, u.name
       from public.qc_users u
       join public.logistica_cuadrilla_miembros cm on cm.qc_user_id = u.id
       join public.logistica_cuadrillas c on c.id = cm.cuadrilla_id and c.activo
      where u.is_active
      order by u.name asc;`
  );
  return rows;
}

async function getQcUser(qcUserId) {
  const { rows } = await pool.query(
    `select id, name, pin_hash, is_active from public.qc_users where id = $1 limit 1;`,
    [Number(qcUserId)]
  );
  return rows[0] || null;
}

async function cuadrillasDeUsuario(qcUserId) {
  const { rows } = await pool.query(
    `select c.id, c.nombre
       from public.logistica_cuadrilla_miembros cm
       join public.logistica_cuadrillas c on c.id = cm.cuadrilla_id
      where cm.qc_user_id = $1 and c.activo
      order by c.nombre asc;`,
    [Number(qcUserId)]
  );
  return rows;
}

// Viajes de una o más cuadrillas, con lo que pide la pantalla mobile:
// vehículo, cuadrilla + nombres de los integrantes, cantidad de portones
// (NV únicos - despacho e instalación del mismo NV cuentan una vez, mismo
// criterio que el resto de la app), cantidad de paradas totales (portones +
// paradas extra, ej. hoteles), y hora_salida_real (botón "Play"). Switch
// pedido por el usuario: hoy hasta 10 días corridos después inclusive, o
// toda la programación.
async function listViajesDeCuadrillas(cuadrillaIds, { soloProximos10 } = {}) {
  const ids = (cuadrillaIds || []).map(Number).filter(Number.isInteger);
  if (!ids.length) return [];

  const filtroFecha = soloProximos10
    ? `and vi.fecha >= current_date and vi.fecha < current_date + 10`
    : '';

  const { rows } = await pool.query(
    `
    select
      vi.id, vi.nombre, vi.fecha::text as fecha, to_char(vi.hora_salida, 'HH24:MI') as hora_salida,
      vi.hora_salida_real, vi.ruta_real,
      c.id as cuadrilla_id, c.nombre as cuadrilla_nombre,
      ve.nombre as vehiculo_nombre, ve.capacidad_portones as vehiculo_capacidad,
      (select count(distinct p.nv)
         from public.logistica_viaje_portones vp
         join public.portones p on p.id = vp.porton_id
        where vp.viaje_id = vi.id) as cantidad_portones,
      (select count(*) from public.logistica_viaje_paradas_extra pe where pe.viaje_id = vi.id) as cantidad_paradas_extra
    from public.logistica_viajes vi
    left join public.logistica_cuadrillas c on c.id = vi.cuadrilla_id
    left join public.logistica_vehiculos ve on ve.id = vi.vehiculo_id
    where vi.cuadrilla_id = any($1::int[])
    ${filtroFecha}
    order by vi.fecha asc, vi.hora_salida asc nulls last, vi.id asc;
    `,
    [ids]
  );

  // Integrantes de cada cuadrilla involucrada - un solo query para todas
  // las que aparecen en el resultado, no uno por viaje.
  const cuadrillaIdsEnResultado = Array.from(new Set(rows.map((r) => r.cuadrilla_id).filter((x) => x != null)));
  const miembrosPorCuadrilla = new Map();
  if (cuadrillaIdsEnResultado.length) {
    const { rows: miembros } = await pool.query(
      `select cm.cuadrilla_id, u.name
         from public.logistica_cuadrilla_miembros cm
         join public.qc_users u on u.id = cm.qc_user_id and u.is_active
        where cm.cuadrilla_id = any($1::int[])
        order by u.name asc;`,
      [cuadrillaIdsEnResultado]
    );
    for (const m of miembros) {
      if (!miembrosPorCuadrilla.has(m.cuadrilla_id)) miembrosPorCuadrilla.set(m.cuadrilla_id, []);
      miembrosPorCuadrilla.get(m.cuadrilla_id).push(m.name);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    fecha: r.fecha,
    hora_salida: r.hora_salida,
    hora_salida_real: r.hora_salida_real,
    vehiculo_nombre: r.vehiculo_nombre,
    vehiculo_capacidad: r.vehiculo_capacidad,
    cuadrilla_id: r.cuadrilla_id,
    cuadrilla_nombre: r.cuadrilla_nombre,
    cuadrilla_miembros: miembrosPorCuadrilla.get(r.cuadrilla_id) || [],
    cantidad_portones: Number(r.cantidad_portones) || 0,
    cantidad_paradas: (Number(r.cantidad_portones) || 0) + (Number(r.cantidad_paradas_extra) || 0),
    distancia_km: r.ruta_real?.distancia_km ?? null,
    duracion_horas: r.ruta_real?.duracion_horas ?? null,
  }));
}

async function getViajeCuadrilla(viajeId) {
  const { rows } = await pool.query(`select id, cuadrilla_id from public.logistica_viajes where id = $1;`, [Number(viajeId)]);
  return rows[0] || null;
}

// Botón "Play": solo la PRIMERA vez pisa hora_salida_real (un segundo toque
// - a propósito o por error - no debe correr el horario ya asentado).
async function marcarSalidaReal(viajeId) {
  const { rows } = await pool.query(
    `update public.logistica_viajes
        set hora_salida_real = coalesce(hora_salida_real, now())
      where id = $1
      returning hora_salida_real;`,
    [Number(viajeId)]
  );
  return rows[0]?.hora_salida_real || null;
}

// Lista desplegable (botón de tres líneas) de portones + paradas extra de un
// viaje, en orden real de ruta - portón: NV, Cliente, Distribuidor,
// Localidad (pedido explícito); parada extra: nombre + link de mapa. Mismas
// fuentes de datos ya usadas por el mensaje a la cuadrilla
// (logisticaMensajeViaje.js) - un solo query de datos por NV para todo el
// viaje, no uno por parada.
async function listParadasDeViaje(viajeId) {
  const vId = Number(viajeId);
  const [items, paradasExtra] = await Promise.all([fetchItems(vId), fetchParadasExtra(vId)]);

  const nvsUnicos = Array.from(new Set(items.map((it) => it.nv)));
  const datosPorNv = await fetchDatosPorNv(nvsUnicos);

  // Portones dedupeados por NV (despacho+instalación del mismo NV = misma
  // parada), tomando el orden más chico entre sus filas - mismo criterio que
  // el resto de la app (rutasPorViaje en el frontend, construirRutaViaje en
  // el backend).
  const ordenPorNv = new Map();
  const tiposPorNv = new Map();
  for (const it of items) {
    if (!ordenPorNv.has(it.nv) || it.orden < ordenPorNv.get(it.nv)) ordenPorNv.set(it.nv, it.orden);
    if (!tiposPorNv.has(it.nv)) tiposPorNv.set(it.nv, new Set());
    tiposPorNv.get(it.nv).add(it.tipo);
  }

  const paradasPortones = Array.from(ordenPorNv.entries()).map(([nv, orden]) => {
    const d = datosPorNv.get(nv) || {};
    const tipos = Array.from(tiposPorNv.get(nv) || []);
    return {
      tipo: 'porton',
      nv,
      orden,
      tipos_pendientes: tipos, // ['despacho'] | ['instalacion'] | ['despacho','instalacion']
      nombre_cliente: d.nombre_cliente || null,
      distribuidor: d.distribuidor || null,
      localidad: d.localidad || null,
    };
  });

  const paradasExtraOut = paradasExtra.map((p) => ({
    tipo: 'extra',
    orden: p.orden,
    nombre: p.nombre,
    maps_url: p.maps_url,
  }));

  return [...paradasPortones, ...paradasExtraOut].sort((a, b) => a.orden - b.orden);
}

// Detalle completo de un NV (al tocar una parada-portón) - misma fuente de
// datos que el mensaje a la cuadrilla, más el maps_url (no viaja en
// listParadasDeViaje para no pesar la lista, se pide al abrir el detalle).
async function getNvDetalle(nv) {
  const nNv = Number(nv);
  if (!Number.isInteger(nNv)) return null;
  const datos = await fetchDatosPorNv([nNv]);
  const d = datos.get(nNv);
  if (!d) return { nv: nNv, nombre_cliente: null, distribuidor: null, direccion: null, localidad: null, telefono: null, maps_url: null };
  return { nv: nNv, ...d };
}

// Botón "ST/PV" - crea una solicitud de Servicio Técnico (Fase 0, mismo
// sistema que ya usa el admin) desde el celular de la cuadrilla, con
// descripción y opcionalmente una foto/video (mismo formato base64 data_url
// que ya acepta el historial de la solicitud - sin storage nuevo).
async function crearSolicitudSt({ nv, descripcion, attachment, creadoPor }) {
  const solicitud = await solicitudesDb.createSolicitud({ nv, descripcion, creado_por: creadoPor });
  if (attachment) {
    await solicitudesDb.agregarHistorial(solicitud.id, { tipo: 'tecnico', autor: creadoPor, texto: descripcion, attachment });
  }
  return solicitud;
}

module.exports = {
  listQcUsersDeCuadrillas, getQcUser, cuadrillasDeUsuario,
  listViajesDeCuadrillas, getViajeCuadrilla, marcarSalidaReal,
  listParadasDeViaje, getNvDetalle, crearSolicitudSt,
};

// lib/servicioTecnicoViajesDb.js
//
// Viajes de Servicio Técnico: espejo de lib/logisticaViajesDb.js (armar
// viajes por semana ISO y repartir en ellos los items pendientes), pero acá
// un "item" es una de dos cosas:
//   - una solicitud de servicio técnico (public.servicio_tecnico_solicitudes,
//     con fecha_programada), o
//   - una medición pendiente (public.presupuestador_quotes con
//     measurement_status='pending', measurement_scheduled_for - ver
//     lib/servicioTecnicoMedicionDb.js; esa entidad no vive en Planta).
// Reutiliza las MISMAS zonas geográficas que Logística
// (public.logistica_zonas) - son geografía, no un recurso de despacho - pero
// tiene su propio listado de vehículos/cuadrillas (equipo de Técnica).
const { pool } = require('../db');

async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (err) {
    try { await client.query('rollback'); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

async function assertSemanaAbierta(semana) {
  const { rows } = await pool.query(`select cerrada from public.servicio_tecnico_semanas where semana = $1;`, [semana]);
  if (rows[0]?.cerrada) throw new Error(`La semana ${semana} está cerrada`);
}

// ===========================================================================
// Config: zonas (compartidas con Logística, solo lectura acá) / vehículos /
// cuadrillas de Técnica
// ===========================================================================

async function listZonas() {
  const { rows } = await pool.query(
    `select id, nombre, activo from public.logistica_zonas where activo is true order by nombre asc;`
  );
  return rows;
}

async function listVehiculos() {
  const { rows } = await pool.query(
    `select id, nombre, activo, created_at, updated_at from public.servicio_tecnico_vehiculos order by nombre asc;`
  );
  return rows;
}
async function createVehiculo({ nombre, activo }) {
  const nm = String(nombre || '').trim();
  if (!nm) throw new Error('Falta nombre');
  const { rows } = await pool.query(
    `insert into public.servicio_tecnico_vehiculos (nombre, activo) values ($1, $2)
     returning id, nombre, activo, created_at, updated_at;`,
    [nm, activo !== false]
  );
  return rows[0];
}
async function updateVehiculo(id, { nombre, activo }) {
  const sets = [];
  const params = [Number(id)];
  if (nombre !== undefined) { params.push(String(nombre || '').trim()); sets.push(`nombre = $${params.length}`); }
  if (activo !== undefined) { params.push(!!activo); sets.push(`activo = $${params.length}`); }
  if (!sets.length) throw new Error('Nada para actualizar');
  sets.push('updated_at = now()');
  const { rows, rowCount } = await pool.query(
    `update public.servicio_tecnico_vehiculos set ${sets.join(', ')} where id = $1
     returning id, nombre, activo, created_at, updated_at;`,
    params
  );
  if (!rowCount) throw new Error('Vehículo no encontrado');
  return rows[0];
}
async function deleteVehiculo(id) {
  await pool.query(`delete from public.servicio_tecnico_vehiculos where id = $1;`, [Number(id)]);
}

async function listCuadrillas() {
  const { rows } = await pool.query(
    `select c.id, c.nombre, c.activo, c.created_at, c.updated_at,
       coalesce(json_agg(json_build_object('id', u.id, 'name', u.name)) filter (where u.id is not null), '[]') as miembros
     from public.servicio_tecnico_cuadrillas c
     left join public.servicio_tecnico_cuadrilla_miembros cm on cm.cuadrilla_id = c.id
     left join public.qc_users u on u.id = cm.qc_user_id
     group by c.id
     order by c.nombre asc;`
  );
  return rows;
}
async function createCuadrilla({ nombre, activo }) {
  const nm = String(nombre || '').trim();
  if (!nm) throw new Error('Falta nombre');
  const { rows } = await pool.query(
    `insert into public.servicio_tecnico_cuadrillas (nombre, activo) values ($1, $2) returning id;`,
    [nm, activo !== false]
  );
  return (await listCuadrillas()).find((c) => c.id === rows[0].id) || null;
}
async function updateCuadrilla(id, { nombre, activo }) {
  const sets = [];
  const params = [Number(id)];
  if (nombre !== undefined) { params.push(String(nombre || '').trim()); sets.push(`nombre = $${params.length}`); }
  if (activo !== undefined) { params.push(!!activo); sets.push(`activo = $${params.length}`); }
  if (!sets.length) throw new Error('Nada para actualizar');
  sets.push('updated_at = now()');
  const { rowCount } = await pool.query(
    `update public.servicio_tecnico_cuadrillas set ${sets.join(', ')} where id = $1;`,
    params
  );
  if (!rowCount) throw new Error('Cuadrilla no encontrada');
  return (await listCuadrillas()).find((c) => c.id === Number(id)) || null;
}
async function deleteCuadrilla(id) {
  await pool.query(`delete from public.servicio_tecnico_cuadrillas where id = $1;`, [Number(id)]);
}
async function setCuadrillaMiembros(cuadrillaId, qcUserIds) {
  const ids = (Array.isArray(qcUserIds) ? qcUserIds : []).map(Number).filter(Number.isInteger);
  await withTx(async (client) => {
    await client.query(`delete from public.servicio_tecnico_cuadrilla_miembros where cuadrilla_id = $1;`, [cuadrillaId]);
    for (const uid of ids) {
      await client.query(
        `insert into public.servicio_tecnico_cuadrilla_miembros (cuadrilla_id, qc_user_id) values ($1, $2)
         on conflict do nothing;`,
        [cuadrillaId, uid]
      );
    }
  });
  return (await listCuadrillas()).find((c) => c.id === Number(cuadrillaId)) || null;
}

async function getConfig() {
  const [zonas, vehiculos, cuadrillas, qcUsersQ] = await Promise.all([
    listZonas(),
    listVehiculos(),
    listCuadrillas(),
    pool.query(`select id, name, is_active from public.qc_users where is_active is true order by name asc;`),
  ]);
  return { zonas, vehiculos, cuadrillas, qc_users: qcUsersQ.rows };
}

// ===========================================================================
// Items por semana (solicitudes + mediciones pendientes) y viajes
// ===========================================================================

const STATUS_MEDICION_HABILITADO = `
  (q.status = 'synced_odoo'
   or (q.status = 'pending_approvals' and q.commercial_decision = 'approved' and q.technical_decision = 'approved')
   or (q.status = 'draft' and q.measurement_status = 'returned_to_seller'))
`;

async function fetchItemsForSemana(semana) {
  const [solicitudesQ, medicionesQ, itemsQ] = await Promise.all([
    pool.query(
      `select id as solicitud_id, nv, nombre_cliente, distribuidor, direccion, descripcion,
         to_char(fecha_programada, 'YYYY-MM-DD') as fecha
       from public.servicio_tecnico_solicitudes
       where fecha_programada is not null
         and to_char(fecha_programada, 'IYYY-"W"IW') = $1
         and estado not in ('resuelto', 'cancelado');`,
      [semana]
    ),
    pool.query(
      `select
         q.id as quote_id,
         substring(coalesce(nullif(q.final_sale_order_name,''), nullif(q.odoo_sale_order_name,'')) from '\\d+')::int as nv,
         q.end_customer->>'name' as nombre_cliente,
         nullif(trim(both ' - ' from concat_ws(' - ', q.end_customer->>'address', q.end_customer->>'city')), '') as direccion,
         to_char(q.measurement_scheduled_for, 'YYYY-MM-DD') as fecha
       from public.presupuestador_quotes q
       where q.quote_kind = 'original'
         and ${STATUS_MEDICION_HABILITADO}
         and q.measurement_status = 'pending'
         and q.measurement_at is null
         and q.measurement_scheduled_for is not null
         and to_char(q.measurement_scheduled_for, 'IYYY-"W"IW') = $1;`,
      [semana]
    ),
    pool.query(
      `select viaje_id, tipo, solicitud_id, quote_id, orden from public.servicio_tecnico_viaje_items;`
    ),
  ]);

  const itemsBySolicitud = new Map(itemsQ.rows.filter((r) => r.tipo === 'solicitud').map((r) => [r.solicitud_id, r]));
  const itemsByQuote = new Map(itemsQ.rows.filter((r) => r.tipo === 'medicion').map((r) => [r.quote_id, r]));

  const solicitudes = solicitudesQ.rows.map((s) => {
    const asignado = itemsBySolicitud.get(s.solicitud_id);
    return {
      tipo: 'solicitud', id: String(s.solicitud_id), solicitud_id: s.solicitud_id, quote_id: null,
      nv: s.nv, nombre_cliente: s.nombre_cliente, distribuidor: s.distribuidor, direccion: s.direccion,
      descripcion: s.descripcion, fecha: s.fecha,
      viaje_id: asignado?.viaje_id ?? null, orden: asignado?.orden ?? 0,
    };
  });
  const mediciones = medicionesQ.rows.map((m) => {
    const asignado = itemsByQuote.get(m.quote_id);
    return {
      tipo: 'medicion', id: m.quote_id, solicitud_id: null, quote_id: m.quote_id,
      nv: m.nv, nombre_cliente: m.nombre_cliente, distribuidor: null, direccion: m.direccion,
      descripcion: 'Medición pendiente', fecha: m.fecha,
      viaje_id: asignado?.viaje_id ?? null, orden: asignado?.orden ?? 0,
    };
  });

  return [...solicitudes, ...mediciones];
}

async function getSemanaCounts(semana) {
  const items = await fetchItemsForSemana(semana);
  return {
    total: items.length,
    asignados: items.filter((it) => it.viaje_id != null).length,
  };
}

async function isSemanaCerrada(semana) {
  const { rows } = await pool.query(`select cerrada from public.servicio_tecnico_semanas where semana = $1;`, [semana]);
  return !!rows[0]?.cerrada;
}

async function getViajesForSemana(semana) {
  const { rows } = await pool.query(
    `select v.id, v.semana, to_char(v.fecha,'YYYY-MM-DD') as fecha, v.zona_id, z.nombre as zona_nombre,
       v.cuadrilla_id, cu.nombre as cuadrilla_nombre, v.vehiculo_id, ve.nombre as vehiculo_nombre,
       v.nombre, v.orden, v.created_at, v.updated_at
     from public.servicio_tecnico_viajes v
     left join public.logistica_zonas z on z.id = v.zona_id
     left join public.servicio_tecnico_cuadrillas cu on cu.id = v.cuadrilla_id
     left join public.servicio_tecnico_vehiculos ve on ve.id = v.vehiculo_id
     where v.semana = $1
     order by v.orden asc, v.id asc;`,
    [semana]
  );
  return rows;
}

async function getSemanas() {
  const itemsAll = await pool.query(
    `select to_char(fecha_programada, 'IYYY-"W"IW') as semana from public.servicio_tecnico_solicitudes
     where fecha_programada is not null and estado not in ('resuelto','cancelado')
     union all
     select to_char(q.measurement_scheduled_for, 'IYYY-"W"IW') as semana from public.presupuestador_quotes q
     where q.quote_kind = 'original' and ${STATUS_MEDICION_HABILITADO}
       and q.measurement_status = 'pending' and q.measurement_at is null and q.measurement_scheduled_for is not null;`
  );
  const semanasSet = new Set(itemsAll.rows.map((r) => r.semana).filter(Boolean));

  const viajesQ = await pool.query(`select semana, count(*)::int as viajes_count from public.servicio_tecnico_viajes group by semana;`);
  const viajesBySemana = new Map(viajesQ.rows.map((r) => [r.semana, r.viajes_count]));

  const cerradasQ = await pool.query(`select semana, cerrada from public.servicio_tecnico_semanas;`);
  const cerradaBySemana = new Map(cerradasQ.rows.map((r) => [r.semana, r.cerrada]));

  const out = [];
  for (const semana of semanasSet) {
    const counts = await getSemanaCounts(semana);
    out.push({
      semana,
      total: counts.total,
      asignados: counts.asignados,
      viajes_count: viajesBySemana.get(semana) || 0,
      cerrada: !!cerradaBySemana.get(semana),
    });
  }
  out.sort((a, b) => a.semana.localeCompare(b.semana));
  return out;
}

async function getSemanaDetalle(semana) {
  const [items, viajes, cerrada] = await Promise.all([
    fetchItemsForSemana(semana),
    getViajesForSemana(semana),
    isSemanaCerrada(semana),
  ]);
  const counts = { total: items.length, asignados: items.filter((it) => it.viaje_id != null).length };
  return { semana, items, viajes, cerrada, counts };
}

async function crearViaje(semana, { fecha, zona_id, cuadrilla_id, vehiculo_id, nombre, orden }) {
  await assertSemanaAbierta(semana);
  const fechaStr = String(fecha || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) throw new Error('fecha inválida');

  const chk = await pool.query(`select to_char($1::date, 'IYYY-"W"IW') as semana;`, [fechaStr]);
  if (chk.rows?.[0]?.semana !== semana) throw new Error(`La fecha ${fechaStr} no cae dentro de la semana ${semana}`);

  await pool.query(
    `insert into public.servicio_tecnico_viajes (semana, fecha, zona_id, cuadrilla_id, vehiculo_id, nombre, orden)
     values ($1, $2, $3, $4, $5, $6, coalesce($7, 0));`,
    [semana, fechaStr, zona_id || null, cuadrilla_id || null, vehiculo_id || null, nombre || null, orden ?? null]
  );
  return getSemanaDetalle(semana);
}

async function getViajeSemana(viajeId) {
  const { rows } = await pool.query(`select semana from public.servicio_tecnico_viajes where id = $1;`, [Number(viajeId)]);
  if (!rows.length) throw new Error('Viaje no encontrado');
  return rows[0].semana;
}

async function patchViaje(id, { fecha, zona_id, cuadrilla_id, vehiculo_id, nombre, orden }) {
  const viajeId = Number(id);
  const semana = await getViajeSemana(viajeId);
  await assertSemanaAbierta(semana);

  const sets = [];
  const params = [viajeId];
  if (fecha !== undefined) {
    const fechaStr = String(fecha || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) throw new Error('fecha inválida');
    const chk = await pool.query(`select to_char($1::date, 'IYYY-"W"IW') as semana;`, [fechaStr]);
    if (chk.rows?.[0]?.semana !== semana) throw new Error(`La fecha ${fechaStr} no cae dentro de la semana ${semana}`);
    params.push(fechaStr); sets.push(`fecha = $${params.length}`);
  }
  if (zona_id !== undefined) { params.push(zona_id || null); sets.push(`zona_id = $${params.length}`); }
  if (cuadrilla_id !== undefined) { params.push(cuadrilla_id || null); sets.push(`cuadrilla_id = $${params.length}`); }
  if (vehiculo_id !== undefined) { params.push(vehiculo_id || null); sets.push(`vehiculo_id = $${params.length}`); }
  if (nombre !== undefined) { params.push(nombre || null); sets.push(`nombre = $${params.length}`); }
  if (orden !== undefined) { params.push(orden ?? 0); sets.push(`orden = $${params.length}`); }
  if (!sets.length) throw new Error('Nada para actualizar');
  sets.push('updated_at = now()');

  await pool.query(`update public.servicio_tecnico_viajes set ${sets.join(', ')} where id = $1;`, params);
  return getSemanaDetalle(semana);
}

async function borrarViaje(id) {
  const viajeId = Number(id);
  const semana = await getViajeSemana(viajeId);
  await assertSemanaAbierta(semana);
  await pool.query(`delete from public.servicio_tecnico_viajes where id = $1;`, [viajeId]);
  return getSemanaDetalle(semana);
}

async function asignarItem(viajeId, { tipo, solicitud_id, quote_id }) {
  const vId = Number(viajeId);
  const tipoStr = String(tipo || '').trim();
  if (!['solicitud', 'medicion'].includes(tipoStr)) throw new Error('tipo debe ser solicitud o medicion');

  const viajeQ = await pool.query(`select id, semana from public.servicio_tecnico_viajes where id = $1;`, [vId]);
  if (!viajeQ.rowCount) throw new Error('Viaje no encontrado');
  const semana = viajeQ.rows[0].semana;
  await assertSemanaAbierta(semana);

  const detalle = await getSemanaDetalle(semana);
  const item = tipoStr === 'solicitud'
    ? detalle.items.find((it) => it.tipo === 'solicitud' && it.solicitud_id === Number(solicitud_id))
    : detalle.items.find((it) => it.tipo === 'medicion' && it.quote_id === quote_id);
  if (!item) throw new Error('Ese item no está pendiente en esta semana');

  // Nuevo va al final de la columna (orden de ruta), no a una posición
  // arbitraria - mismo criterio que Logística.
  const maxOrdenQ = await pool.query(
    `select coalesce(max(orden), -1) + 1 as next_orden from public.servicio_tecnico_viaje_items where viaje_id = $1;`,
    [vId]
  );
  const nextOrden = maxOrdenQ.rows[0].next_orden;

  await pool.query(
    `insert into public.servicio_tecnico_viaje_items (viaje_id, tipo, solicitud_id, quote_id, orden)
     values ($1, $2, $3, $4, $5)
     on conflict (${tipoStr === 'solicitud' ? 'solicitud_id' : 'quote_id'}) do update set viaje_id = excluded.viaje_id, orden = excluded.orden;`,
    [vId, tipoStr, tipoStr === 'solicitud' ? Number(solicitud_id) : null, tipoStr === 'medicion' ? quote_id : null, nextOrden]
  );

  // Si era una solicitud, reflejar en su estado (informativo).
  if (tipoStr === 'solicitud') {
    await pool.query(`update public.servicio_tecnico_solicitudes set estado = 'planificado', updated_at = now() where id = $1 and estado = 'pendiente';`, [Number(solicitud_id)]);
  }

  return getSemanaDetalle(semana);
}

// Reordena los items DENTRO de un mismo viaje - primero el que queda arriba
// en la columna. items: [{ tipo, solicitud_id, quote_id }, ...] en el orden
// final deseado. Mismo criterio que logisticaViajesDb.reordenarViaje.
async function reordenarViaje(viajeId, items) {
  const vId = Number(viajeId);
  if (!Array.isArray(items) || !items.length) throw new Error('Falta la lista ordenada de items');

  const semana = await getViajeSemana(vId);
  await assertSemanaAbierta(semana);

  await withTx(async (client) => {
    for (let i = 0; i < items.length; i++) {
      const { tipo, solicitud_id, quote_id } = items[i] || {};
      const tipoStr = String(tipo || '').trim();
      if (tipoStr === 'solicitud' && solicitud_id) {
        await client.query(`update public.servicio_tecnico_viaje_items set orden = $1 where viaje_id = $2 and tipo = 'solicitud' and solicitud_id = $3;`, [i, vId, Number(solicitud_id)]);
      } else if (tipoStr === 'medicion' && quote_id) {
        await client.query(`update public.servicio_tecnico_viaje_items set orden = $1 where viaje_id = $2 and tipo = 'medicion' and quote_id = $3;`, [i, vId, quote_id]);
      }
    }
  });

  return getSemanaDetalle(semana);
}

async function desasignarItem(viajeId, tipo, itemId) {
  const vId = Number(viajeId);
  const tipoStr = String(tipo || '').trim();
  if (!['solicitud', 'medicion'].includes(tipoStr)) throw new Error('tipo debe ser solicitud o medicion');
  const semana = await getViajeSemana(vId);
  await assertSemanaAbierta(semana);

  if (tipoStr === 'solicitud') {
    await pool.query(`delete from public.servicio_tecnico_viaje_items where viaje_id = $1 and tipo = 'solicitud' and solicitud_id = $2;`, [vId, Number(itemId)]);
  } else {
    await pool.query(`delete from public.servicio_tecnico_viaje_items where viaje_id = $1 and tipo = 'medicion' and quote_id = $2;`, [vId, itemId]);
  }
  return getSemanaDetalle(semana);
}

async function cerrarSemana(semana, cerradaBy) {
  const counts = await getSemanaCounts(semana);
  if (counts.total - counts.asignados > 0) throw new Error(`Todavía faltan ${counts.total - counts.asignados} item(s) por asignar a un viaje`);
  await pool.query(
    `insert into public.servicio_tecnico_semanas (semana, cerrada, cerrada_at, cerrada_by)
     values ($1, true, now(), $2)
     on conflict (semana) do update set cerrada = true, cerrada_at = now(), cerrada_by = excluded.cerrada_by, updated_at = now();`,
    [semana, cerradaBy || null]
  );
  return getSemanaDetalle(semana);
}
async function reabrirSemana(semana) {
  await pool.query(
    `insert into public.servicio_tecnico_semanas (semana, cerrada) values ($1, false)
     on conflict (semana) do update set cerrada = false, cerrada_at = null, updated_at = now();`,
    [semana]
  );
  return getSemanaDetalle(semana);
}

module.exports = {
  listZonas,
  listVehiculos, createVehiculo, updateVehiculo, deleteVehiculo,
  listCuadrillas, createCuadrilla, updateCuadrilla, deleteCuadrilla, setCuadrillaMiembros,
  getConfig,
  getSemanas, getSemanaDetalle,
  crearViaje, patchViaje, borrarViaje,
  asignarItem, desasignarItem, reordenarViaje,
  cerrarSemana, reabrirSemana,
};

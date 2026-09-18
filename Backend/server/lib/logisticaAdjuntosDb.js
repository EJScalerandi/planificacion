// lib/logisticaAdjuntosDb.js
//
// Metadata de los adjuntos (el archivo en sí vive en Supabase Storage, ver
// logisticaAdjuntosStorage.js) - cada fila cuelga de un viaje O de un NV (no
// necesariamente los dos), según dónde lo haya subido el usuario: "a las
// rutas y/o los portones" - un documento de un cliente puntual (DNI, un
// certificado que pide su country) va atado al NV; algo del viaje entero
// (ej. un manifiesto) va atado al viaje.
//
// Además, catálogo de adjuntos POR INTEGRANTE de cuadrilla (ej. su DNI) -
// se sube UNA vez (logistica_adjuntos_miembro) y de ahí se puede "habilitar"
// para un viaje y/o NV sin volver a subirlo: la fila habilitada vive en la
// MISMA tabla logistica_adjuntos, con origen_miembro_id apuntando al
// catálogo y el MISMO storage_path (no duplica el archivo real). Por eso
// borrarAdjunto no borra el storage si la fila vino del catálogo - el
// archivo lo sigue necesitando el catálogo (y cualquier otra habilitación).
const { pool } = require('../db');

async function listAdjuntos({ viaje_id, nv }) {
  const conds = [];
  const params = [];
  if (viaje_id != null) { params.push(Number(viaje_id)); conds.push(`viaje_id = $${params.length}`); }
  if (nv != null) { params.push(Number(nv)); conds.push(`nv = $${params.length}`); }
  if (!conds.length) throw new Error('Falta viaje_id o nv');
  const { rows } = await pool.query(
    `select id, viaje_id, nv, nombre_archivo, descripcion, tipo_mime, tamano_bytes, storage_path, subido_por, created_at, origen_miembro_id
       from public.logistica_adjuntos
      where ${conds.join(' or ')}
      order by created_at desc;`,
    params
  );
  return rows;
}

async function crearAdjunto({ viaje_id, nv, nombre_archivo, descripcion, tipo_mime, tamano_bytes, storage_path, subido_por }) {
  if (viaje_id == null && nv == null) throw new Error('Falta viaje_id o nv');
  const { rows } = await pool.query(
    `insert into public.logistica_adjuntos
       (viaje_id, nv, nombre_archivo, descripcion, tipo_mime, tamano_bytes, storage_path, subido_por)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     returning id, viaje_id, nv, nombre_archivo, descripcion, tipo_mime, tamano_bytes, storage_path, subido_por, created_at, origen_miembro_id;`,
    [viaje_id ?? null, nv ?? null, nombre_archivo, descripcion ?? null, tipo_mime, tamano_bytes ?? null, storage_path, subido_por ?? null]
  );
  return rows[0];
}

// Devuelve el storage_path para poder borrar el archivo real después SOLO
// si esta fila era dueña exclusiva del archivo (no vino de un catálogo de
// miembro) - si origen_miembro_id está seteado, el archivo lo sigue
// necesitando el catálogo, no se toca Storage.
async function borrarAdjunto(id) {
  const { rows } = await pool.query(
    `delete from public.logistica_adjuntos where id = $1 returning storage_path, origen_miembro_id;`,
    [Number(id)]
  );
  const row = rows[0];
  if (!row || row.origen_miembro_id != null) return null;
  return row.storage_path || null;
}

// ===========================================================================
// Catálogo por integrante de cuadrilla (ej. DNI) - se sube una vez.
// ===========================================================================

async function listAdjuntosMiembro(qcUserId) {
  const { rows } = await pool.query(
    `select id, qc_user_id, nombre_archivo, descripcion, tipo_mime, tamano_bytes, storage_path, subido_por, created_at
       from public.logistica_adjuntos_miembro
      where qc_user_id = $1
      order by created_at desc;`,
    [Number(qcUserId)]
  );
  return rows;
}

// Para la sección "DNI de la cuadrilla" del modal de adjuntos de un viaje -
// un solo query para TODOS los integrantes de esa cuadrilla, no uno por
// persona.
async function listAdjuntosMiembroPorCuadrilla(cuadrillaId) {
  const { rows } = await pool.query(
    `select cm.qc_user_id, u.name as qc_user_name,
            am.id, am.nombre_archivo, am.descripcion, am.tipo_mime, am.tamano_bytes, am.storage_path, am.created_at
       from public.logistica_cuadrilla_miembros cm
       join public.qc_users u on u.id = cm.qc_user_id
       left join public.logistica_adjuntos_miembro am on am.qc_user_id = cm.qc_user_id
      where cm.cuadrilla_id = $1
      order by u.name asc, am.created_at desc;`,
    [Number(cuadrillaId)]
  );
  const porMiembro = new Map();
  for (const r of rows) {
    if (!porMiembro.has(r.qc_user_id)) porMiembro.set(r.qc_user_id, { qc_user_id: r.qc_user_id, qc_user_name: r.qc_user_name, adjuntos: [] });
    if (r.id != null) {
      porMiembro.get(r.qc_user_id).adjuntos.push({
        id: r.id, nombre_archivo: r.nombre_archivo, descripcion: r.descripcion,
        tipo_mime: r.tipo_mime, tamano_bytes: r.tamano_bytes, storage_path: r.storage_path, created_at: r.created_at,
      });
    }
  }
  return Array.from(porMiembro.values());
}

async function crearAdjuntoMiembro({ qc_user_id, nombre_archivo, descripcion, tipo_mime, tamano_bytes, storage_path, subido_por }) {
  const { rows } = await pool.query(
    `insert into public.logistica_adjuntos_miembro
       (qc_user_id, nombre_archivo, descripcion, tipo_mime, tamano_bytes, storage_path, subido_por)
     values ($1,$2,$3,$4,$5,$6,$7)
     returning id, qc_user_id, nombre_archivo, descripcion, tipo_mime, tamano_bytes, storage_path, subido_por, created_at;`,
    [Number(qc_user_id), nombre_archivo, descripcion ?? null, tipo_mime, tamano_bytes ?? null, storage_path, subido_por ?? null]
  );
  return rows[0];
}

// Acá SÍ se borra el storage siempre - es el dueño del archivo. Las
// habilitaciones (logistica_adjuntos.origen_miembro_id) se van solas por
// ON DELETE CASCADE.
async function borrarAdjuntoMiembro(id) {
  const { rows } = await pool.query(
    `delete from public.logistica_adjuntos_miembro where id = $1 returning storage_path;`,
    [Number(id)]
  );
  return rows[0]?.storage_path || null;
}

async function getAdjuntoMiembro(id) {
  const { rows } = await pool.query(`select * from public.logistica_adjuntos_miembro where id = $1;`, [Number(id)]);
  return rows[0] || null;
}

// "Habilitar" un adjunto del catálogo de un integrante para un viaje y/o un
// NV - copia la metadata (mismo storage_path, no re-sube nada) a
// logistica_adjuntos con origen_miembro_id seteado. Evita duplicar si ya
// estaba habilitado para ese mismo destino exacto.
async function habilitarAdjuntoMiembro({ origen_miembro_id, viaje_id, nv, habilitado_por }) {
  if (viaje_id == null && nv == null) throw new Error('Falta viaje_id o nv');
  const catalogo = await getAdjuntoMiembro(origen_miembro_id);
  if (!catalogo) throw new Error('Ese adjunto de la cuadrilla no existe');

  const yaExiste = await pool.query(
    `select id from public.logistica_adjuntos
      where origen_miembro_id = $1
        and viaje_id is not distinct from $2
        and nv is not distinct from $3
      limit 1;`,
    [Number(origen_miembro_id), viaje_id ?? null, nv ?? null]
  );
  if (yaExiste.rowCount) throw new Error('Ese DNI ya está habilitado para este destino');

  const { rows } = await pool.query(
    `insert into public.logistica_adjuntos
       (viaje_id, nv, nombre_archivo, descripcion, tipo_mime, tamano_bytes, storage_path, subido_por, origen_miembro_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     returning id, viaje_id, nv, nombre_archivo, descripcion, tipo_mime, tamano_bytes, storage_path, subido_por, created_at, origen_miembro_id;`,
    [viaje_id ?? null, nv ?? null, catalogo.nombre_archivo, catalogo.descripcion, catalogo.tipo_mime, catalogo.tamano_bytes, catalogo.storage_path, habilitado_por ?? null, Number(origen_miembro_id)]
  );
  return rows[0];
}

// ===========================================================================
// Foto de perfil (persona) y foto de vehículo - una sola cada uno (no un
// catálogo como el DNI), para el collage del mensaje automático de
// WhatsApp "en camino" (logisticaWhatsapp.js). Reemplazar sube la nueva y
// borra la vieja de Storage (no queda basura acumulada).
// ===========================================================================

async function getFotoQcUser(qcUserId) {
  const { rows } = await pool.query(`select foto_storage_path from public.qc_users where id = $1;`, [Number(qcUserId)]);
  return rows[0]?.foto_storage_path || null;
}
async function setFotoQcUser(qcUserId, path) {
  await pool.query(`update public.qc_users set foto_storage_path = $2 where id = $1;`, [Number(qcUserId), path]);
}

async function getFotoVehiculo(vehiculoId) {
  const { rows } = await pool.query(`select foto_storage_path from public.logistica_vehiculos where id = $1;`, [Number(vehiculoId)]);
  return rows[0]?.foto_storage_path || null;
}
async function setFotoVehiculo(vehiculoId, path) {
  await pool.query(`update public.logistica_vehiculos set foto_storage_path = $2 where id = $1;`, [Number(vehiculoId), path]);
}

module.exports = {
  listAdjuntos, crearAdjunto, borrarAdjunto,
  listAdjuntosMiembro, listAdjuntosMiembroPorCuadrilla, crearAdjuntoMiembro, borrarAdjuntoMiembro, getAdjuntoMiembro,
  habilitarAdjuntoMiembro,
  getFotoQcUser, setFotoQcUser, getFotoVehiculo, setFotoVehiculo,
};

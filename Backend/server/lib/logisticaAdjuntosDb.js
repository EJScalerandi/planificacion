// lib/logisticaAdjuntosDb.js
//
// Metadata de los adjuntos (el archivo en sí vive en Supabase Storage, ver
// logisticaAdjuntosStorage.js) - cada fila cuelga de un viaje O de un NV (no
// necesariamente los dos), según dónde lo haya subido el usuario: "a las
// rutas y/o los portones" - un documento de un cliente puntual (DNI, un
// certificado que pide su country) va atado al NV; algo del viaje entero
// (ej. un manifiesto) va atado al viaje.
const { pool } = require('../db');

async function listAdjuntos({ viaje_id, nv }) {
  const conds = [];
  const params = [];
  if (viaje_id != null) { params.push(Number(viaje_id)); conds.push(`viaje_id = $${params.length}`); }
  if (nv != null) { params.push(Number(nv)); conds.push(`nv = $${params.length}`); }
  if (!conds.length) throw new Error('Falta viaje_id o nv');
  const { rows } = await pool.query(
    `select id, viaje_id, nv, nombre_archivo, descripcion, tipo_mime, tamano_bytes, storage_path, subido_por, created_at
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
     returning id, viaje_id, nv, nombre_archivo, descripcion, tipo_mime, tamano_bytes, storage_path, subido_por, created_at;`,
    [viaje_id ?? null, nv ?? null, nombre_archivo, descripcion ?? null, tipo_mime, tamano_bytes ?? null, storage_path, subido_por ?? null]
  );
  return rows[0];
}

// Devuelve el storage_path para poder borrar el archivo real después (el
// llamador se encarga - acá solo se toca la base).
async function borrarAdjunto(id) {
  const { rows } = await pool.query(
    `delete from public.logistica_adjuntos where id = $1 returning storage_path;`,
    [Number(id)]
  );
  return rows[0]?.storage_path || null;
}

module.exports = { listAdjuntos, crearAdjunto, borrarAdjunto };

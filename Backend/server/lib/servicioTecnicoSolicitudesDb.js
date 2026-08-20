// lib/servicioTecnicoSolicitudesDb.js
//
// Solicitudes de Servicio Técnico (Fase 0 del módulo de Técnica): el paso
// ANTES de generar una orden de producción (public.st_ordenes, ver
// routes/admin/servicioTecnico.js) - acá Diego carga el pedido, con o sin
// NV/NP vinculado, arma historial (admin/técnico) y organiza los viajes.
const { pool } = require('../db');

// ===========================================================================
// Info de un NV/NP (para autocompletar al cargar una solicitud, y para
// mostrar como referencia en el detalle - no se duplica todo en la
// solicitud, solo los campos identificatorios que snapshoteamos al vincular).
// Mismo patrón prefijo-agnóstico (^[A-Za-z]* + número) que ya usan
// logisticaMapa.js, routes/external/ia.js y routes/public/portones.js.
// ===========================================================================
async function resolverInfoNv(nv) {
  const nNv = Number(nv);
  if (!Number.isInteger(nNv)) return null;

  const { rows } = await pool.query(
    `
    with base as (
      select p.*, pv.data as pv_data
      from public.portones p
      left join public.preproduccion_valores pv on pv.nv = p.nv and pv.nv_tipo = 'NV'
      where p.nv = $1
      order by p.nlista asc
      limit 1
    )
    select
      b.nv,
      b.sistema,
      to_char(b.fecha_nv,   'YYYY-MM-DD') as fecha_venta,
      to_char(b.fecha_med,  'YYYY-MM-DD') as fecha_medicion,
      to_char(b.fecha_prod, 'YYYY-MM-DD') as fecha_produccion,
      b.despacho as despacho_estado,
      coalesce(b.pv_data->>'Nombre', b.pv_data->>'nombre', sq.cliente_nombre) as nombre_cliente,
      coalesce(b.pv_data->>'RazSoc', b.pv_data->>'Distribuidor', b.pv_data->>'distribuidor') as distribuidor,
      coalesce(b.pv_data->>'Alto', '') as alto,
      coalesce(b.pv_data->>'Ancho', '') as ancho,
      coalesce(sq.maps_url, b.pv_data->>'logistica_maps_url') as maps_url,
      coalesce(sq.telefono, b.pv_data->>'Celular', b.pv_data->>'celular') as telefono,
      sq.direccion
    from base b
    left join lateral (
      select
        q.end_customer->>'name'     as cliente_nombre,
        q.end_customer->>'maps_url' as maps_url,
        q.end_customer->>'phone'    as telefono,
        nullif(trim(both ' - ' from concat_ws(' - ', q.end_customer->>'address', q.end_customer->>'city')), '') as direccion
      from public.presupuestador_quotes q
      where q.quote_kind = 'original'
        and (q.final_sale_order_name  ~ ('^[A-Za-z]*' || b.nv::text || '$')
             or q.odoo_sale_order_name ~ ('^[A-Za-z]*' || b.nv::text || '$'))
      order by q.id desc
      limit 1
    ) sq on true;
    `,
    [nNv]
  );

  return rows[0] || null;
}

// ===========================================================================
// CRUD de solicitudes
// ===========================================================================

const SOLICITUD_COLS = `
  id, nv, nombre_cliente, distribuidor, direccion, maps_url, telefono,
  to_char(fecha_venta, 'YYYY-MM-DD') as fecha_venta,
  descripcion, estado, creado_por, created_at, updated_at
`;

async function listSolicitudes({ estado } = {}) {
  const params = [];
  let where = '';
  if (estado) { params.push(estado); where = `where estado = $${params.length}`; }
  const { rows } = await pool.query(
    `select ${SOLICITUD_COLS} from public.servicio_tecnico_solicitudes ${where} order by created_at desc;`,
    params
  );
  return rows;
}

async function getSolicitud(id) {
  const { rows } = await pool.query(
    `select ${SOLICITUD_COLS} from public.servicio_tecnico_solicitudes where id = $1;`,
    [Number(id)]
  );
  if (!rows.length) return null;
  const [historial, imagenes] = await Promise.all([
    pool.query(`select id, tipo, autor, texto, created_at from public.servicio_tecnico_historial where solicitud_id = $1 order by created_at asc;`, [Number(id)]),
    pool.query(`select id, historial_id, url, nombre_archivo, subido_por, created_at from public.servicio_tecnico_imagenes where solicitud_id = $1 order by created_at asc;`, [Number(id)]),
  ]);
  return { ...rows[0], historial: historial.rows, imagenes: imagenes.rows };
}

async function createSolicitud({ nv, nombre_cliente, distribuidor, direccion, maps_url, telefono, descripcion, creado_por }) {
  const descripcionStr = String(descripcion || '').trim();
  if (!descripcionStr) throw new Error('Falta la descripción');

  let nvNum = null;
  let datosNv = null;
  if (nv !== undefined && nv !== null && String(nv).trim() !== '') {
    nvNum = Number(nv);
    if (!Number.isInteger(nvNum)) throw new Error('nv inválido');
    datosNv = await resolverInfoNv(nvNum);
  }

  const { rows } = await pool.query(
    `insert into public.servicio_tecnico_solicitudes
       (nv, nombre_cliente, distribuidor, direccion, maps_url, telefono, fecha_venta, descripcion, estado, creado_por)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'pendiente', $9)
     returning ${SOLICITUD_COLS};`,
    [
      nvNum,
      nombre_cliente || datosNv?.nombre_cliente || null,
      distribuidor || datosNv?.distribuidor || null,
      direccion || datosNv?.direccion || null,
      maps_url || datosNv?.maps_url || null,
      telefono || datosNv?.telefono || null,
      datosNv?.fecha_venta || null,
      descripcionStr,
      creado_por || null,
    ]
  );
  return rows[0];
}

async function updateSolicitud(id, patch) {
  const fields = ['nombre_cliente', 'distribuidor', 'direccion', 'maps_url', 'telefono', 'descripcion', 'estado'];
  const sets = [];
  const params = [Number(id)];
  for (const f of fields) {
    if (patch[f] === undefined) continue;
    params.push(patch[f]);
    sets.push(`${f} = $${params.length}`);
  }
  if (!sets.length) throw new Error('Nada para actualizar');
  sets.push('updated_at = now()');
  const { rows, rowCount } = await pool.query(
    `update public.servicio_tecnico_solicitudes set ${sets.join(', ')} where id = $1 returning ${SOLICITUD_COLS};`,
    params
  );
  if (!rowCount) throw new Error('Solicitud no encontrada');
  return rows[0];
}

async function deleteSolicitud(id) {
  await pool.query(`delete from public.servicio_tecnico_solicitudes where id = $1;`, [Number(id)]);
}

async function agregarHistorial(solicitudId, { tipo, autor, texto }) {
  const tipoStr = String(tipo || '').trim();
  if (!['admin', 'tecnico'].includes(tipoStr)) throw new Error("tipo debe ser 'admin' o 'tecnico'");
  const textoStr = String(texto || '').trim();
  if (!textoStr) throw new Error('Falta el texto');
  const { rows } = await pool.query(
    `insert into public.servicio_tecnico_historial (solicitud_id, tipo, autor, texto)
     values ($1, $2, $3, $4)
     returning id, tipo, autor, texto, created_at;`,
    [Number(solicitudId), tipoStr, autor || null, textoStr]
  );
  return rows[0];
}

// ===========================================================================
// Portones pendientes de medición: derivado de datos existentes (igual que
// Planificación de Fechas deriva de fecha_salida_imput/fecha_llegada_imput),
// no es una entidad nueva.
// ===========================================================================
async function listPortonesPendientesMedicion() {
  const { rows } = await pool.query(
    `
    with base as (
      select p.*, pv.data as pv_data
      from public.portones p
      left join public.preproduccion_valores pv on pv.nv = p.nv and pv.nv_tipo = 'NV'
      where p.parent_id is null
    )
    select distinct on (nv)
      nv,
      coalesce(pv_data->>'Nombre', '') as nombre_cliente,
      coalesce(pv_data->>'RazSoc', '') as distribuidor,
      to_char(fecha_nv, 'YYYY-MM-DD') as fecha_venta
    from base
    where fecha_med is null
    order by nv, nlista asc;
    `
  );
  return rows;
}

module.exports = {
  resolverInfoNv,
  listSolicitudes, getSolicitud, createSolicitud, updateSolicitud, deleteSolicitud,
  agregarHistorial,
  listPortonesPendientesMedicion,
};

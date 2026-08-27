// lib/logisticaMensajeViaje.js
//
// Arma el mensaje de texto (formato WhatsApp) que Logística le manda a la
// cuadrilla para un viaje - mientras no tengan la info directo en una app
// propia (pedido explícito del usuario, transitorio). Junta vehículo +
// integrantes de la cuadrilla, y por cada parada (NV agrupados por mismo
// cliente+dirección, ej: dos NV del mismo cliente que se instalan juntos) el
// contacto, tipo (DESPACHO / INS + posición si es instalación), localidad,
// dirección y el link de mapa - toda data ya existente (presupuestador_quotes.
// end_customer + preproduccion_valores.INSTALACION_Posicion/RazSoc), sin
// inventar nada. Es un BORRADOR: el usuario lo revisa/ajusta antes de
// mandarlo (hay datos, como el teléfono del distribuidor o notas puntuales
// de la parada, que no están sistematizados en ningún lado).
const { pool } = require('../db');

const DIAS = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];

function pad2(n) { return String(n).padStart(2, '0'); }

function formatEncabezado(fechaIso) {
  const d = new Date(`${fechaIso}T00:00:00Z`);
  const dia = DIAS[d.getUTCDay()];
  return `${dia} ${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)} ⬇️`;
}

function normalizaPosicion(pos) {
  const p = String(pos || '').trim().toUpperCase();
  if (p === 'ADENTRO') return 'DENTRO';
  return p || null;
}

async function fetchViaje(viajeId) {
  const { rows } = await pool.query(
    `select v.id, v.semana, to_char(v.fecha,'YYYY-MM-DD') as fecha, v.nombre,
       v.cuadrilla_id, cu.nombre as cuadrilla_nombre,
       v.vehiculo_id, ve.nombre as vehiculo_nombre
     from public.logistica_viajes v
     left join public.logistica_cuadrillas cu on cu.id = v.cuadrilla_id
     left join public.logistica_vehiculos ve on ve.id = v.vehiculo_id
     where v.id = $1;`,
    [Number(viajeId)]
  );
  return rows[0] || null;
}

async function fetchMiembros(cuadrillaId) {
  if (!cuadrillaId) return [];
  const { rows } = await pool.query(
    `select u.name from public.logistica_cuadrilla_miembros cm
     join public.qc_users u on u.id = cm.qc_user_id
     where cm.cuadrilla_id = $1 order by u.name asc;`,
    [cuadrillaId]
  );
  return rows.map((r) => r.name);
}

async function fetchItems(viajeId) {
  const { rows } = await pool.query(
    `select p.nv, vp.tipo, vp.orden
     from public.logistica_viaje_portones vp
     join public.portones p on p.id = vp.porton_id
     where vp.viaje_id = $1
     order by vp.orden asc, p.nv asc;`,
    [Number(viajeId)]
  );
  return rows;
}

// Igual patrón prefijo-agnóstico que ya usan logisticaMapa.js y
// routes/public/portones.js.
async function fetchDatosPorNv(nvs) {
  if (!nvs.length) return new Map();
  const { rows } = await pool.query(
    `
    with base as (
      select distinct on (p.nv) p.nv, pv.data as pv_data
      from public.portones p
      left join public.preproduccion_valores pv on pv.nv = p.nv and pv.nv_tipo = 'NV'
      where p.nv = any($1::int[])
      order by p.nv, p.nlista asc
    )
    select
      b.nv,
      nullif(trim(both ' ' from coalesce(b.pv_data->>'RazSoc', b.pv_data->>'distribuidor_nombre', '')), '') as distribuidor,
      nullif(trim(both ' ' from coalesce(b.pv_data->>'INSTALACION_Posicion', '')), '') as posicion,
      sq.nombre_cliente, sq.telefono, sq.direccion, sq.localidad, sq.maps_url
    from base b
    left join lateral (
      select
        q.end_customer->>'name'     as nombre_cliente,
        q.end_customer->>'phone'    as telefono,
        q.end_customer->>'address'  as direccion,
        q.end_customer->>'city'     as localidad,
        q.end_customer->>'maps_url' as maps_url
      from public.presupuestador_quotes q
      where q.quote_kind = 'original'
        and (q.final_sale_order_name  ~ ('^[A-Za-z]*' || b.nv::text || '$')
             or q.odoo_sale_order_name ~ ('^[A-Za-z]*' || b.nv::text || '$'))
      order by q.id desc
      limit 1
    ) sq on true;
    `,
    [nvs]
  );
  return new Map(rows.map((r) => [r.nv, r]));
}

/**
 * @param {number} viajeId
 * @returns {Promise<string>} el mensaje de texto listo para copiar/editar
 */
async function buildMensajeViaje(viajeId) {
  const viaje = await fetchViaje(viajeId);
  if (!viaje) throw new Error('Viaje no encontrado');

  const [miembros, items] = await Promise.all([
    fetchMiembros(viaje.cuadrilla_id),
    fetchItems(viajeId),
  ]);
  if (!items.length) throw new Error('El viaje no tiene portones asignados todavía');

  const nvs = Array.from(new Set(items.map((it) => it.nv)));
  const datosPorNv = await fetchDatosPorNv(nvs);

  // Etiqueta del encabezado: si todos los items del viaje son del mismo
  // tipo lo dice ("DESPACHO"/"INSTALACIÓN"); si es mixto, no inventa una
  // etiqueta ambigua, deja solo el vehículo.
  const tipos = new Set(items.map((it) => it.tipo));
  const etiqueta = tipos.size === 1 ? (tipos.has('despacho') ? 'DESPACHO' : 'INSTALACIÓN') : '';

  const lineas = [];
  lineas.push(formatEncabezado(viaje.fecha));
  lineas.push('');
  lineas.push(`${(viaje.vehiculo_nombre || viaje.nombre || `Viaje #${viaje.id}`).toUpperCase()}${etiqueta ? ` ${etiqueta}` : ''}`);
  for (const m of miembros) lineas.push(m);
  lineas.push('');

  // Agrupa en una sola "parada" los items consecutivos (en orden de ruta)
  // que comparten cliente+dirección - ej: dos NV del mismo cliente que se
  // instalan juntos en una sola visita.
  const paradas = [];
  for (const it of items) {
    const d = datosPorNv.get(it.nv) || {};
    const clave = `${d.nombre_cliente || ''}::${d.direccion || ''}`;
    const ultima = paradas[paradas.length - 1];
    if (ultima && ultima.clave === clave) ultima.items.push({ ...it, ...d });
    else paradas.push({ clave, datos: d, items: [{ ...it, ...d }] });
  }

  for (const parada of paradas) {
    const d = parada.datos;
    lineas.push(`#${d.nombre_cliente || 'Cliente sin nombre'}${d.telefono ? ` ${d.telefono}` : ''}`);
    if (d.distribuidor) lineas.push(`Distribuidor: ${d.distribuidor}`);
    for (const it of parada.items) {
      const tipoLabel = it.tipo === 'despacho' ? 'DESPACHO' : `INS ${normalizaPosicion(it.posicion) || ''}`.trim();
      lineas.push(`NV ${it.nv} ➡️${tipoLabel}`);
    }
    lineas.push(`Localidad: ${d.localidad || '—'}`);
    lineas.push(`Dirección: ${d.direccion || '—'}`);
    lineas.push('Ubicación:');
    lineas.push(d.maps_url || '(sin link cargado)');
    lineas.push('');
  }

  return lineas.join('\n').trimEnd();
}

module.exports = { buildMensajeViaje };

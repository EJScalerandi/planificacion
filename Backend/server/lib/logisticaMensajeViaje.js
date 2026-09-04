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

// Paradas que no son un portón (ej. alojamiento de la cuadrilla) - conviven
// en el mismo `orden` que los portones, ver logisticaParadasExtra.js.
async function fetchParadasExtra(viajeId) {
  const { rows } = await pool.query(
    `select vp.orden, pe.nombre, pe.maps_url
       from public.logistica_viaje_paradas_extra vp
       join public.logistica_puntos_extra pe on pe.id = vp.punto_extra_id
      where vp.viaje_id = $1
      order by vp.orden asc;`,
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
      -- presupuestador_quotes.end_customer es la fuente preferida (más
      -- completa y estructurada), pero NV viejos/sin presupuesto asociado
      -- no matchean ninguna quote - ahí cae al snapshot que ya vive en
      -- preproduccion_valores (cargado a mano o importado en su momento),
      -- mismo patrón que resolverInfoNv del módulo de Servicio Técnico.
      nullif(trim(both ' ' from coalesce(nullif(sq.nombre_cliente,''), b.pv_data->>'cliente_nombre', b.pv_data->>'Nombre', '')), '') as nombre_cliente,
      nullif(trim(both ' ' from coalesce(nullif(sq.telefono,''), b.pv_data->>'cliente_telefono', '')), '') as telefono,
      nullif(trim(both ' ' from coalesce(nullif(sq.direccion,''), b.pv_data->>'cliente_direccion', b.pv_data->>'Direccion', b.pv_data->>'Dirección', '')), '') as direccion,
      nullif(trim(both ' ' from coalesce(nullif(sq.localidad,''), b.pv_data->>'cliente_localidad', '')), '') as localidad,
      nullif(trim(both ' ' from coalesce(nullif(sq.maps_url,''), b.pv_data->>'cliente_maps_url', b.pv_data->>'logistica_maps_url', b.pv_data->>'pp_direccion_url', '')), '') as maps_url,
      -- Datos técnicos del portón (pedido puntual de /despacho_v2, para el
      -- detalle del NV) - mismas claves que ya usa PreproduccionValoresTable.jsx
      -- ("Revestimiento" ahí en realidad muestra Sistema, no la clave literal
      -- "Revestimiento" que suele venir vacía) más MOTOR_Condicion
      -- (Automático/Manual, confirmado contra datos reales - no existía
      -- ningún campo así hasta ahora en el resto de la app).
      nullif(trim(both ' ' from coalesce(b.pv_data->>'Alto', '')), '') as alto,
      nullif(trim(both ' ' from coalesce(b.pv_data->>'Ancho', '')), '') as ancho,
      nullif(trim(both ' ' from b.pv_data->>'Sistema'), '') as revestimiento,
      nullif(trim(both ' ' from b.pv_data->>'Color_Sistema'), '') as color_revestimiento,
      nullif(trim(both ' ' from b.pv_data->>'MOTOR_Condicion'), '') as motor_condicion
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

  const [miembros, items, paradasExtra] = await Promise.all([
    fetchMiembros(viaje.cuadrilla_id),
    fetchItems(viajeId),
    fetchParadasExtra(viajeId),
  ]);
  if (!items.length && !paradasExtra.length) throw new Error('El viaje no tiene portones ni paradas asignadas todavía');

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

  // Une portones + paradas extra (ej. alojamiento) en UNA sola secuencia por
  // `orden` - mismo espacio numérico para ambos (logisticaParadasExtra.js) -
  // y agrupa en una sola "parada" los PORTONES consecutivos que comparten
  // cliente+dirección (ej: dos NV del mismo cliente que se instalan
  // juntos). Una parada extra nunca se agrupa con nada, es su propio bloque.
  const eventos = [
    ...items.map((it) => ({ orden: it.orden, porton: it })),
    ...paradasExtra.map((p) => ({ orden: p.orden, extra: p })),
  ].sort((a, b) => a.orden - b.orden);

  const paradas = [];
  for (const ev of eventos) {
    if (ev.extra) { paradas.push({ extra: ev.extra }); continue; }
    const it = ev.porton;
    const d = datosPorNv.get(it.nv) || {};
    // Sin cliente Y sin dirección conocidos, clave = null -> NUNCA agrupa
    // (si no, dos NV totalmente distintos que ambos "no matchean nada"
    // terminaban mezclados en un solo bloque "Cliente sin nombre").
    const clave = (d.nombre_cliente && d.direccion) ? `${d.nombre_cliente}::${d.direccion}` : null;
    const ultima = paradas[paradas.length - 1];
    if (clave && ultima && !ultima.extra && ultima.clave === clave) ultima.items.push({ ...it, ...d });
    else paradas.push({ clave, datos: d, items: [{ ...it, ...d }] });
  }

  for (const parada of paradas) {
    if (parada.extra) {
      lineas.push(`#${parada.extra.nombre}`);
      lineas.push('Ubicación:');
      lineas.push(parada.extra.maps_url || '(sin link cargado)');
      lineas.push('');
      continue;
    }
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

module.exports = { buildMensajeViaje, fetchViaje, fetchMiembros, fetchItems, fetchParadasExtra, fetchDatosPorNv };

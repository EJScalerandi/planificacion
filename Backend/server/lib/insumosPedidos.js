// Logica compartida entre las rutas publicas (tablets) y el scheduler de
// auto-cierre: crear/recuperar el pedido del dia de una seccion (con arrastre
// de pendientes "no disponible" del ultimo pedido cerrado), cargarlo con sus
// items, y cerrar pedidos vencidos.
const { isValidInsumosSeccion } = require('./insumosSecciones');

const AR_TZ = 'America/Argentina/Buenos_Aires';

// Fecha de "hoy" en horario Argentina, formato YYYY-MM-DD - no depende de en que
// TZ este corriendo el proceso Node (usa Intl con timeZone fijo).
function argentinaTodayStr() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: AR_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

async function findPedido(client, seccion, fecha) {
  const { rows } = await client.query(
    `select * from public.insumos_pedidos where seccion = $1 and fecha = $2 limit 1`,
    [seccion, fecha]
  );
  return rows[0] || null;
}

// Arrastra al pedido nuevo los items que el ultimo pedido CERRADO/CERRADO_VACIO
// de esa seccion tenga marcados no_disponible y todavia no consumidos - la
// cantidad arrastrada es lo pedido menos lo entregado (permite parcial).
async function carryOverPendientes(client, seccion, fecha, nuevoPedidoId) {
  const { rows: prevRows } = await client.query(
    `select id from public.insumos_pedidos
      where seccion = $1 and fecha < $2 and status in ('CERRADO','CERRADO_VACIO')
      order by fecha desc limit 1`,
    [seccion, fecha]
  );
  const prevPedidoId = prevRows[0]?.id;
  if (!prevPedidoId) return;

  const { rows: pendientes } = await client.query(
    `select * from public.insumos_pedido_items
      where pedido_id = $1 and no_disponible = true and carryover_consumed = false`,
    [prevPedidoId]
  );

  for (const item of pendientes) {
    const pendienteQty = Number(item.cantidad_pedida) - Number(item.cantidad_entregada || 0);
    if (!(pendienteQty > 0)) continue;
    await client.query(
      `insert into public.insumos_pedido_items
         (pedido_id, producto_odoo_id, producto_nombre, producto_codigo, unidad, categoria_odoo_id,
          cantidad_pedida, is_carryover, carried_over_from_item_id)
       values ($1,$2,$3,$4,$5,$6,$7,true,$8)
       on conflict (pedido_id, producto_odoo_id) do update set
         cantidad_pedida = public.insumos_pedido_items.cantidad_pedida + excluded.cantidad_pedida,
         is_carryover = true,
         carried_over_from_item_id = excluded.carried_over_from_item_id`,
      [
        nuevoPedidoId,
        item.producto_odoo_id,
        item.producto_nombre,
        item.producto_codigo,
        item.unidad,
        item.categoria_odoo_id,
        pendienteQty,
        item.id,
      ]
    );
    await client.query(`update public.insumos_pedido_items set carryover_consumed = true where id = $1`, [item.id]);
  }
}

async function getOrCreatePedidoDelDia(client, seccion, fecha) {
  const seccionStr = String(seccion || '').trim();
  if (!isValidInsumosSeccion(seccionStr)) throw new Error(`seccion invalida: ${seccionStr}`);

  let pedido = await findPedido(client, seccionStr, fecha);
  if (pedido) return pedido;

  const ins = await client.query(
    `insert into public.insumos_pedidos (seccion, fecha, status)
     values ($1, $2, 'ABIERTO')
     on conflict (seccion, fecha) do nothing
     returning *`,
    [seccionStr, fecha]
  );
  pedido = ins.rows[0];
  if (!pedido) {
    // Carrera: otro request ya lo creo justo ahora.
    return findPedido(client, seccionStr, fecha);
  }

  await carryOverPendientes(client, seccionStr, fecha, pedido.id);
  return pedido;
}

async function loadPedidoConItems(client, pedidoId) {
  const { rows: pedidoRows } = await client.query(
    `select p.*, u.name as confirmed_by_name
       from public.insumos_pedidos p
       left join public.qc_users u on u.id = p.confirmed_by_user_id
      where p.id = $1`,
    [pedidoId]
  );
  const pedido = pedidoRows[0];
  if (!pedido) return null;
  const { rows: items } = await client.query(
    `select * from public.insumos_pedido_items where pedido_id = $1 order by id asc`,
    [pedidoId]
  );
  return { ...pedido, items };
}

// Cierra pedidos vencidos: CONFIRMADO -> CERRADO (se conservan, como antes).
// ABIERTO -> se auto-envía como CERRADO si ya tiene items precargados (no
// hace falta que nadie lo haya confirmado a mano: si llegó el horario de
// cierre con algo cargado, se manda tal cual) o CERRADO_VACIO solo si de
// verdad no tiene ningún item (ahí no hay nada que enviar). Antes CUALQUIER
// ABIERTO cerraba vacío y perdía lo precargado sin importar el contenido -
// era el bug reportado.
// Los dias ESTRICTAMENTE anteriores a hoy siempre se cierran para TODAS las
// secciones (cubre fines de semana/feriados/caidas del server sin dejar
// pedidos viejos colgados). El dia de HOY solo se cierra para las secciones
// en seccionesVencidasHoy (ya paso SU horario de cierre configurado, ver
// insumosSeccionCierreDb.js) - las demas quedan abiertas hasta que llegue el
// suyo. Antes esto era un closeToday booleano global (un solo horario de
// corte para todas); ahora cada seccion tiene el suyo, por eso el llamador
// (insumosScheduler.js) resuelve la lista de secciones vencidas antes de
// llamar a esta funcion.
async function closeStaleOpenPedidos(client, hoyStr, { seccionesVencidasHoy = [] } = {}) {
  const hasVencidasHoy = Array.isArray(seccionesVencidasHoy) && seccionesVencidasHoy.length > 0;
  const condHoy = hasVencidasHoy ? `(p.fecha = $1 and p.seccion = any($2::text[]))` : 'false';
  const params = hasVencidasHoy ? [hoyStr, seccionesVencidasHoy] : [hoyStr];

  const confirmados = await client.query(
    `update public.insumos_pedidos p
        set status = 'CERRADO', closed_at = now()
      where p.status = 'CONFIRMADO' and (p.fecha < $1 or ${condHoy})
      returning p.id`,
    params
  );

  const abiertosConItems = await client.query(
    `update public.insumos_pedidos p
        set status = 'CERRADO', closed_at = now()
      where p.status = 'ABIERTO' and (p.fecha < $1 or ${condHoy})
        and exists (select 1 from public.insumos_pedido_items i where i.pedido_id = p.id)
      returning p.id`,
    params
  );

  const abiertosVacios = await client.query(
    `update public.insumos_pedidos p
        set status = 'CERRADO_VACIO', closed_at = now()
      where p.status = 'ABIERTO' and (p.fecha < $1 or ${condHoy})
        and not exists (select 1 from public.insumos_pedido_items i where i.pedido_id = p.id)
      returning p.id`,
    params
  );

  return {
    cerrados: confirmados.rows.length + abiertosConItems.rows.length,
    cerrados_vacios: abiertosVacios.rows.length,
  };
}

module.exports = { getOrCreatePedidoDelDia, loadPedidoConItems, closeStaleOpenPedidos, argentinaTodayStr, AR_TZ };

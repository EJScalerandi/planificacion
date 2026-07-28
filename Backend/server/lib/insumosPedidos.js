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

// Cierra CUALQUIER pedido con fecha <= hoy que siga ABIERTO (-> CERRADO_VACIO,
// se descartan los items sin confirmar) o CONFIRMADO (-> CERRADO, se conservan).
// No es "solo el de hoy" a proposito: cubre fines de semana/feriados/caidas del
// server sin dejar pedidos viejos colgados en un estado abierto.
async function closeStaleOpenPedidos(client, hoyStr) {
  const confirmados = await client.query(
    `update public.insumos_pedidos
        set status = 'CERRADO', closed_at = now()
      where fecha <= $1 and status = 'CONFIRMADO'
      returning id`,
    [hoyStr]
  );

  const abiertos = await client.query(
    `update public.insumos_pedidos
        set status = 'CERRADO_VACIO', closed_at = now()
      where fecha <= $1 and status = 'ABIERTO'
      returning id`,
    [hoyStr]
  );
  const abiertoIds = abiertos.rows.map((r) => r.id);
  if (abiertoIds.length) {
    await client.query(`delete from public.insumos_pedido_items where pedido_id = any($1::int[])`, [abiertoIds]);
  }

  return { cerrados: confirmados.rows.length, cerrados_vacios: abiertoIds.length };
}

module.exports = { getOrCreatePedidoDelDia, loadPedidoConItems, closeStaleOpenPedidos, argentinaTodayStr, AR_TZ };

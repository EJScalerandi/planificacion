// routes/admin/insumos.js — dashboard "Compras": ver/editar pedidos de insumos,
// historial, y config de categoria Odoo -> seccion.
const express = require('express');
const { adminAuth } = require('../../middleware/adminAuth');
const { pool } = require('../../db');
const { fetchOdooCategories, fetchOdooProductsByCategoryIds, invalidateInsumosOdooCache } = require('../../lib/insumosOdoo');
const { getCategoriaSeccionMap, setCategoriaSeccionMap } = require('../../insumosCategoriaSeccionDb');
const { isValidInsumosSeccion } = require('../../lib/insumosSecciones');
const { loadPedidoConItems } = require('../../lib/insumosPedidos');

const router = express.Router();

function normalizeScopes(scopesRaw) {
  if (Array.isArray(scopesRaw)) return scopesRaw.map((s) => String(s || '').trim()).filter(Boolean);
  if (typeof scopesRaw === 'string') return scopesRaw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  return [];
}
function hasScope(req, scope) {
  const scopes = normalizeScopes(req?.admin?.scopes ?? req?.admin?.scope ?? req?.admin?.permissions ?? []);
  return scopes.includes(scope);
}
function requireScope(scope) {
  return (req, res, next) => {
    if (!hasScope(req, scope)) return res.status(403).json({ error: `Requiere scope ${scope}` });
    return next();
  };
}

router.use(adminAuth, requireScope('compras:admin'));

// GET /admin/insumos/categorias?refresh=1
router.get('/insumos/categorias', async (req, res) => {
  try {
    const force = req.query.refresh === '1' || req.query.refresh === 'true';
    if (force) invalidateInsumosOdooCache();
    const rows = await fetchOdooCategories({ force });
    return res.json(rows);
  } catch (err) {
    console.error('admin get insumos categorias error:', err);
    return res.status(500).json({ error: 'Error leyendo categorias de Odoo', detail: err.message });
  }
});

// GET /admin/insumos/categorias/:categId/productos — preview de que insumos
// trae una categoria de Odoo (para la pantalla de config, antes/despues de
// asignarla a una seccion).
router.get('/insumos/categorias/:categId/productos', async (req, res) => {
  const categId = Number(req.params.categId);
  if (!Number.isInteger(categId) || categId <= 0) return res.status(400).json({ error: 'categ_id invalido' });
  try {
    const rows = await fetchOdooProductsByCategoryIds([categId]);
    return res.json(
      rows.map((p) => ({
        producto_odoo_id: p.id,
        producto_nombre: p.name,
        producto_codigo: p.default_code || null,
        unidad: Array.isArray(p.uom_id) ? p.uom_id[1] : null,
      }))
    );
  } catch (err) {
    console.error('admin get productos de categoria error:', err);
    return res.status(500).json({ error: 'Error leyendo productos de la categoria', detail: err.message });
  }
});

// GET /admin/insumos/categoria-map
router.get('/insumos/categoria-map', async (_req, res) => {
  try {
    const rows = await getCategoriaSeccionMap();
    return res.json(rows);
  } catch (err) {
    console.error('admin get insumos categoria-map error:', err);
    return res.status(500).json({ error: 'Error leyendo el mapeo de categorias', detail: err.message });
  }
});

// PUT /admin/insumos/categoria-map — body { entries: [{categ_id, categ_nombre, seccion}, ...] }
router.put('/insumos/categoria-map', async (req, res) => {
  try {
    const entries = (req.body || {}).entries;
    const rows = await setCategoriaSeccionMap(entries);
    return res.json(rows);
  } catch (err) {
    console.error('admin set insumos categoria-map error:', err);
    return res.status(500).json({ error: 'Error guardando el mapeo de categorias', detail: err.message });
  }
});

// GET /admin/insumos/pedidos?seccion=&fecha=&desde=&hasta=
// Sin "seccion" = vista global (todas las secciones) del rango/fecha pedido.
router.get('/insumos/pedidos', async (req, res) => {
  const { seccion, fecha, desde, hasta } = req.query || {};
  const where = [];
  const params = [];

  if (seccion) {
    if (!isValidInsumosSeccion(seccion)) return res.status(400).json({ error: 'seccion invalida' });
    params.push(String(seccion));
    where.push(`p.seccion = $${params.length}`);
  }
  if (fecha) {
    params.push(String(fecha));
    where.push(`p.fecha = $${params.length}`);
  } else {
    if (desde) {
      params.push(String(desde));
      where.push(`p.fecha >= $${params.length}`);
    }
    if (hasta) {
      params.push(String(hasta));
      where.push(`p.fecha <= $${params.length}`);
    }
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : '';

  try {
    const { rows } = await pool.query(
      `
      select p.id, p.seccion, p.fecha, p.status, p.confirmed_at, p.closed_at,
             u.name as confirmed_by_name,
             (select count(*) from public.insumos_pedido_items i where i.pedido_id = p.id) as items_count
        from public.insumos_pedidos p
        left join public.qc_users u on u.id = p.confirmed_by_user_id
        ${whereSql}
        order by p.fecha desc, p.seccion asc
      `,
      params
    );
    return res.json(rows);
  } catch (err) {
    console.error('admin list insumos pedidos error:', err);
    return res.status(500).json({ error: 'Error listando pedidos', detail: err.message });
  }
});

// GET /admin/insumos/items?fecha=&desde=&hasta=&seccion=
// Vista "entregas": todos los items de todas las secciones juntos para una
// fecha o rango, para que la persona que reparte prepare y entregue de una.
// Solo pedidos ya confirmados (CONFIRMADO/CERRADO) - los ABIERTO todavia se
// estan armando en el piso y no hay nada para preparar todavia.
router.get('/insumos/items', async (req, res) => {
  const { seccion, fecha, desde, hasta } = req.query || {};
  const where = [`p.status in ('CONFIRMADO', 'CERRADO')`];
  const params = [];

  if (seccion) {
    if (!isValidInsumosSeccion(seccion)) return res.status(400).json({ error: 'seccion invalida' });
    params.push(String(seccion));
    where.push(`p.seccion = $${params.length}`);
  }
  if (fecha) {
    params.push(String(fecha));
    where.push(`p.fecha = $${params.length}`);
  } else {
    if (desde) {
      params.push(String(desde));
      where.push(`p.fecha >= $${params.length}`);
    }
    if (hasta) {
      params.push(String(hasta));
      where.push(`p.fecha <= $${params.length}`);
    }
  }

  try {
    const { rows } = await pool.query(
      `
      select i.*,
             p.seccion, p.fecha, p.status as pedido_status, p.confirmed_at,
             u.name as confirmed_by_name
        from public.insumos_pedido_items i
        join public.insumos_pedidos p on p.id = i.pedido_id
        left join public.qc_users u on u.id = p.confirmed_by_user_id
        where ${where.join(' and ')}
        order by i.producto_nombre asc, p.seccion asc
      `,
      params
    );
    return res.json(rows);
  } catch (err) {
    console.error('admin list insumos items error:', err);
    return res.status(500).json({ error: 'Error listando items', detail: err.message });
  }
});

// GET /admin/insumos/pedidos/:id
router.get('/insumos/pedidos/:id', async (req, res) => {
  const pedidoId = Number(req.params.id);
  if (!Number.isInteger(pedidoId)) return res.status(400).json({ error: 'id invalido' });
  try {
    const full = await loadPedidoConItems(pool, pedidoId);
    if (!full) return res.status(404).json({ error: 'Pedido no encontrado' });
    return res.json(full);
  } catch (err) {
    console.error('admin get insumos pedido error:', err);
    return res.status(500).json({ error: 'Error leyendo el pedido', detail: err.message });
  }
});

// PUT /admin/insumos/pedidos/:id/items/:itemId — editar cantidad y/o declarar no disponible
router.put('/insumos/pedidos/:id/items/:itemId', async (req, res) => {
  const pedidoId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  const { cantidad_pedida, cantidad_entregada, no_disponible, no_disponible_note } = req.body || {};
  if (!Number.isInteger(pedidoId) || !Number.isInteger(itemId)) return res.status(400).json({ error: 'parametros invalidos' });

  const sets = [];
  const params = [itemId, pedidoId];
  if (cantidad_pedida !== undefined) {
    const q = Number(cantidad_pedida);
    if (!Number.isFinite(q) || q < 0) return res.status(400).json({ error: 'cantidad_pedida invalida' });
    params.push(q);
    sets.push(`cantidad_pedida = $${params.length}`);
  }
  if (cantidad_entregada !== undefined) {
    const q = cantidad_entregada === null ? null : Number(cantidad_entregada);
    if (q !== null && (!Number.isFinite(q) || q < 0)) return res.status(400).json({ error: 'cantidad_entregada invalida' });
    params.push(q);
    sets.push(`cantidad_entregada = $${params.length}`);
  }
  if (no_disponible !== undefined) {
    params.push(!!no_disponible);
    sets.push(`no_disponible = $${params.length}`);
  }
  if (no_disponible_note !== undefined) {
    params.push(no_disponible_note ? String(no_disponible_note) : null);
    sets.push(`no_disponible_note = $${params.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'nada para actualizar' });
  sets.push('updated_at = now()');

  try {
    const { rowCount } = await pool.query(
      `update public.insumos_pedido_items set ${sets.join(', ')} where id = $1 and pedido_id = $2`,
      params
    );
    if (!rowCount) return res.status(404).json({ error: 'Item no encontrado' });
    const full = await loadPedidoConItems(pool, pedidoId);
    return res.json(full);
  } catch (err) {
    console.error('admin update insumos pedido item error:', err);
    return res.status(500).json({ error: 'Error actualizando el item', detail: err.message });
  }
});

// POST /admin/insumos/pedidos/:id/items — Compras agrega un item manualmente
router.post('/insumos/pedidos/:id/items', async (req, res) => {
  const pedidoId = Number(req.params.id);
  const { producto_odoo_id, producto_nombre, producto_codigo, unidad, categoria_odoo_id, cantidad_pedida } = req.body || {};
  const productoId = Number(producto_odoo_id);
  const nombre = String(producto_nombre || '').trim();
  const qty = Number(cantidad_pedida);

  if (!Number.isInteger(pedidoId)) return res.status(400).json({ error: 'id de pedido invalido' });
  if (!Number.isInteger(productoId) || !nombre) return res.status(400).json({ error: 'producto_odoo_id y producto_nombre son requeridos' });
  if (!Number.isFinite(qty) || qty < 0) return res.status(400).json({ error: 'cantidad_pedida invalida' });

  try {
    const { rows: pedidoRows } = await pool.query(`select id from public.insumos_pedidos where id = $1`, [pedidoId]);
    if (!pedidoRows[0]) return res.status(404).json({ error: 'Pedido no encontrado' });

    await pool.query(
      `insert into public.insumos_pedido_items
         (pedido_id, producto_odoo_id, producto_nombre, producto_codigo, unidad, categoria_odoo_id, cantidad_pedida)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (pedido_id, producto_odoo_id) do update set
         cantidad_pedida = public.insumos_pedido_items.cantidad_pedida + excluded.cantidad_pedida,
         updated_at = now()`,
      [pedidoId, productoId, nombre, producto_codigo || null, unidad || null, categoria_odoo_id || null, qty]
    );
    const full = await loadPedidoConItems(pool, pedidoId);
    return res.status(201).json(full);
  } catch (err) {
    console.error('admin add insumos pedido item error:', err);
    return res.status(500).json({ error: 'Error agregando el item', detail: err.message });
  }
});

module.exports = router;

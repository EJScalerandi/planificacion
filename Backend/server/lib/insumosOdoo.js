// Resolucion en vivo de categorias/productos de Odoo para pedidos de insumos,
// con cache en memoria + TTL (mismo criterio que odooClient.js cachea el uid):
// el catalogo de Odoo es fuente de verdad, no se espeja en Postgres.
const { getOdooClient } = require('./odooClient');

const CATEGORIES_TTL_MS = 10 * 60 * 1000;
const PRODUCTS_TTL_MS = 5 * 60 * 1000;

let categoriesCache = null; // { at, data }
const productsCacheByKey = new Map(); // key (categ ids ordenados) -> { at, data }

function requireOdoo() {
  const odoo = getOdooClient();
  if (!odoo) throw new Error('Odoo no configurado (faltan env vars ODOO_URL/ODOO_DB/ODOO_USERNAME/ODOO_PASSWORD)');
  return odoo;
}

async function fetchOdooCategories({ force = false } = {}) {
  const now = Date.now();
  if (!force && categoriesCache && now - categoriesCache.at < CATEGORIES_TTL_MS) {
    return categoriesCache.data;
  }
  const odoo = requireOdoo();
  const rows = await odoo.executeKw('product.category', 'search_read', [[]], {
    fields: ['id', 'name', 'complete_name'],
  });
  categoriesCache = { at: now, data: rows };
  return rows;
}

function productsCacheKey(categIds) {
  return categIds.slice().sort((a, b) => a - b).join(',');
}

async function fetchOdooProductsByCategoryIds(categIds, { force = false } = {}) {
  const ids = Array.from(new Set((categIds || []).map(Number).filter((n) => Number.isFinite(n) && n > 0)));
  if (!ids.length) return [];

  const key = productsCacheKey(ids);
  const now = Date.now();
  const cached = productsCacheByKey.get(key);
  if (!force && cached && now - cached.at < PRODUCTS_TTL_MS) {
    return cached.data;
  }

  const odoo = requireOdoo();
  const rows = await odoo.executeKw(
    'product.template',
    'search_read',
    [[['categ_id', 'in', ids], ['purchase_ok', '=', true]]],
    { fields: ['id', 'name', 'default_code', 'uom_id', 'categ_id'] }
  );
  productsCacheByKey.set(key, { at: now, data: rows });
  return rows;
}

function invalidateInsumosOdooCache() {
  categoriesCache = null;
  productsCacheByKey.clear();
}

module.exports = { fetchOdooCategories, fetchOdooProductsByCategoryIds, invalidateInsumosOdooCache };

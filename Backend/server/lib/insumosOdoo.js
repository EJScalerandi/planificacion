// Resolucion en vivo de categorias/productos de Odoo para pedidos de insumos,
// con cache en memoria + TTL (mismo criterio que odooClient.js cachea el uid):
// el catalogo de Odoo es fuente de verdad, no se espeja en Postgres.
//
// La "categoria" no es el categ_id interno de Odoo (Many2one, un producto
// solo entra en una) sino un campo custom creado con Studio:
// x_clasificacion_de_pro (modelo nuevo) + x_studio_clasificacin_sectorizada
// (Many2many en product.template) - permite que un mismo producto tenga
// varias clasificaciones y por lo tanto aparezca en varias secciones.
const { getOdooClient } = require('./odooClient');

const CLASIFICACION_MODEL = 'x_clasificacion_de_pro';
const CLASIFICACION_FIELD = 'x_studio_clasificacin_sectorizada';

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
  const rows = await odoo.executeKw(CLASIFICACION_MODEL, 'search_read', [[]], {
    fields: ['id', 'x_name', 'display_name'],
  });
  const data = rows.map((r) => ({
    id: r.id,
    name: r.x_name || r.display_name,
    complete_name: r.display_name,
  }));
  categoriesCache = { at: now, data };
  return data;
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
    [[[CLASIFICACION_FIELD, 'in', ids], ['purchase_ok', '=', true]]],
    { fields: ['id', 'name', 'default_code', 'uom_id', CLASIFICACION_FIELD] }
  );
  productsCacheByKey.set(key, { at: now, data: rows });
  return rows;
}

function invalidateInsumosOdooCache() {
  categoriesCache = null;
  productsCacheByKey.clear();
}

module.exports = { fetchOdooCategories, fetchOdooProductsByCategoryIds, invalidateInsumosOdooCache };

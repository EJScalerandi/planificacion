const express = require('express');
const { getOdooClient } = require('../../lib/odooClient');
const { getCategoryMap, setCategoryMap } = require('../../priceCategoriesDb');
const { apiKeyAuth } = require('../../middleware/apiKeyAuth');

const router = express.Router();

// Metadata del campo de tags (nombre + modelo relacionado) no cambia, es seguro cachearla en memoria.
let tagFieldCache = null;

function relationLooksLikeTag(fieldName, meta = {}) {
  const name = String(fieldName || '').toLowerCase();
  const relation = String(meta.relation || '').toLowerCase();
  const label = String(meta.string || '').toLowerCase();
  if (String(meta.type || '') !== 'many2many') return false;
  return name.includes('tag') || relation.includes('tag') || label.includes('tag') || label.includes('etiqueta');
}

async function detectProductTagField(odoo) {
  if (tagFieldCache !== null) return tagFieldCache;
  // Sin try/catch: si esto falla (credenciales, red, etc.) queremos que el error real
  // suba a la respuesta HTTP en vez de esconderse detras de un "tags: []" enganoso.
  const meta = await odoo.executeKw('product.template', 'fields_get', [], {
    attributes: ['string', 'type', 'relation'],
  });
  const preferred = ['product_tag_ids', 'product_template_tag_ids', 'tag_ids'];
  let found = null;
  for (const field of preferred) {
    if (meta[field] && relationLooksLikeTag(field, meta[field])) {
      found = { field, relation: meta[field].relation };
      break;
    }
  }
  if (!found) {
    for (const [field, info] of Object.entries(meta || {})) {
      if (relationLooksLikeTag(field, info)) {
        found = { field, relation: info.relation };
        break;
      }
    }
  }
  tagFieldCache = found;
  return tagFieldCache;
}

function uniqNumbers(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(Number).filter((n) => Number.isFinite(n) && n > 0)));
}

async function loadAllProductTags(odoo) {
  const detected = await detectProductTagField(odoo);
  if (!detected) return [];
  const rows = await odoo.executeKw(detected.relation, 'search_read', [[]], {
    fields: ['id', 'name', 'display_name'],
    order: 'name asc',
    limit: 2000,
  });
  return (Array.isArray(rows) ? rows : [])
    .map((r) => ({ id: Number(r.id), name: String(r.display_name || r.name || '').trim() }))
    .filter((t) => Number.isFinite(t.id) && t.id > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

async function loadTemplateTagMap(odoo) {
  const detected = await detectProductTagField(odoo);
  const map = {};
  if (!detected) return map;
  const rows = await odoo.executeKw('product.template', 'search_read', [[]], {
    fields: ['id', detected.field],
    limit: 20000,
  });
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = Number(row.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    const tagIds = uniqNumbers(row[detected.field]);
    if (tagIds.length) map[String(id)] = tagIds;
  }
  return map;
}

function requireOdoo(req, res) {
  const odoo = getOdooClient();
  if (!odoo) {
    res.status(500).json({ ok: false, error: 'Falta configurar ODOO_URL/ODOO_DB/ODOO_USERNAME/ODOO_PASSWORD en este servicio.' });
    return null;
  }
  return odoo;
}

router.get('/price-categories/tags', apiKeyAuth, async (req, res, next) => {
  try {
    const odoo = requireOdoo(req, res);
    if (!odoo) return;
    const tags = await loadAllProductTags(odoo);
    res.json({ ok: true, tags });
  } catch (e) {
    next(e);
  }
});

router.get('/price-categories/template-tags', apiKeyAuth, async (req, res, next) => {
  try {
    const odoo = requireOdoo(req, res);
    if (!odoo) return;
    const templateTags = await loadTemplateTagMap(odoo);
    res.json({ ok: true, template_tags: templateTags });
  } catch (e) {
    next(e);
  }
});

router.get('/price-categories/map', apiKeyAuth, async (req, res, next) => {
  try {
    const map = await getCategoryMap();
    res.json({ ok: true, map });
  } catch (e) {
    next(e);
  }
});

router.put('/price-categories/map', apiKeyAuth, async (req, res, next) => {
  try {
    const map = await setCategoryMap((req.body && req.body.map) || {});
    res.json({ ok: true, map });
  } catch (e) {
    next(e);
  }
});

module.exports = router;

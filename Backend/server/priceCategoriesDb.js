const { pool } = require('./db');

const VALID_CATEGORIES = new Set(['porton', 'ipanel', 'puerta', 'plegados', 'otros']);

let ensured = false;
async function ensureTable() {
  if (ensured) return;
  await pool.query(`
    create table if not exists public.price_category_map (
      tag_id integer primary key,
      category text not null,
      updated_at timestamptz not null default now()
    )
  `);
  ensured = true;
}

async function getCategoryMap() {
  await ensureTable();
  const r = await pool.query('select tag_id, category from public.price_category_map');
  const out = {};
  for (const row of r.rows) out[String(row.tag_id)] = row.category;
  return out;
}

async function setCategoryMap(map = {}) {
  await ensureTable();
  const entries = Object.entries(map || {})
    .map(([tagId, category]) => [Number(tagId), String(category || '').trim().toLowerCase()])
    .filter(([tagId, category]) => Number.isFinite(tagId) && tagId > 0 && VALID_CATEGORIES.has(category));

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('delete from public.price_category_map');
    for (const [tagId, category] of entries) {
      await client.query(
        'insert into public.price_category_map (tag_id, category) values ($1, $2)',
        [tagId, category],
      );
    }
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }

  return getCategoryMap();
}

module.exports = { getCategoryMap, setCategoryMap, VALID_CATEGORIES };

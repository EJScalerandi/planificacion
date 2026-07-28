const { pool } = require('./db');
const { isValidInsumosSeccion } = require('./lib/insumosSecciones');

async function getCategoriaSeccionMap() {
  const { rows } = await pool.query(
    'select categ_id, categ_nombre, seccion from public.insumos_categoria_seccion where enabled = true'
  );
  return rows;
}

async function setCategoriaSeccionMap(entries = []) {
  const clean = (Array.isArray(entries) ? entries : [])
    .map((e) => ({
      categ_id: Number(e?.categ_id),
      categ_nombre: e?.categ_nombre ? String(e.categ_nombre).trim() : null,
      seccion: String(e?.seccion || '').trim(),
    }))
    .filter((e) => Number.isFinite(e.categ_id) && e.categ_id > 0 && isValidInsumosSeccion(e.seccion));

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('delete from public.insumos_categoria_seccion');
    for (const e of clean) {
      await client.query(
        `insert into public.insumos_categoria_seccion (categ_id, categ_nombre, seccion)
         values ($1, $2, $3)`,
        [e.categ_id, e.categ_nombre, e.seccion]
      );
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }

  return getCategoriaSeccionMap();
}

module.exports = { getCategoriaSeccionMap, setCategoriaSeccionMap };

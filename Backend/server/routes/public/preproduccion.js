const express = require('express');
const { pool } = require('../../db');

const router = express.Router();

// GET /preproduccion-valores
router.get('/preproduccion-valores', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `
      select id, nv, data, updated_at
      from public.preproduccion_valores
      order by coalesce(nv, 0) asc, id asc;
      `
    );
    res.setHeader('Cache-Control', 'no-store');
    return res.json(rows);
  } catch (err) {
    console.error('preproduccion-valores get error:', err);
    return res.status(500).json({ error: 'Error leyendo preproduccion_valores', detail: err.message });
  }
});

// PUT /preproduccion-valores/:id
router.put('/preproduccion-valores/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

  const nvRaw = req.body?.nv;
  const patch = req.body?.patch;

  let nv;
  const hasNv = nvRaw !== undefined;
  if (hasNv) {
    if (nvRaw === null) nv = null;
    else {
      const n = Number(nvRaw);
      if (!Number.isInteger(n)) return res.status(400).json({ error: 'nv debe ser entero o null' });
      nv = n;
    }
  }

  let patchObj = {};
  const hasPatch = patch !== undefined;
  if (hasPatch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return res.status(400).json({ error: 'patch debe ser un objeto JSON' });
    }
    patchObj = patch;
  }

  if (!hasNv && !hasPatch) {
    return res.status(400).json({ error: 'Debe enviarse nv y/o patch' });
  }

  const sets = [];
  const params = [id];
  let idx = 2;

  if (hasNv) {
    sets.push(`nv = $${idx++}`);
    params.push(nv);
  }

  if (hasPatch) {
    sets.push(`data = coalesce(data, '{}'::jsonb) || $${idx++}::jsonb`);
    params.push(JSON.stringify(patchObj));
  }

  sets.push(`updated_at = now()`);

  try {
    const { rows, rowCount } = await pool.query(
      `
      update public.preproduccion_valores
      set ${sets.join(', ')}
      where id = $1
      returning id, nv, data, updated_at;
      `,
      params
    );

    if (!rowCount) return res.status(404).json({ error: 'Registro no encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('preproduccion-valores put error:', err);
    return res.status(500).json({ error: 'Error actualizando preproduccion_valores', detail: err.message });
  }
});

module.exports = router;

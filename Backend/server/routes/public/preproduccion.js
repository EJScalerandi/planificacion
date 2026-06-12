const express = require('express');
const { pool } = require('../../db');

const router = express.Router();

// GET /preproduccion-valores
router.get('/preproduccion-valores', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `
      with pq_raw as (
        select
          case
            when regexp_replace(coalesce(final_sale_order_name, odoo_sale_order_name, ''), '^[A-Za-z]+', '') ~ '^[0-9]+$'
            then regexp_replace(coalesce(final_sale_order_name, odoo_sale_order_name, ''), '^[A-Za-z]+', '')::integer
            else null
          end as nv_num,
          end_customer->>'phone'    as phone,
          end_customer->>'maps_url' as maps_url,
          to_char(measurement_scheduled_for, 'YYYY-MM-DD') as fecha_medicion,
          measurement_scheduled_for
        from public.presupuestador_quotes
        where quote_kind = 'original'
      ),
      pq_best as (
        select distinct on (nv_num)
          nv_num, phone, maps_url, fecha_medicion
        from pq_raw
        where nv_num is not null
        order by nv_num, measurement_scheduled_for desc nulls last
      )
      select
        pv.id,
        pv.nv,
        coalesce(pv.data, '{}'::jsonb)
          || jsonb_strip_nulls(jsonb_build_object(
               'pq_phone',          pqb.phone,
               'pq_maps_url',       pqb.maps_url,
               'pq_fecha_medicion', pqb.fecha_medicion
             )) as data,
        pv.updated_at
      from public.preproduccion_valores pv
      left join pq_best pqb on pqb.nv_num = pv.nv
      order by coalesce(pv.nv, 0) asc, pv.id asc;
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

// server/routes/admin/workflow.js
const express = require('express');
const { adminAuth } = require('../../middleware/adminAuth');
const { pool } = require('../../db');
const { getWorkflowConfig } = require('../../lib/workflow');

const router = express.Router();

function normalizeLine(value) {
  const line = String(value || '').trim();
  return ['portones', 'ipanel'].includes(line) ? line : '';
}

// GET /admin/workflow/config
router.get('/workflow/config', adminAuth, async (req, res) => {
  try {
    const line = normalizeLine(req.query.line);
    if (!line) return res.status(400).json({ error: 'line debe ser portones o ipanel' });

    const cfg = await getWorkflowConfig(line);
    return res.json({ ok: true, ...cfg });
  } catch (err) {
    console.error('get workflow config error:', err);
    return res.status(500).json({ error: 'Error leyendo workflow', detail: err.message });
  }
});

async function getPortonesConditionFields(limit) {
  const { rows } = await pool.query(
    `
    with sample as (
      select data
      from public.preproduccion_valores
      where data is not null
      order by updated_at desc, id desc
      limit $1
    ),
    keys as (
      select distinct jsonb_object_keys(data) as key
      from sample
    )
    select key
    from keys
    order by key asc;
    `,
    [limit]
  );

  const base = [
    { key: 'id', label: 'id' },
    { key: 'nv', label: 'nv' },
    { key: 'nlista', label: 'nlista' },
    { key: 'partida', label: 'partida' },
  ];

  const blacklist = new Set(['created_at', 'updated_at']);
  const jsonKeys = (rows || [])
    .map((r) => String(r.key || '').trim())
    .filter(Boolean)
    .filter((k) => !blacklist.has(k))
    .map((k) => ({ key: k, label: k }));

  const seen = new Set();
  return [...base, ...jsonKeys].filter((x) => {
    const key = String(x.key || '').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function getIpanelConditionFields() {
  const { rows } = await pool.query(
    `
    select column_name as key
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ipanel'
    order by ordinal_position asc;
    `
  );

  // Para iPanels el workflow se evalua contra public.ipanel, por eso los campos
  // disponibles salen de columnas reales de esa tabla, no de preproduccion_valores.
  const blacklist = new Set(['created_at', 'updated_at']);
  return (rows || [])
    .map((r) => String(r.key || '').trim())
    .filter(Boolean)
    .filter((k) => !blacklist.has(k))
    .map((k) => ({ key: k, label: k }));
}

// GET /admin/workflow/condition-fields?line=portones|ipanel
router.get('/workflow/condition-fields', adminAuth, async (req, res) => {
  try {
    const line = normalizeLine(req.query.line);
    if (!line) return res.status(400).json({ error: 'line debe ser portones o ipanel' });

    const limit = Math.min(Math.max(parseInt(req.query.limit || '2000', 10) || 2000, 100), 10000);
    const fields = line === 'ipanel'
      ? await getIpanelConditionFields()
      : await getPortonesConditionFields(limit);

    return res.json({ ok: true, fields });
  } catch (err) {
    console.error('get condition-fields error:', err);
    return res.status(500).json({ error: 'Error leyendo campos', detail: err.message });
  }
});

// PUT /admin/workflow/config
router.put('/workflow/config', adminAuth, async (req, res) => {
  const line = normalizeLine(req.query.line);
  if (!line) return res.status(400).json({ error: 'line debe ser portones o ipanel' });

  const { edges = [], requirements = [], stageLabels = [] } = req.body || {};

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (Array.isArray(stageLabels) && stageLabels.length) {
      for (const s of stageLabels) {
        if (!s?.key) continue;
        await client.query(
          `
          update public.workflow_stage
          set label = $3, updated_at = now()
          where line = $1 and key = $2;
          `,
          [line, String(s.key), String(s.label || s.key)]
        );
      }
    }

    await client.query('delete from public.workflow_edge where line = $1;', [line]);
    for (const e of edges) {
      if (!e?.from_key || !e?.to_key) continue;
      await client.query(
        `
        insert into public.workflow_edge(line, from_key, to_key, priority, enabled, condition_json)
        values ($1,$2,$3,$4,$5,$6);
        `,
        [
          line,
          String(e.from_key),
          String(e.to_key),
          Number.isInteger(Number(e.priority)) ? Number(e.priority) : 100,
          e.enabled !== false,
          e.condition_json ?? null,
        ]
      );
    }

    await client.query('delete from public.workflow_requirement where line = $1;', [line]);
    for (const r of requirements) {
      if (!r?.stage_key || !r?.type || !r?.required_key) continue;
      await client.query(
        `
        insert into public.workflow_requirement(line, stage_key, type, group_id, required_key)
        values ($1,$2,$3,$4,$5);
        `,
        [
          line,
          String(r.stage_key),
          String(r.type),
          r.group_id == null ? null : Number(r.group_id),
          String(r.required_key),
        ]
      );
    }

    await client.query('COMMIT');
    const cfg = await getWorkflowConfig(line);
    return res.json({ ok: true, ...cfg });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('save workflow config error:', err);
    return res.status(500).json({ error: 'Error guardando workflow', detail: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;

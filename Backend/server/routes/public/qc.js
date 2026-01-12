const express = require('express');
const crypto = require('crypto');
const { pool } = require('../../db');

const router = express.Router();

const QC_PIN_SALT = process.env.QC_PIN_SALT || 'dev_change_me_pin_salt';

function hashPin(pin) {
  return crypto.createHmac('sha256', QC_PIN_SALT).update(String(pin)).digest('hex');
}

function isValidLine(line) {
  return ['portones', 'ipanel'].includes(line);
}
function isValidQcStatus(s) {
  return ['APROBADO', 'OBSERVADO', 'RECHAZADO'].includes(s);
}
function isValidKind(k) {
  return ['OBSERVADO', 'RECHAZADO'].includes(k);
}

// GET /qc/motives
router.get('/qc/motives', async (req, res) => {
  try {
    const line = String(req.query.line || '').trim();
    const kind = String(req.query.kind || '').trim().toUpperCase();
    const stage = req.query.stage == null ? null : String(req.query.stage).trim();

    if (!isValidLine(line)) return res.status(400).json({ error: 'line inválida' });
    if (!isValidKind(kind)) return res.status(400).json({ error: 'kind inválido' });

    const { rows } = await pool.query(
      `
      select id, line, kind, stage_key, label, priority
      from public.qc_motive
      where enabled = true
        and line = $1
        and kind = $2
        and (stage_key is null or stage_key = $3)
      order by priority asc, id asc;
      `,
      [line, kind, stage]
    );

    return res.json(rows);
  } catch (err) {
    console.error('qc motives error:', err);
    return res.status(500).json({ error: 'Error leyendo motivos', detail: err.message });
  }
});

// GET /qc/history/:line/:itemId
router.get('/qc/history/:line/:itemId', async (req, res) => {
  try {
    const line = String(req.params.line || '').trim();
    const itemId = Number(req.params.itemId);

    if (!isValidLine(line)) return res.status(400).json({ error: 'line inválida' });
    if (!Number.isInteger(itemId)) return res.status(400).json({ error: 'itemId inválido' });

    const { rows } = await pool.query(
      `
      select
        e.id,
        e.stage_key,
        e.qc_status,
        e.note,
        e.created_at,
        u.id as user_id,
        u.name as user_name,
        u.is_global as user_is_global,
        m.id as motive_id,
        m.label as motive_label
      from public.qc_event e
      join public.qc_users u on u.id = e.by_user_id
      left join public.qc_motive m on m.id = e.motive_id
      where e.line = $1 and e.item_id = $2
      order by e.created_at desc;
      `,
      [line, itemId]
    );

    return res.json(rows);
  } catch (err) {
    console.error('qc history error:', err);
    return res.status(500).json({ error: 'Error leyendo historial QC', detail: err.message });
  }
});

// POST /qc/authorize
router.post('/qc/authorize', async (req, res) => {
  const { line, item_id, stage_key, qc_status, motive_id, note, pin } = req.body || {};

  const nItemId = Number(item_id);
  const stageKey = String(stage_key || '').trim();
  const qcStatus = String(qc_status || '').trim().toUpperCase();
  const pinStr = String(pin || '').trim();

  if (!isValidLine(line)) return res.status(400).json({ error: 'line inválida' });
  if (!Number.isInteger(nItemId)) return res.status(400).json({ error: 'item_id inválido' });
  if (!stageKey) return res.status(400).json({ error: 'stage_key requerido' });
  if (!isValidQcStatus(qcStatus)) return res.status(400).json({ error: 'qc_status inválido' });
  if (!/^\d{3,10}$/.test(pinStr)) return res.status(400).json({ error: 'PIN inválido (solo numérico)' });

  const client = await pool.connect();
  try {
    await client.query('begin');

    const pinHash = hashPin(pinStr);
    const uQ = await client.query(
      `
      select id, name, is_global, is_active
      from public.qc_users
      where pin_hash = $1
      limit 1;
      `,
      [pinHash]
    );

    const user = uQ.rows[0];
    if (!user || !user.is_active) {
      await client.query('rollback');
      return res.status(401).json({ error: 'PIN incorrecto o usuario inactivo' });
    }

    const lastQ = await client.query(
      `
      select qc_status
      from public.qc_event
      where line = $1 and item_id = $2
      order by created_at desc
      limit 1;
      `,
      [line, nItemId]
    );

    const lastStatus = lastQ.rows[0]?.qc_status || null;

    if (lastStatus === 'RECHAZADO' && qcStatus !== 'RECHAZADO' && !user.is_global) {
      await client.query('rollback');
      return res.status(403).json({ error: 'Solo un usuario GLOBAL puede destrabar un RECHAZADO' });
    }

    if (!user.is_global) {
      const sQ = await client.query(
        `
        select 1
        from public.qc_user_scope
        where user_id = $1
          and line = $2
          and stage_key = $3
          and enabled = true
        limit 1;
        `,
        [user.id, line, stageKey]
      );
      if (!sQ.rows.length) {
        await client.query('rollback');
        return res.status(403).json({ error: 'Usuario sin permiso para esa sección' });
      }
    }

    let motiveId = null;
    if (qcStatus === 'OBSERVADO' || qcStatus === 'RECHAZADO') {
      const mid = Number(motive_id);
      if (!Number.isInteger(mid)) {
        await client.query('rollback');
        return res.status(400).json({ error: 'motive_id requerido para Observado/Rechazado' });
      }

      const motQ = await client.query(
        `
        select id
        from public.qc_motive
        where id = $1
          and enabled = true
          and line = $2
          and kind = $3
          and (stage_key is null or stage_key = $4)
        limit 1;
        `,
        [mid, line, qcStatus, stageKey]
      );
      if (!motQ.rows.length) {
        await client.query('rollback');
        return res.status(400).json({ error: 'motive_id inválido para esa línea/estado/etapa' });
      }

      motiveId = mid;
    }

    const ins = await client.query(
      `
      insert into public.qc_event(line, item_id, stage_key, qc_status, motive_id, note, by_user_id)
      values ($1,$2,$3,$4,$5,$6,$7)
      returning *;
      `,
      [line, nItemId, stageKey, qcStatus, motiveId, note ?? null, user.id]
    );

    await client.query('commit');

    return res.json({
      ok: true,
      qc: ins.rows[0],
      user: { id: user.id, name: user.name, is_global: user.is_global }
    });
  } catch (err) {
    await client.query('rollback');
    console.error('qc authorize error:', err);
    return res.status(500).json({ error: 'Error autorizando QC', detail: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;

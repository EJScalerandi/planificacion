const express = require('express');
const crypto = require('crypto');
const { pool } = require('../../db');
const { STATUS, loadStageMap, getNextStages } = require('../../lib/workflow');

const router = express.Router();

function low(v) { return String(v ?? '').toLowerCase(); }

// Whitelists defensivos para evitar SQL injection en columnas dinámicas
const PORTON_ETAPAS = new Set([
  'diseno','laser','guillotina','plegadora',
  'armado_marco_piernas','armado_piernas','armado_primario','armado_hojas',
  'inyeccion','revestimiento','pintura','armado_final','despacho',
  'corte_revest','plegado_revest',
]);

const IPANEL_ETAPAS = new Set([
  'diseno','guillotina','plegado','pintura','inyeccion','despacho'
]);

async function getPortonIdByNv(db, nv) {
  const { rows } = await db.query(
    `select id from public.portones where nv = $1 order by created_at desc, id desc limit 1;`,
    [nv]
  );
  return rows[0]?.id || null;
}

async function getPortonCtxById(db, id) {
  const pQ = await db.query(
    `
    select
      id, nv, nlista, partida,
      fecha_plan, fecha_prod, fecha_nv, fecha_med, fecha_plan_entrega,
      observaciones, created_at
    from public.portones
    where id = $1
    limit 1;
    `,
    [id]
  );
  if (!pQ.rows.length) return null;

  const ctx = { ...pQ.rows[0] };

  const sQ = await db.query(
    `
    select etapa::text as k, estado as v
    from public.porton_etapas_estado
    where porton_id = $1;
    `,
    [id]
  );

  for (const r of sQ.rows) {
    if (r?.k) ctx[String(r.k)] = r.v;
  }

  const tQ = await db.query(
    `
    select etapa::text as k, inicio, fin
    from public.porton_etapas_tiempos
    where porton_id = $1;
    `,
    [id]
  );
  for (const r of tQ.rows) {
    const k = String(r?.k || '');
    if (!k) continue;
    ctx[`${k}_inicio`] = r.inicio ?? null;
    ctx[`${k}_fin`] = r.fin ?? null;
  }

  return ctx;
}

async function getIpanelByNv(db, nv) {
  const { rows } = await db.query(
    `select * from public.ipanel where nv = $1 order by created_at desc, id desc limit 1;`,
    [nv]
  );
  return rows[0] || null;
}


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
// POST /qc/summary
// body: { line: 'portones'|'ipanel', item_ids: number[], stage_key?: string|null }
// resp: [{ item_id, has_obs, latest_stage_status, latest_stage_at }]
router.post('/qc/summary', async (req, res) => {
  try {
    const { line, item_ids, stage_key } = req.body || {};

    const sLine = String(line || '').trim();
    if (!isValidLine(sLine)) return res.status(400).json({ error: 'line inválida' });

    const ids = Array.isArray(item_ids)
      ? item_ids.map((x) => Number(x)).filter((n) => Number.isInteger(n))
      : [];

    if (!ids.length) return res.json([]); // nada que resumir

    // límite defensivo para no matar la DB si alguien manda 50k ids
    if (ids.length > 500) return res.status(400).json({ error: 'item_ids demasiado grande (max 500)' });

    const stageKey = stage_key == null ? null : String(stage_key).trim();

    const { rows } = await pool.query(
      `
      with ids as (
        select unnest($2::int[]) as item_id
      )
      select
        ids.item_id,
        coalesce(obs.has_obs, false) as has_obs,
        ls.qc_status as latest_stage_status,
        ls.created_at as latest_stage_at
      from ids
      left join lateral (
        select true as has_obs
        from public.qc_event e
        where e.line = $1
          and e.item_id = ids.item_id
          and e.qc_status = 'OBSERVADO'
        limit 1
      ) obs on true
      left join lateral (
        select e.qc_status, e.created_at
        from public.qc_event e
        where e.line = $1
          and e.item_id = ids.item_id
          and ($3::text is null or e.stage_key = $3::text)
        order by e.created_at desc
        limit 1
      ) ls on true
      order by ids.item_id;
      `,
      [sLine, ids, stageKey]
    );

    return res.json(rows);
  } catch (err) {
    console.error('qc summary error:', err);
    return res.status(500).json({ error: 'Error leyendo resumen QC', detail: err.message });
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

    
      // =========================
      // ✅ Ruteo por QC (NO por STOP)
      // - Si QC = APROBADO u OBSERVADO y la etapa está FINALIZADO => habilita la/s siguiente/s.
      // - Si QC = RECHAZADO => NO rutea (queda en el listado).
      // =========================
      if (qcStatus !== 'RECHAZADO') {
        const stageMap = await loadStageMap(line);

        // status_col real de la etapa (por si key != columna)
        const stRow = stageMap.get(stageKey);
        const statusCol = String(stRow?.status_col || stageKey || '').trim();

        if (!statusCol) {
          await client.query('rollback');
          return res.status(400).json({ error: 'stage_key inválida para workflow' });
        }

        if (line === 'portones') {
          const portonId = await getPortonIdByNv(client, nItemId);
          if (!portonId) {
            await client.query('rollback');
            return res.status(404).json({ error: 'Portón no encontrado para ese NV' });
          }

          const ctx = await getPortonCtxById(client, portonId);
          if (!ctx) {
            await client.query('rollback');
            return res.status(404).json({ error: 'Portón no encontrado' });
          }

          const st = low(ctx?.[statusCol]);
          if (st !== low(STATUS.FINALIZADO)) {
            await client.query('rollback');
            return res.status(409).json({ error: `La etapa ${statusCol} debe estar FINALIZADO antes de completar QC` });
          }

          const nextKeys = await getNextStages('portones', stageKey, ctx);

          for (const nk of nextKeys || []) {
            const ns = stageMap.get(nk);
            if (!ns) continue;

            const nextStageCol = String(ns.status_col || '').trim();
            if (!PORTON_ETAPAS.has(nextStageCol)) continue;

            await client.query(
              `
              insert into public.porton_etapas_estado(porton_id, etapa, estado)
              values ($1, $2::public.porton_etapa, $3)
              on conflict (porton_id, etapa)
              do update set estado = coalesce(public.porton_etapas_estado.estado, excluded.estado);
              `,
              [portonId, nextStageCol, STATUS.PENDIENTE]
            );
          }
        } else if (line === 'ipanel') {
          const ip = await getIpanelByNv(client, nItemId);
          if (!ip?.id) {
            await client.query('rollback');
            return res.status(404).json({ error: 'iPanel no encontrado para ese NV' });
          }

          const st = low(ip?.[statusCol]);
          if (st !== low(STATUS.FINALIZADO)) {
            await client.query('rollback');
            return res.status(409).json({ error: `La etapa ${statusCol} debe estar FINALIZADO antes de completar QC` });
          }

          const nextKeys = await getNextStages('ipanel', stageKey, ip);

          for (const nk of nextKeys || []) {
            const ns = stageMap.get(nk);
            if (!ns) continue;

            const nextStageCol = String(ns.status_col || '').trim();
            if (!IPANEL_ETAPAS.has(nextStageCol)) continue;

            await client.query(
              `update public.ipanel set ${nextStageCol} = coalesce(${nextStageCol}, $2) where id = $1;`,
              [ip.id, STATUS.PENDIENTE]
            );
          }
        }
      }

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

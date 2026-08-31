// routes/admin/scheduling.js
//
// Fase 0/1 del motor de reglas de tiempo (ver plan de implementación): CRUD de
// estándares/reglas por etapa + un preview de solo lectura que calcula
// tiempo_efectivo para portones reales y lo compara contra lo ya registrado
// en porton_etapas_tiempos. No escribe en ninguna tabla existente, no cambia
// nada de lo que ve el tablero operador.
const express = require('express');
const { adminAuth } = require('../../middleware/adminAuth');
const { pool } = require('../../db');
const { computeEffectiveMinutes } = require('../../lib/scheduling/rulesEngine');
const { listPortonSchedulingCtxs } = require('../../lib/scheduling/portonCtx');

const router = express.Router();

function normalizeScopes(scopesRaw) {
  if (Array.isArray(scopesRaw)) return scopesRaw.map((s) => String(s || '').trim()).filter(Boolean);
  if (typeof scopesRaw === 'string') return scopesRaw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  return [];
}
function hasScope(req, scope) {
  const scopes = normalizeScopes(req?.admin?.scopes ?? req?.admin?.scope ?? req?.admin?.permissions ?? []);
  return scopes.includes(scope);
}
function requireScope(scope) {
  return (req, res, next) => {
    if (!hasScope(req, scope)) return res.status(403).json({ error: `Requiere scope ${scope}` });
    return next();
  };
}

// Con path ('/scheduling', ...): ver nota equivalente en admin/prefabricados.js —
// sin path, este gate bloquearía con 403 pedidos de otros módulos admin según
// el orden de montaje en app.js.
router.use('/scheduling', adminAuth, requireScope('scheduling:admin'));

const VALID_LINES = ['portones', 'ipanel'];
function isValidLine(line) {
  return VALID_LINES.includes(String(line || '').trim());
}

const VALID_CATEGORIES = new Set(['intrinseca', 'material', 'humana', 'rotativa', 'tiempo']);
const VALID_OPERATORS = new Set(['=', '!=', '>', '>=', '<', '<=', 'in', 'contains']);
const VALID_EFFECT_TYPES = new Set(['percent', 'fixed_minutes', 'multiplier', 'override']);
const VALID_COMBINE_MODES = new Set(['independent', 'cascade']);

function validateRulePayload(r) {
  const stageKey = String(r?.stage_key || '').trim();
  const category = String(r?.category || '').trim();
  const field = String(r?.field || '').trim();
  const operator = String(r?.operator || '').trim();
  const effectType = String(r?.effect_type || '').trim();
  const combineMode = String(r?.combine_mode || 'independent').trim() || 'independent';

  if (!stageKey) return 'stage_key es requerido';
  if (!VALID_CATEGORIES.has(category)) return `category inválida: ${category}`;
  if (!field) return 'field es requerido';
  if (!VALID_OPERATORS.has(operator)) return `operator inválido: ${operator}`;
  if (!VALID_EFFECT_TYPES.has(effectType)) return `effect_type inválido: ${effectType}`;
  if (!VALID_COMBINE_MODES.has(combineMode)) return `combine_mode inválido: ${combineMode}`;
  if (combineMode === 'cascade' && !Number.isFinite(Number(r?.sequence_order))) {
    return 'sequence_order es requerido cuando combine_mode = cascade';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Estándares por etapa
// ---------------------------------------------------------------------------

router.get('/scheduling/standard', async (req, res) => {
  try {
    const line = String(req.query.line || '').trim();
    if (!isValidLine(line)) return res.status(400).json({ error: 'line debe ser portones o ipanel' });

    const { rows } = await pool.query(
      `
      select line, stage_key, standard_minutes, reference_profile_json, notes, updated_at
      from public.scheduling_stage_standard
      where line = $1
      order by stage_key asc;
      `,
      [line]
    );
    return res.json({ ok: true, standards: rows });
  } catch (err) {
    console.error('get scheduling standard error:', err);
    return res.status(500).json({ error: 'Error leyendo estándares', detail: err.message });
  }
});

router.put('/scheduling/standard', async (req, res) => {
  const line = String(req.query.line || '').trim();
  if (!isValidLine(line)) return res.status(400).json({ error: 'line debe ser portones o ipanel' });

  const standards = Array.isArray(req.body?.standards) ? req.body.standards : [];
  for (const s of standards) {
    if (!s?.stage_key) return res.status(400).json({ error: 'Cada estándar necesita stage_key' });
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`delete from public.scheduling_stage_standard where line = $1;`, [line]);

    for (const s of standards) {
      await client.query(
        `
        insert into public.scheduling_stage_standard
          (line, stage_key, standard_minutes, reference_profile_json, notes, updated_at)
        values ($1, $2, $3, $4::jsonb, $5, now());
        `,
        [
          line,
          String(s.stage_key).trim(),
          Number.isFinite(Number(s.standard_minutes)) ? Number(s.standard_minutes) : 0,
          s.reference_profile_json ? JSON.stringify(s.reference_profile_json) : null,
          s.notes == null ? null : String(s.notes),
        ]
      );
    }

    await client.query('commit');
    return res.json({ ok: true, count: standards.length });
  } catch (err) {
    await client.query('rollback');
    console.error('save scheduling standard error:', err);
    return res.status(500).json({ error: 'Error guardando estándares', detail: err.message });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// Reglas de desvío
// ---------------------------------------------------------------------------

router.get('/scheduling/rules', async (req, res) => {
  try {
    const line = String(req.query.line || '').trim();
    if (!isValidLine(line)) return res.status(400).json({ error: 'line debe ser portones o ipanel' });

    const { rows } = await pool.query(
      `
      select id, line, stage_key, category, field, operator, value, effect_type, effect_value,
             combine_mode, sequence_order, enabled, created_at, updated_at
      from public.scheduling_time_rule
      where line = $1
      order by stage_key asc, combine_mode asc, sequence_order asc nulls last, id asc;
      `,
      [line]
    );
    return res.json({ ok: true, rules: rows });
  } catch (err) {
    console.error('get scheduling rules error:', err);
    return res.status(500).json({ error: 'Error leyendo reglas', detail: err.message });
  }
});

router.put('/scheduling/rules', async (req, res) => {
  const line = String(req.query.line || '').trim();
  if (!isValidLine(line)) return res.status(400).json({ error: 'line debe ser portones o ipanel' });

  const rules = Array.isArray(req.body?.rules) ? req.body.rules : [];
  for (const r of rules) {
    const problem = validateRulePayload(r);
    if (problem) return res.status(400).json({ error: problem });
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`delete from public.scheduling_time_rule where line = $1;`, [line]);

    for (const r of rules) {
      await client.query(
        `
        insert into public.scheduling_time_rule
          (line, stage_key, category, field, operator, value, effect_type, effect_value,
           combine_mode, sequence_order, enabled, updated_at)
        values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11, now());
        `,
        [
          line,
          String(r.stage_key).trim(),
          String(r.category).trim(),
          String(r.field).trim(),
          String(r.operator).trim(),
          JSON.stringify(r.value ?? null),
          String(r.effect_type).trim(),
          Number.isFinite(Number(r.effect_value)) ? Number(r.effect_value) : 0,
          String(r.combine_mode || 'independent').trim() || 'independent',
          r.sequence_order == null ? null : Number(r.sequence_order),
          r.enabled !== false,
        ]
      );
    }

    await client.query('commit');
    return res.json({ ok: true, count: rules.length });
  } catch (err) {
    await client.query('rollback');
    console.error('save scheduling rules error:', err);
    return res.status(500).json({ error: 'Error guardando reglas', detail: err.message });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// Preview: tiempo_efectivo calculado vs. tiempo real ya registrado
// ---------------------------------------------------------------------------

router.get('/scheduling/preview', async (req, res) => {
  try {
    const line = String(req.query.line || '').trim();
    if (line !== 'portones') {
      return res.status(400).json({ error: 'El preview de Fase 1 solo soporta line=portones por ahora' });
    }

    const [{ rows: standards }, { rows: rules }] = await Promise.all([
      pool.query(
        `select stage_key, standard_minutes from public.scheduling_stage_standard where line = $1;`,
        [line]
      ),
      pool.query(
        `select id, stage_key, category, field, operator, value, effect_type, effect_value,
                combine_mode, sequence_order, enabled
         from public.scheduling_time_rule
         where line = $1 and enabled = true;`,
        [line]
      ),
    ]);

    const standardByStage = new Map(standards.map((s) => [s.stage_key, Number(s.standard_minutes) || 0]));
    const rulesByStage = new Map();
    for (const r of rules) {
      if (!rulesByStage.has(r.stage_key)) rulesByStage.set(r.stage_key, []);
      rulesByStage.get(r.stage_key).push(r);
    }

    if (!standardByStage.size) {
      return res.json({ ok: true, portones: [], warning: 'No hay estándares cargados todavía para esta línea.' });
    }

    const ctxs = await listPortonSchedulingCtxs(pool, { limit: req.query.limit });

    const portones = ctxs.map((ctx) => {
      const stages = [];
      for (const [stageKey, standardMinutes] of standardByStage.entries()) {
        const result = computeEffectiveMinutes({
          standardMinutes,
          rules: rulesByStage.get(stageKey) || [],
          ctx,
        });

        const inicio = ctx[`${stageKey}_inicio`] ?? null;
        const fin = ctx[`${stageKey}_fin`] ?? null;
        let realMinutes = null;
        if (inicio && fin) {
          const diffMs = new Date(fin).getTime() - new Date(inicio).getTime();
          if (Number.isFinite(diffMs) && diffMs >= 0) realMinutes = Math.round((diffMs / 60000) * 100) / 100;
        }

        stages.push({
          stage_key: stageKey,
          ...result,
          real_minutes: realMinutes,
          delta_vs_real: realMinutes == null ? null : Math.round((result.effective_minutes - realMinutes) * 100) / 100,
        });
      }

      return {
        id: ctx.id,
        nv: ctx.nv,
        sistema: ctx.sistema,
        stages,
      };
    });

    return res.json({ ok: true, portones });
  } catch (err) {
    console.error('get scheduling preview error:', err);
    return res.status(500).json({ error: 'Error calculando preview', detail: err.message });
  }
});

module.exports = router;

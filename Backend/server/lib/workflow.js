// server/lib/workflow.js
const { pool } = require('../db');

const STATUS = {
  PENDIENTE: 'Pendiente',
  EN_PROCESO: 'En Proceso',
  FINALIZADO: 'Finalizado',
};

function low(v) {
  return (v || '').toString().toLowerCase();
}

// --------- acceso a campos (top-level + data + path) ---------
function getByPath(obj, path) {
  if (!obj) return undefined;
  const parts = String(path || '')
    .split('.')
    .map((s) => s.trim())
    .filter(Boolean);

  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur?.[p];
  }
  return cur;
}

/**
 * getValueByField:
 * - Si field contiene ".", se interpreta como path (ej: "data.inicio_prod_imput")
 * - Busca en ctx[field]
 * - Fallback: busca en ctx.data[field] si ctx.data es objeto
 * - Fallback case-insensitive (ctx y ctx.data)
 */
function getValueByField(ctx, field) {
  if (!ctx || !field) return undefined;

  const f = String(field).trim();
  if (!f) return undefined;

  // path explícito
  if (f.includes('.')) {
    const v = getByPath(ctx, f);
    if (v !== undefined) return v;
  }

  // top-level exacto
  if (Object.prototype.hasOwnProperty.call(ctx, f)) return ctx[f];

  // data exacto
  const data = ctx?.data;
  if (data && typeof data === 'object' && Object.prototype.hasOwnProperty.call(data, f)) return data[f];

  // case-insensitive top-level
  const fk = f.toLowerCase();
  for (const k of Object.keys(ctx)) {
    if (String(k).toLowerCase() === fk) return ctx[k];
  }

  // case-insensitive data
  if (data && typeof data === 'object') {
    for (const k of Object.keys(data)) {
      if (String(k).toLowerCase() === fk) return data[k];
    }
  }

  return undefined;
}

function evalRule(ctx, rule) {
  const field = rule?.field;
  const op = rule?.op;
  const value = rule?.value;

  const actual = getValueByField(ctx, field);

  const asNum = (x) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  };

  if (op === '=') return String(actual ?? '') === String(value ?? '');
  if (op === '!=') return String(actual ?? '') !== String(value ?? '');

  if (op === '>') {
    const a = asNum(actual);
    const b = asNum(value);
    return a !== null && b !== null && a > b;
  }
  if (op === '>=') {
    const a = asNum(actual);
    const b = asNum(value);
    return a !== null && b !== null && a >= b;
  }
  if (op === '<') {
    const a = asNum(actual);
    const b = asNum(value);
    return a !== null && b !== null && a < b;
  }
  if (op === '<=') {
    const a = asNum(actual);
    const b = asNum(value);
    return a !== null && b !== null && a <= b;
  }

  if (op === 'in') {
    if (!Array.isArray(value)) return false;
    return value.map(String).includes(String(actual));
  }

  if (op === 'contains') {
    return String(actual ?? '').toLowerCase().includes(String(value ?? '').toLowerCase());
  }

  return false;
}

function evalConditionJson(ctx, conditionJson) {
  if (!conditionJson) return true;

  let obj = conditionJson;
  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj);
    } catch {
      return false;
    }
  }

  const all = Array.isArray(obj.all) ? obj.all : [];
  const any = Array.isArray(obj.any) ? obj.any : [];

  const allOk = all.every((r) => evalRule(ctx, r));
  const anyOk = any.length ? any.some((r) => evalRule(ctx, r)) : true;

  return allOk && anyOk;
}

async function getWorkflowConfig(line) {
  const [st, ed, rq] = await Promise.all([
    pool.query(
      `
      select line, key, label, status_col, start_col, end_col, enabled
      from public.workflow_stage
      where line = $1
      order by key asc;
      `,
      [line]
    ),
    pool.query(
      `
      select id, line, from_key, to_key, priority, enabled, condition_json
      from public.workflow_edge
      where line = $1
      order by from_key asc, priority asc, to_key asc;
      `,
      [line]
    ),
    pool.query(
      `
      select id, line, stage_key, type, group_id, required_key
      from public.workflow_requirement
      where line = $1
      order by stage_key asc, type asc, group_id asc nulls first, required_key asc;
      `,
      [line]
    ),
  ]);

  return { stages: st.rows, edges: ed.rows, requirements: rq.rows };
}

async function loadStageMap(line) {
  const { rows } = await pool.query(
    `
    select key, label, status_col, start_col, end_col, enabled
    from public.workflow_stage
    where line = $1;
    `,
    [line]
  );
  const map = new Map();
  for (const r of rows) map.set(r.key, r);
  return map;
}

async function getNextStages(line, fromKey, ctx) {
  const { rows } = await pool.query(
    `
    select id, line, from_key, to_key, priority, enabled, condition_json
    from public.workflow_edge
    where line = $1 and from_key = $2 and enabled = true
    order by priority asc, to_key asc;
    `,
    [line, fromKey]
  );

  const next = [];
  for (const e of rows) {
    if (evalConditionJson(ctx, e.condition_json)) next.push(e.to_key);
  }
  return next;
}

async function checkRequirements(line, stageKey, rowData) {
  const { rows } = await pool.query(
    `
    select type, group_id, required_key
    from public.workflow_requirement
    where line = $1 and stage_key = $2;
    `,
    [line, stageKey]
  );

  const reqAll = rows.filter((r) => r.type === 'ALL').map((r) => r.required_key);

  const anyGroups = new Map();
  for (const r of rows.filter((r) => r.type === 'ANY_GROUP')) {
    const gid = r.group_id ?? 0;
    if (!anyGroups.has(gid)) anyGroups.set(gid, []);
    anyGroups.get(gid).push(r.required_key);
  }

  const isFinal = (k) => low(rowData?.[k]) === low(STATUS.FINALIZADO);

  for (const k of reqAll) {
    if (!isFinal(k)) return { ok: false, reason: `Requisito ALL no cumplido: ${k} no está Finalizado` };
  }

  for (const [gid, keys] of anyGroups.entries()) {
    const ok = keys.some((k) => isFinal(k));
    if (!ok) {
      return {
        ok: false,
        reason: `Requisito ANY_GROUP(${gid}) no cumplido: ninguno de [${keys.join(', ')}] está Finalizado`,
      };
    }
  }

  return { ok: true };
}

module.exports = {
  STATUS,
  low,
  evalRule,
  evalConditionJson,
  getWorkflowConfig,
  loadStageMap,
  getNextStages,
  checkRequirements,
};

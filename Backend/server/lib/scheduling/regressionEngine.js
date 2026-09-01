// lib/scheduling/regressionEngine.js
//
// Regresión "pull" (Fase 2a, modo sombra, capacidad infinita): dado un
// portón con fecha límite, resuelve el subgrafo REAL de etapas por las que
// pasa (no un camino único — la ruta real tiene ramas paralelas que
// convergen, ver plan de implementación) y hace un backward-pass estilo
// CPM/PERT para calcular {latest_start, latest_finish} de cada etapa.
//
// Reusa, sin reimplementar nada:
//  - evalConditionJson de lib/workflow.js (mismo motor de condiciones que ya
//    usa workflow_edge para decidir la siguiente etapa)
//  - computeEffectiveMinutes de lib/scheduling/rulesEngine.js
//  - rollBackForStage de lib/scheduling/calendar.js
//
// Ámbito de Fase 2a: line='portones' únicamente (mismo criterio que ya usa
// el preview de Fase 1). Para esa línea, workflow_stage.key === status_col
// en todas las filas (confirmado contra la base real) — así que este motor
// usa un solo valor de stage_key para ambos propósitos (join contra
// workflow_edge y lectura de campos del ctx tipo `${stage}_inicio`).
const { pool } = require('../../db');
const { evalConditionJson } = require('../workflow');
const { computeEffectiveMinutes } = require('./rulesEngine');
const { rollBackForStage, arDateTimeToInstant } = require('./calendar');

const MAX_SUBGRAPH_NODES = 500;

// Predecesores inmediatos de `toKey` cuyo condition_json matchea ctx —
// análogo inverso de getNextStages (lib/workflow.js:197-213).
async function getPredecessorStages(line, toKey, ctx, db = pool) {
  const { rows } = await db.query(
    `
    select from_key, condition_json
    from public.workflow_edge
    where line = $1 and to_key = $2 and enabled = true
    order by priority asc, from_key asc;
    `,
    [line, toKey]
  );

  const seen = new Set();
  const matched = [];
  for (const row of rows) {
    if (!evalConditionJson(ctx, row.condition_json)) continue;
    if (seen.has(row.from_key)) continue;
    seen.add(row.from_key);
    matched.push(row.from_key);
  }
  return matched;
}

// La etapa raíz de una línea: la única fila de workflow_stage que nunca
// aparece como from_key de un edge habilitado (para 'portones', 'despacho').
// No se hardcodea el nombre a propósito.
async function resolveRootStage(line, db = pool) {
  const { rows } = await db.query(
    `
    select s.key
    from public.workflow_stage s
    where s.line = $1 and s.enabled = true
      and not exists (
        select 1 from public.workflow_edge e
        where e.line = s.line and e.from_key = s.key and e.enabled = true
      );
    `,
    [line]
  );
  if (rows.length === 1) return rows[0].key;
  if (!rows.length) throw new Error(`No se encontró una etapa raíz (sin salidas) para line="${line}".`);
  const preferred = rows.find((r) => r.key === 'despacho');
  if (preferred) return preferred.key;
  throw new Error(
    `Hay ${rows.length} etapas sin salidas para line="${line}" (${rows.map((r) => r.key).join(', ')}) — no se pudo resolver la raíz automáticamente.`
  );
}

// BFS hacia atrás desde rootKey, armando el subgrafo real de este portón.
// edgesByTo(X) = predecesores inmediatos de X; edgesByFrom(X) = sucesores
// inmediatos de X, ambos restringidos a lo que realmente aplica a este ctx.
async function resolvePortonSubgraph(line, rootKey, ctx, db = pool) {
  const nodes = new Set([rootKey]);
  const edgesByTo = new Map();
  const edgesByFrom = new Map();
  const visited = new Set([rootKey]);
  const queue = [rootKey];

  while (queue.length) {
    const current = queue.shift();
    const predecessors = await getPredecessorStages(line, current, ctx, db);
    edgesByTo.set(current, predecessors);

    for (const fromKey of predecessors) {
      if (!edgesByFrom.has(fromKey)) edgesByFrom.set(fromKey, []);
      edgesByFrom.get(fromKey).push(current);

      if (!visited.has(fromKey)) {
        visited.add(fromKey);
        nodes.add(fromKey);
        queue.push(fromKey);
        if (nodes.size > MAX_SUBGRAPH_NODES) {
          throw new Error(
            `El subgrafo de "${line}" superó ${MAX_SUBGRAPH_NODES} nodos — posible workflow_edge mal cargado (ciclo o condición demasiado permisiva).`
          );
        }
      }
    }
  }

  return { rootKey, nodes, edgesByTo, edgesByFrom };
}

// Chequeo de consistencia opcional, no bloqueante: para cada etapa con
// requisitos declarados, confirma que cada required_key (ALL) / al menos uno
// por grupo (ANY_GROUP) está entre los ANCESTROS TRANSITIVOS de esa etapa en
// el subgrafo resuelto — no necesariamente predecesor inmediato (ej.
// "guillotina"/"plegadora" son ancestros transitivos de "armado_marco_piernas",
// no predecesores directos). Devuelve warnings, nunca aborta el cálculo.
async function checkRequirementConsistency(line, subgraph, db = pool) {
  const { rows } = await db.query(
    `select stage_key, type, group_id, required_key from public.workflow_requirement where line = $1;`,
    [line]
  );
  if (!rows.length) return [];

  const ancestorsCache = new Map();
  function transitiveAncestors(stageKey) {
    if (ancestorsCache.has(stageKey)) return ancestorsCache.get(stageKey);
    const result = new Set();
    const stack = [...(subgraph.edgesByTo.get(stageKey) || [])];
    while (stack.length) {
      const n = stack.pop();
      if (result.has(n)) continue;
      result.add(n);
      stack.push(...(subgraph.edgesByTo.get(n) || []));
    }
    ancestorsCache.set(stageKey, result);
    return result;
  }

  const byStage = new Map();
  for (const r of rows) {
    if (!subgraph.nodes.has(r.stage_key)) continue; // el requisito no aplica a este portón
    if (!byStage.has(r.stage_key)) byStage.set(r.stage_key, []);
    byStage.get(r.stage_key).push(r);
  }

  const warnings = [];
  for (const [stageKey, reqs] of byStage.entries()) {
    const ancestors = transitiveAncestors(stageKey);
    const allReqs = reqs.filter((r) => r.type === 'ALL');
    for (const r of allReqs) {
      if (!ancestors.has(r.required_key)) {
        warnings.push(`"${stageKey}" requiere ALL "${r.required_key}" pero no aparece en su subgrafo resuelto.`);
      }
    }
    const groups = new Map();
    for (const r of reqs.filter((r) => r.type === 'ANY_GROUP')) {
      const gid = r.group_id ?? 0;
      if (!groups.has(gid)) groups.set(gid, []);
      groups.get(gid).push(r.required_key);
    }
    for (const [gid, keys] of groups.entries()) {
      if (!keys.some((k) => ancestors.has(k))) {
        warnings.push(`"${stageKey}" requiere ANY_GROUP(${gid}) [${keys.join(', ')}] pero ninguno aparece en su subgrafo resuelto.`);
      }
    }
  }
  return warnings;
}

function fechaPlanEntregaToDateKey(value) {
  if (!value) return null;
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

// Ancla decidida: fin del día (23:59:59, hora Argentina) de fecha_plan_entrega.
function deadlineFromFechaPlanEntrega(fechaPlanEntrega) {
  const dateKey = fechaPlanEntregaToDateKey(fechaPlanEntrega);
  if (!dateKey) return null;
  return arDateTimeToInstant(dateKey, '23:59:59');
}

// Backward-pass (Kahn's algorithm sobre el subgrafo, procesando por
// out-degree en vez de in-degree: primero los nodos sin sucesores — la
// raíz —, y de ahí hacia las etapas iniciales). Kahn's cumple dos roles a
// la vez: da el orden de cálculo correcto (sucesores resueltos antes que
// predecesores) y sirve de guard contra ciclos — si al final quedan nodos
// sin procesar, hay un ciclo real en las condiciones cargadas.
async function computeBackwardPass({ line, subgraph, deadline, standardByStage, rulesByStage, ctx, db = pool, calendarCache }) {
  const { nodes, edgesByTo, edgesByFrom } = subgraph;

  const outDegreeRemaining = new Map();
  for (const n of nodes) outDegreeRemaining.set(n, (edgesByFrom.get(n) || []).length);

  const queue = [...nodes].filter((n) => outDegreeRemaining.get(n) === 0);
  if (!queue.length) {
    return { ok: false, error: 'No se encontró una etapa sin sucesores en el subgrafo (no se puede anclar la fecha límite).' };
  }

  const resolved = new Map();
  const warnings = [];
  const cache = calendarCache || new Map();

  while (queue.length) {
    const stageKey = queue.shift();
    if (resolved.has(stageKey)) continue;

    const successors = edgesByFrom.get(stageKey) || [];
    let latestFinish;
    if (!successors.length) {
      latestFinish = deadline;
    } else {
      const starts = successors.map((s) => resolved.get(s)?.latest_start).filter((d) => d instanceof Date);
      if (starts.length !== successors.length) {
        warnings.push(`"${stageKey}": no se pudieron resolver todos los sucesores antes de procesarlo (orden topológico inconsistente).`);
      }
      latestFinish = starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : deadline;
    }

    const standardMinutes = standardByStage.get(stageKey) ?? 0;
    const rules = rulesByStage.get(stageKey) || [];
    const calc = computeEffectiveMinutes({ standardMinutes, rules, ctx });
    const minutes = Math.max(0, calc.effective_minutes);

    const rollback = await rollBackForStage({ line, stageKey, deadline: latestFinish, minutes, db, cache });
    if (!rollback.ok) warnings.push(`"${stageKey}": ${rollback.error}`);

    resolved.set(stageKey, {
      stage_key: stageKey,
      latest_finish: latestFinish,
      latest_start: rollback.ok ? rollback.start : latestFinish,
      effective_minutes: minutes,
      standard_minutes: standardMinutes,
      resource_key: rollback.resource_key || stageKey,
      using_fallback_calendar: rollback.using_fallback_calendar !== false,
      predecessors: edgesByTo.get(stageKey) || [],
      successors,
      matched_rules: calc.matched_rules,
    });

    for (const pred of edgesByTo.get(stageKey) || []) {
      const remaining = (outDegreeRemaining.get(pred) ?? 0) - 1;
      outDegreeRemaining.set(pred, remaining);
      if (remaining === 0) queue.push(pred);
    }
  }

  if (resolved.size !== nodes.size) {
    return {
      ok: false,
      error: 'Se detectó un ciclo en el grafo de etapas — no se pudo resolver un orden topológico completo.',
      resolved: Object.fromEntries(resolved),
    };
  }

  return { ok: true, resolved: Object.fromEntries(resolved), warnings };
}

// Orquesta todo lo anterior para un portón: resuelve raíz + subgrafo,
// corre el backward-pass, agrega el chequeo de consistencia opcional.
async function computePortonRegression({ line, ctx, standardByStage, rulesByStage, db = pool }) {
  const deadline = deadlineFromFechaPlanEntrega(ctx?.fecha_plan_entrega);
  if (!deadline) {
    return { ok: true, warning: 'fecha_plan_entrega no está seteada para este portón — no se puede calcular la regresión.' };
  }

  const rootKey = await resolveRootStage(line, db);
  const subgraph = await resolvePortonSubgraph(line, rootKey, ctx, db);
  const pass = await computeBackwardPass({ line, subgraph, deadline, standardByStage, rulesByStage, ctx, db });
  const consistencyWarnings = await checkRequirementConsistency(line, subgraph, db).catch(() => []);

  return {
    ok: pass.ok,
    error: pass.error,
    deadline,
    root_key: rootKey,
    stages: pass.resolved,
    warnings: [...(pass.warnings || []), ...consistencyWarnings],
  };
}

module.exports = {
  getPredecessorStages,
  resolveRootStage,
  resolvePortonSubgraph,
  checkRequirementConsistency,
  computeBackwardPass,
  computePortonRegression,
  deadlineFromFechaPlanEntrega,
  fechaPlanEntregaToDateKey,
};

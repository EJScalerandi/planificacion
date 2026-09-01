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
const { rollBackForStage, arDateTimeToInstant, loadResourceCalendars, fetchStageResourceMap } = require('./calendar');
const { createCapacityLedger, commitConsumption, summarizeLedger } = require('./capacityLedger');

const MAX_SUBGRAPH_NODES = 500;

// workflow_edge de una línea es un dato ESTÁTICO por línea (no depende del
// portón) — pedirlo una sola vez y filtrar en memoria durante el BFS de
// resolvePortonSubgraph, en vez de una query por nodo visitado (con ~19
// etapas eran ~19 round-trips redundantes por portón, medido).
async function fetchWorkflowEdgeRows(line, db = pool) {
  const { rows } = await db.query(
    `select from_key, to_key, priority, condition_json from public.workflow_edge where line = $1 and enabled = true order by to_key asc, priority asc, from_key asc;`,
    [line]
  );
  return rows;
}

// Predecesores inmediatos de `toKey` cuyo condition_json matchea ctx, a
// partir de las filas de workflow_edge YA TRAÍDAS (edgeRows) — análogo
// inverso de getNextStages (lib/workflow.js:197-213), pero en memoria.
function getPredecessorStagesFromRows(toKey, ctx, edgeRows) {
  const seen = new Set();
  const matched = [];
  for (const row of edgeRows) {
    if (row.to_key !== toKey) continue;
    if (!evalConditionJson(ctx, row.condition_json)) continue;
    if (seen.has(row.from_key)) continue;
    seen.add(row.from_key);
    matched.push(row.from_key);
  }
  return matched;
}

// Versión que sí pega contra la base — queda como primitiva suelta/de
// depuración (una sola etapa, sin armar el subgrafo completo); resolvePortonSubgraph
// ya no la usa internamente (trae edgeRows una vez y usa la versión en
// memoria de arriba).
async function getPredecessorStages(line, toKey, ctx, db = pool) {
  const edgeRows = await fetchWorkflowEdgeRows(line, db);
  return getPredecessorStagesFromRows(toKey, ctx, edgeRows);
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
// `edgeRows` (opcional, ver fetchWorkflowEdgeRows) evita traer workflow_edge
// de nuevo si ya se pidió antes (computeFleetRegression lo comparte entre
// todo un lote — las filas son las mismas para cualquier portón de la misma
// línea, lo único que cambia por portón es cuáles matchean via evalConditionJson).
async function resolvePortonSubgraph(line, rootKey, ctx, db = pool, edgeRows) {
  const rows = edgeRows || (await fetchWorkflowEdgeRows(line, db));

  const nodes = new Set([rootKey]);
  const edgesByTo = new Map();
  const edgesByFrom = new Map();
  const visited = new Set([rootKey]);
  const queue = [rootKey];

  while (queue.length) {
    const current = queue.shift();
    const predecessors = getPredecessorStagesFromRows(current, ctx, rows);
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

// workflow_requirement es un dato por LÍNEA, no por portón — separado para
// poder pedirlo una sola vez en computeFleetRegression en vez de una vez por
// portón (ver checkRequirementConsistency).
async function fetchWorkflowRequirementRows(line, db = pool) {
  const { rows } = await db.query(
    `select stage_key, type, group_id, required_key from public.workflow_requirement where line = $1;`,
    [line]
  );
  return rows;
}

// Chequeo de consistencia opcional, no bloqueante: para cada etapa con
// requisitos declarados, confirma que cada required_key (ALL) / al menos uno
// por grupo (ANY_GROUP) está entre los ANCESTROS TRANSITIVOS de esa etapa en
// el subgrafo resuelto — no necesariamente predecesor inmediato (ej.
// "guillotina"/"plegadora" son ancestros transitivos de "armado_marco_piernas",
// no predecesores directos). Devuelve warnings, nunca aborta el cálculo.
// `requirementRows` es opcional (ver fetchWorkflowRequirementRows) — si no
// se pasa, se pide acá mismo (comportamiento igual al de Fase 2a).
async function checkRequirementConsistency(line, subgraph, db = pool, requirementRows) {
  const rows = requirementRows || (await fetchWorkflowRequirementRows(line, db));
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
async function computeBackwardPass({ line, subgraph, deadline, standardByStage, rulesByStage, ctx, db = pool, calendarCache, capacityLedger, calendarWindow, stageResourceMap }) {
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

  // Pre-cargar en bloque el calendario de TODOS los recursos que este
  // subgrafo va a necesitar, en vez de dejar que cada nodo lo pida de a uno
  // (eso era ~3 round-trips por etapa — con ~19 etapas, el grueso de los
  // ~30s que tardaba un portón aislado antes de esta optimización). Los
  // resource_key que ya estén en `cache` (ej. porque computeFleetRegression
  // los precargó para todo el lote) se saltean.
  const neededResourceKeys = [...nodes].map((stageKey) => stageResourceMap?.get(stageKey) || stageKey);
  const missingResourceKeys = neededResourceKeys.filter((rk) => !cache.has(rk));
  if (missingResourceKeys.length) {
    const loaded = await loadResourceCalendars(missingResourceKeys, { deadline: calendarWindow?.deadline || deadline, maxLookbackDays: calendarWindow?.maxLookbackDays }, db);
    for (const [resourceKey, calendar] of loaded.entries()) cache.set(resourceKey, calendar);
  }

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

    const rollback = await rollBackForStage({ line, stageKey, deadline: latestFinish, minutes, db, cache, capacityLedger, calendarWindow, stageResourceMap });
    if (!rollback.ok) {
      warnings.push(`"${stageKey}": ${rollback.error}`);
    } else if (capacityLedger) {
      // Comprometer el consumo SOLO en éxito — un rollback fallido no debe
      // "gastar" cupo real por un resultado que ni siquiera es válido.
      commitConsumption(capacityLedger, rollback.consumption);
    }

    resolved.set(stageKey, {
      stage_key: stageKey,
      latest_finish: latestFinish,
      latest_start: rollback.ok ? rollback.start : latestFinish,
      effective_minutes: minutes,
      standard_minutes: standardMinutes,
      resource_key: rollback.resource_key || stageKey,
      using_fallback_calendar: rollback.using_fallback_calendar !== false,
      resource_constrained: !!rollback.resource_constrained,
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
//
// Parámetros opcionales, todos pensados para computeFleetRegression (datos
// por LÍNEA que no cambian entre portones — pasarlos ya resueltos evita
// repetir esas queries una vez por portón):
//   - capacityLedger (Fase 2b): si se pasa, el rollback de cada etapa
//     compite por el cupo diario real de su recurso contra lo que hayan
//     consumido otros portones procesados ANTES con ESE MISMO ledger — sin
//     él, capacidad infinita (comportamiento de Fase 2a).
//   - rootKey / requirementRows / edgeRows / stageResourceMap: evitan
//     resolver la raíz, traer workflow_requirement, workflow_edge y el
//     mapeo etapa->recurso de nuevo por cada portón.
//   - calendarCache / calendarWindow: ver computeFleetRegression más abajo —
//     evita releer el calendario de cada recurso una vez por portón.
async function computePortonRegression({
  line, ctx, standardByStage, rulesByStage, db = pool, capacityLedger,
  rootKey: providedRootKey, requirementRows, calendarCache, calendarWindow,
  edgeRows, stageResourceMap,
}) {
  const deadline = deadlineFromFechaPlanEntrega(ctx?.fecha_plan_entrega);
  if (!deadline) {
    return { ok: true, warning: 'fecha_plan_entrega no está seteada para este portón — no se puede calcular la regresión.' };
  }

  const rootKey = providedRootKey || (await resolveRootStage(line, db));
  const resolvedStageResourceMap = stageResourceMap || (await fetchStageResourceMap(line, db));
  const subgraph = await resolvePortonSubgraph(line, rootKey, ctx, db, edgeRows);
  const pass = await computeBackwardPass({ line, subgraph, deadline, standardByStage, rulesByStage, ctx, db, capacityLedger, calendarCache, calendarWindow, stageResourceMap: resolvedStageResourceMap });
  const consistencyWarnings = await checkRequirementConsistency(line, subgraph, db, requirementRows).catch(() => []);

  return {
    ok: pass.ok,
    error: pass.error,
    deadline,
    root_key: rootKey,
    stages: pass.resolved,
    warnings: [...(pass.warnings || []), ...consistencyWarnings],
  };
}

// Fase 2b: corre la regresión de VARIOS portones compitiendo por el mismo
// cupo diario. `ctxs` tiene que venir en orden EDD (más urgente primero —
// listPortonesPendingForRegression ya los da así): el ledger de capacidad
// se crea una sola vez y se comparte entre todos, así que cada portón solo
// ve el consumo de los procesados ANTES que él (los más urgentes). Trunca
// `ctxs` con `limit` es una perilla de performance segura — un portón fuera
// del corte nunca puede afectar a uno adentro, el consumo solo fluye hacia
// adelante en la lista.
//
// Optimización importante (sin la cual N portones hacen ~N veces más
// queries de las necesarias): rootKey y workflow_requirement se resuelven
// una sola vez acá (son datos por línea, no por portón), y el calendario de
// cada recurso se cachea COMPARTIDO entre todos los portones del lote — algo
// que Fase 2a deliberadamente NO hacía entre portones distintos (cada
// computePortonRegression armaba su propio calendarCache). La razón de
// Fase 2a para no compartirlo seguía siendo válida (la ventana de búsqueda
// de excepciones quedaba anclada al deadline del primer portón que tocaba
// cada recurso, y eso podía no cubrir a un portón con un deadline muy
// distinto) — acá se resuelve de raíz: la ventana compartida se calcula
// con el RANGO COMPLETO de fechas límite del lote (la más lejana hacia
// adelante fija el ancla, la más cercana hacia atrás estira el
// maxLookbackDays), así que cubre a cualquier portón del lote sin importar
// en qué orden se procesen.
async function computeFleetRegression({ line, ctxs, standardByStage, rulesByStage, db = pool }) {
  const capacityLedger = createCapacityLedger();
  const calendarCache = new Map();
  const portones = [];

  // Las 4 líneas siguientes son el grueso del ahorro de esta función: sin
  // ellas, cada portón del lote repetiría estas mismas 4 consultas (datos
  // de la LÍNEA, no del portón) — con esto, se piden una sola vez para todo
  // el lote entero, sin importar cuántos portones sean.
  const rootKey = await resolveRootStage(line, db);
  const requirementRows = await fetchWorkflowRequirementRows(line, db);
  const edgeRows = await fetchWorkflowEdgeRows(line, db);
  const stageResourceMap = await fetchStageResourceMap(line, db);

  const deadlines = (ctxs || [])
    .map((ctx) => deadlineFromFechaPlanEntrega(ctx?.fecha_plan_entrega))
    .filter((d) => d instanceof Date);
  let calendarWindow;
  if (deadlines.length) {
    const maxDeadline = new Date(Math.max(...deadlines.map((d) => d.getTime())));
    const minDeadline = new Date(Math.min(...deadlines.map((d) => d.getTime())));
    const spreadDays = Math.ceil((maxDeadline.getTime() - minDeadline.getTime()) / 86400000);
    calendarWindow = { deadline: maxDeadline, maxLookbackDays: 180 + spreadDays };
  }

  for (const ctx of ctxs || []) {
    try {
      const result = await computePortonRegression({
        line, ctx, standardByStage, rulesByStage, db, capacityLedger,
        rootKey, requirementRows, calendarCache, calendarWindow,
        edgeRows, stageResourceMap,
      });
      portones.push({ id: ctx.id, nv: ctx.nv, sistema: ctx.sistema, ...result });
    } catch (err) {
      portones.push({ id: ctx.id, nv: ctx.nv, ok: false, error: err.message });
    }
  }

  return { ok: true, mode: 'fleet', portones, ledger_summary: summarizeLedger(capacityLedger) };
}

module.exports = {
  fetchWorkflowEdgeRows,
  getPredecessorStagesFromRows,
  getPredecessorStages,
  resolveRootStage,
  fetchWorkflowRequirementRows,
  resolvePortonSubgraph,
  checkRequirementConsistency,
  computeBackwardPass,
  computePortonRegression,
  computeFleetRegression,
  deadlineFromFechaPlanEntrega,
  fechaPlanEntregaToDateKey,
};

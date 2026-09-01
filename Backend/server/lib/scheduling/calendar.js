// lib/scheduling/calendar.js
//
// Calendario laboral por recurso (categoría "Tiempo" del diseño): dado un
// recurso, una fecha límite y una duración en minutos, calcula hacia atrás
// el instante de entrada saltando horas no laborables/feriados.
//
// Argentina usa UTC-3 fijo, sin horario de verano, desde 2009 — por eso acá
// se hace la matemática de fecha/hora con un offset fijo en vez de
// Intl.DateTimeFormat (que sí usa insumosPedidos.js para *formatear* la hora
// actual, un caso de uso distinto): en un loop que recorre muchos días hacia
// atrás, el offset fijo es más simple y evita reformatear en cada iteración.
const { pool } = require('../../db');

const AR_OFFSET_MINUTES = -180; // UTC-3

const DEFAULT_MAX_LOOKBACK_DAYS = 180;

// Fallback si un recurso no tiene calendario cargado: Lun-Vie 08:00-18:00.
// weekday: 0=domingo..6=sábado (igual que Date.getUTCDay()).
const DEFAULT_SHIFTS = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  start_time: '08:00:00',
  end_time: '18:00:00',
}));

function pad2(n) {
  return String(n).padStart(2, '0');
}

// Instante absoluto -> {dateKey, weekday, minutesOfDay} en hora de Argentina.
function toArParts(date) {
  const local = new Date(date.getTime() + AR_OFFSET_MINUTES * 60000);
  const y = local.getUTCFullYear();
  const m = pad2(local.getUTCMonth() + 1);
  const d = pad2(local.getUTCDate());
  return {
    dateKey: `${y}-${m}-${d}`,
    weekday: local.getUTCDay(),
    minutesOfDay: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}

// 'YYYY-MM-DD' + 'HH:MM[:SS]' en hora de Argentina -> instante absoluto (Date).
function arDateTimeToInstant(dateKey, timeStr) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  const [hh, mm, ss] = String(timeStr).split(':').map(Number);
  const asIfUtc = Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, ss || 0);
  return new Date(asIfUtc - AR_OFFSET_MINUTES * 60000);
}

function addDaysToDateKey(dateKey, delta) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/**
 * Función pura: recorre hacia atrás desde `deadline` consumiendo `minutes` de
 * tiempo laborable, saltando feriados/fuera de horario.
 *
 * @param {Date} deadline
 * @param {number} minutes
 * @param {Array<{weekday:number, start_time:string, end_time:string}>} shifts
 * @param {Map<string, {is_working:boolean, start_time:string|null, end_time:string|null}>} exceptions - keyed by 'YYYY-MM-DD'
 * @param {number} maxLookbackDays
 */
function rollBackByWorkingMinutes({ deadline, minutes, shifts, exceptions, maxLookbackDays = DEFAULT_MAX_LOOKBACK_DAYS }) {
  const safeMinutes = Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
  if (safeMinutes === 0) return { ok: true, start: new Date(deadline) };

  const exMap = exceptions instanceof Map ? exceptions : new Map();
  // Sin fallback acá a propósito: un `shifts` vacío es una entrada válida (un
  // recurso realmente sin ningún turno habilitado) y tiene que poder agotar
  // maxLookbackDays y devolver error — no silenciarse con el default. El
  // fallback a DEFAULT_SHIFTS pasa una sola vez, en loadResourceCalendar,
  // cuando de verdad no hay ninguna fila de calendario cargada.
  const shiftList = Array.isArray(shifts) ? shifts : [];

  let remaining = safeMinutes;
  let cursor = new Date(deadline);
  let daysChecked = 0;

  while (remaining > 0) {
    daysChecked += 1;
    if (daysChecked > maxLookbackDays) {
      return {
        ok: false,
        error: `No se encontró suficiente tiempo hábil en los últimos ${maxLookbackDays} días (revisar el calendario del recurso).`,
      };
    }

    const { dateKey, weekday } = toArParts(cursor);
    const exception = exMap.get(dateKey);

    let dayShifts;
    if (exception) {
      if (!exception.is_working) {
        cursor = arDateTimeToInstant(addDaysToDateKey(dateKey, -1), '23:59:59');
        continue;
      }
      dayShifts = [{ start_time: exception.start_time || '00:00:00', end_time: exception.end_time || '23:59:59' }];
    } else {
      dayShifts = shiftList.filter((s) => Number(s.weekday) === weekday && s.enabled !== false);
      if (!dayShifts.length) {
        cursor = arDateTimeToInstant(addDaysToDateKey(dateKey, -1), '23:59:59');
        continue;
      }
    }

    // Turno más tardío primero: consumimos desde el final del día hacia atrás.
    const sorted = [...dayShifts].sort((a, b) => String(b.start_time).localeCompare(String(a.start_time)));

    let advancedWithinDay = false;
    for (const shift of sorted) {
      const shiftStart = arDateTimeToInstant(dateKey, shift.start_time);
      const shiftEnd = arDateTimeToInstant(dateKey, shift.end_time);
      const windowEnd = cursor.getTime() < shiftEnd.getTime() ? cursor : shiftEnd;
      if (windowEnd.getTime() <= shiftStart.getTime()) continue; // turno ya consumido por el cursor actual

      const availableMinutes = (windowEnd.getTime() - shiftStart.getTime()) / 60000;
      if (availableMinutes >= remaining) {
        const start = new Date(windowEnd.getTime() - remaining * 60000);
        return { ok: true, start };
      }
      remaining -= availableMinutes;
      cursor = shiftStart;
      advancedWithinDay = true;
    }

    if (!advancedWithinDay) {
      // Ningún turno del día tenía ventana disponible antes del cursor (ej.
      // el cursor ya estaba antes de que empezara el primer turno del día).
      cursor = arDateTimeToInstant(addDaysToDateKey(dateKey, -1), '23:59:59');
    } else {
      cursor = arDateTimeToInstant(addDaysToDateKey(dateKey, -1), '23:59:59');
    }
  }

  // No debería llegar acá (el loop retorna en cuanto remaining llega a 0).
  return { ok: true, start: cursor };
}

async function getResourceKeyForStage(line, stageKey, db = pool) {
  const { rows } = await db.query(
    `select resource_key from public.scheduling_stage_resource where line = $1 and stage_key = $2 limit 1;`,
    [line, stageKey]
  );
  return rows[0]?.resource_key || stageKey;
}

function exceptionsToMap(rows) {
  const map = new Map();
  const globals = rows.filter((r) => r.resource_key == null);
  const specifics = rows.filter((r) => r.resource_key != null);
  // Global primero, específico pisa: un feriado propio del recurso gana sobre
  // uno de planta si por algún motivo coexisten para la misma fecha.
  for (const r of [...globals, ...specifics]) map.set(r.exception_date, r);
  return map;
}

async function loadResourceCalendar(resourceKey, { deadline, maxLookbackDays = DEFAULT_MAX_LOOKBACK_DAYS } = {}, db = pool) {
  const anchor = deadline instanceof Date ? deadline : new Date(deadline);

  const [{ rows: shiftRows }, { rows: exceptionRows }] = await Promise.all([
    db.query(
      `
      select weekday, start_time, end_time, enabled
      from public.scheduling_resource_calendar
      where resource_key = $1 and enabled = true
      order by weekday asc, start_time asc;
      `,
      [resourceKey]
    ),
    db.query(
      `
      select resource_key, to_char(exception_date, 'YYYY-MM-DD') as exception_date, is_working, start_time, end_time
      from public.scheduling_calendar_exception
      where (resource_key = $1 or resource_key is null)
        and exception_date between ($2::timestamptz - ($3 || ' days')::interval)::date and $2::date
      order by exception_date asc;
      `,
      [resourceKey, anchor.toISOString(), maxLookbackDays]
    ),
  ]);

  const usingFallback = shiftRows.length === 0;
  return {
    shifts: usingFallback ? DEFAULT_SHIFTS : shiftRows,
    exceptions: exceptionsToMap(exceptionRows),
    usingFallback,
  };
}

/**
 * Wrapper de alto nivel: resuelve el recurso de una etapa, carga (con cache
 * por resource_key) su calendario, y calcula hacia atrás la hora de entrada.
 *
 * `cache` es un Map compartido por todo un árbol de regresión (pasado por el
 * caller) para no releer el calendario por cada nodo. Simplificación
 * deliberada de Fase 2a: la ventana de búsqueda de excepciones se ancla al
 * `deadline` de la PRIMERA llamada que toca ese recurso, no a cada llamada
 * — con el default de 180 días de margen esto no pierde feriados reales en
 * la práctica; si hiciera falta más precisión, pasar un `windowDeadline`
 * explícito es la extensión natural.
 */
async function rollBackForStage({ line, stageKey, deadline, minutes, db = pool, cache, maxLookbackDays } = {}) {
  const resourceKey = await getResourceKeyForStage(line, stageKey, db);

  let calendar = cache?.get(resourceKey);
  if (!calendar) {
    calendar = await loadResourceCalendar(resourceKey, { deadline, maxLookbackDays }, db);
    cache?.set(resourceKey, calendar);
  }

  const result = rollBackByWorkingMinutes({
    deadline,
    minutes,
    shifts: calendar.shifts,
    exceptions: calendar.exceptions,
    maxLookbackDays,
  });

  return { ...result, resource_key: resourceKey, using_fallback_calendar: calendar.usingFallback };
}

module.exports = {
  AR_OFFSET_MINUTES,
  DEFAULT_SHIFTS,
  DEFAULT_MAX_LOOKBACK_DAYS,
  toArParts,
  arDateTimeToInstant,
  addDaysToDateKey,
  rollBackByWorkingMinutes,
  getResourceKeyForStage,
  loadResourceCalendar,
  rollBackForStage,
};

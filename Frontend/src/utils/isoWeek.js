// src/utils/isoWeek.js
//
// Cálculo de "semana ISO" (AAAA-Www, lunes a domingo, semana 1 = la que
// contiene el primer jueves del año), compartido entre /a
// (PreproduccionValoresTable.jsx, que ya usaba esta misma cuenta) y la
// pantalla de Logística de Viajes — para que ambas calculen la semana de una
// fecha exactamente igual y no diverjan con el tiempo.
//
// El backend usa el equivalente nativo de Postgres (to_char(fecha, 'IYYY-"W"IW')),
// verificado para dar el mismo resultado que esta implementación en año nuevo,
// semana 53 y demás bordes (ver Backend/server/lib/logisticaViajesDb.js).

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toISODate10(v) {
  if (!v) return '';
  const s = String(v).trim();

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;

  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;

  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const yyyy = d.getUTCFullYear();
    const mm = pad2(d.getUTCMonth() + 1);
    const dd = pad2(d.getUTCDate());
    return `${yyyy}-${mm}-${dd}`;
  }

  return '';
}

function isISODate10(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').trim());
}

function formatDMY(date10) {
  const d = toISODate10(date10);
  if (!d) return '';
  const [yyyy, mm, dd] = d.split('-');
  return `${dd}/${mm}/${yyyy}`;
}

export function isoWeekLabelFromDate(dateLike) {
  const date10 = toISODate10(dateLike);
  if (!isISODate10(date10)) return '';
  const d = new Date(`${date10}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDay = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((d - firstThu) / (7 * 24 * 3600 * 1000));
  const year = d.getUTCFullYear();
  const ww = String(week).padStart(2, '0');
  return `${year}-W${ww}`;
}

export function weekNumberFromLabel(weekLabel) {
  const m = String(weekLabel || '').match(/^\d{4}-W(\d{2})$/);
  if (!m) return '';
  return String(Number(m[1]));
}

export function isoWeekStartEndFromLabel(weekLabel) {
  const m = String(weekLabel || '').match(/^(\d{4})-W(\d{2})$/);
  if (!m) return { start: '', end: '' };
  const year = Number(m[1]);
  const week = Number(m[2]);

  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const week1Mon = new Date(jan4);
  week1Mon.setUTCDate(jan4.getUTCDate() - jan4Day);

  const startDt = new Date(week1Mon);
  startDt.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7);
  const endDt = new Date(startDt);
  endDt.setUTCDate(startDt.getUTCDate() + 7);

  const start = `${startDt.getUTCFullYear()}-${pad2(startDt.getUTCMonth() + 1)}-${pad2(startDt.getUTCDate())}`;
  const end = `${endDt.getUTCFullYear()}-${pad2(endDt.getUTCMonth() + 1)}-${pad2(endDt.getUTCDate())}`;
  return { start, end };
}

export function weekTitleFromSelection(weekLabel) {
  const m = String(weekLabel || '').match(/^\d{4}-W(\d{2})$/);
  const n = m ? String(Number(m[1])) : '';
  const { start, end } = isoWeekStartEndFromLabel(weekLabel);
  if (!n || !start || !end) return '';
  return `Semana ${n} ${formatDMY(start)} al ${formatDMY(end)}`;
}

// Fecha (AAAA-MM-DD) de hoy, en horario local — usada para acotar el date
// picker de "nuevo viaje" a los días de la semana elegida.
export function todayISO10() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

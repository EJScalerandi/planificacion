// src/utils/preproduccionRow.js
//
// Helpers sobre filas de /preproduccion-valores (1 fila por NV, la misma
// fuente que usa /a). Compartido entre /a (PreproduccionValoresTable.jsx,
// que ya tenía estas mismas funciones) y la pantalla de Planificación de
// Fechas, para no divergir en cómo se identifica una fila o qué NV están
// bloqueados.

// TXT servido por el propio frontend (Frontend/public/blocked_nvs.txt).
export const BLOCKED_NV_URL = '/blocked_nvs.txt';

export function normalizeNvToken(token) {
  const s = String(token || '').trim();
  if (!s || s.startsWith('#')) return '';
  const m = s.match(/\d+/);
  return m ? m[0] : s;
}

export function parseBlockedNvText(txt) {
  return new Set(
    String(txt || '')
      .split(/\s+/)
      .map(normalizeNvToken)
      .filter(Boolean)
  );
}

/**
 * getAny: primero intenta match exacto, luego fallback case-insensitive.
 */
export function getAny(obj, keys) {
  if (!obj) return null;

  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null) return obj[k];
  }

  const map = {};
  for (const k of Object.keys(obj)) map[String(k).toLowerCase()] = k;

  for (const k of keys) {
    const realKey = map[String(k).toLowerCase()];
    if (realKey && obj[realKey] != null) return obj[realKey];
  }

  return null;
}

export function getNvCanonicalFromRow(row) {
  const d = row?.data || {};
  const v = getAny(d, ['NV', 'nv']) ?? getAny(row, ['NV', 'nv']);
  if (v == null) return '';
  const s = String(v).trim();
  const m = s.match(/\d+/);
  return m ? m[0] : s;
}

export function getSistemaFromRow(row) {
  const d = row?.data || {};
  const v = d.Sistema ?? d.sistema ?? d.SISTEMA ?? d.Sistemas ?? d.sistemas ?? null;
  const s = String(v ?? '').trim();
  return s ? s : null;
}

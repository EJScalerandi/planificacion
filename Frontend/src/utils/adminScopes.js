// src/utils/adminScopes.js
//
// Lectura de scopes del JWT admin (localStorage) para decidir accessMode.
// Compartido entre /a (PreproduccionValoresTable.jsx, que ya tenía esta misma
// lógica) y la pantalla de Logística de Viajes, que se navega directo (no
// siempre pasando por /a) y necesita el mismo criterio de permisos:
// preproduccion:full = lectura y escritura, preproduccion:admin /
// preproduccion:comercial_view = solo lectura.
import { getAdminToken } from '../api';

function parseJwt(token) {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function normalizeScopes(scopesRaw) {
  if (Array.isArray(scopesRaw)) return scopesRaw.map((s) => String(s || '').trim()).filter(Boolean);
  if (typeof scopesRaw === 'string') {
    return scopesRaw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export function getCurrentScopes() {
  const token = getAdminToken();
  const payload = parseJwt(token) || {};
  return normalizeScopes(payload.scopes ?? payload.scope ?? payload.permissions ?? []);
}

export function hasAny(scopes, needed) {
  const set = new Set((scopes || []).map((s) => String(s || '').trim()));
  return (needed || []).some((n) => set.has(n));
}

// accessMode de Preproducción: 'full' (Logística, lee y escribe) > 'admin'
// (solo lectura ampliada) > 'limited' (solo lectura acotada) > 'none'.
export function getPreproduccionAccessMode() {
  const scopes = getCurrentScopes();
  if (hasAny(scopes, ['preproduccion:full'])) return 'full';
  if (hasAny(scopes, ['preproduccion:admin'])) return 'admin';
  if (hasAny(scopes, ['preproduccion:comercial_view'])) return 'limited';
  return 'none';
}

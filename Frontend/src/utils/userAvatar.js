// src/utils/userAvatar.js — color + iniciales estables por username, para
// pintar un "avatar" simple (círculo de color) donde se muestra quién está
// trabajando en un ticket/tarea (tablero, lista, modal). Mismo username ->
// siempre el mismo color, sin necesidad de guardar nada en la base.
const PALETTE = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#ec4899'];

export function colorForUsername(username) {
  const s = String(username || '');
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function initialsForUsername(username) {
  const s = String(username || '').trim();
  if (!s) return '?';
  const partes = s.split(/[\s._-]+/).filter(Boolean);
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

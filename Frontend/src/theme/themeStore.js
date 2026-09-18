const STORAGE_KEY = 'dgp_planificacion_theme_mode';
const VALID_MODES = new Set(['light', 'dark', 'auto']);

function prefersDark() {
  return typeof window !== 'undefined' && !!window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
}

function resolveTheme(mode) {
  return mode === 'auto' ? (prefersDark() ? 'dark' : 'light') : mode;
}

function applyTheme(theme) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

function readInitialMode() {
  if (typeof window === 'undefined') return 'light';
  const saved = window.localStorage.getItem(STORAGE_KEY);
  // Default "light" (no "auto"): esta app tuvo un incidente donde el dark
  // automático rompía /despacho para gente con el celular en modo oscuro
  // (ver comentario en theme.css). Un usuario existente que nunca tocó el
  // selector sigue viendo exactamente lo mismo que hoy.
  return VALID_MODES.has(saved) ? saved : 'light';
}

let mode = readInitialMode();
let theme = resolveTheme(mode);
applyTheme(theme);
let snapshot = { mode, theme };

const listeners = new Set();
function notify() {
  snapshot = { mode, theme };
  listeners.forEach((listener) => listener());
}

export function getThemeSnapshot() {
  return snapshot;
}

export function subscribeTheme(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setThemeMode(next) {
  mode = VALID_MODES.has(next) ? next : 'light';
  theme = resolveTheme(mode);
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // localStorage no disponible (modo privado, etc.), no bloquea el cambio de tema
  }
  applyTheme(theme);
  notify();
}

if (typeof window !== 'undefined' && window.matchMedia) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onSystemChange = () => {
    if (mode !== 'auto') return;
    theme = prefersDark() ? 'dark' : 'light';
    applyTheme(theme);
    notify();
  };
  if (mq.addEventListener) mq.addEventListener('change', onSystemChange);
  else if (mq.addListener) mq.addListener(onSystemChange);
}

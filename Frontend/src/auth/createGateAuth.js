const USER = import.meta.env.VITE_CREATEGATE_USER ?? '';
const PASS = import.meta.env.VITE_CREATEGATE_PASS ?? '';

const STORAGE_KEY = 'cg_auth_v1'; // localStorage flag

export function isAuthed() {
  return localStorage.getItem(STORAGE_KEY) === '1';
}

export function login(u, p) {
  const ok = u === USER && p === PASS;
  if (ok) localStorage.setItem(STORAGE_KEY, '1');
  return ok;
}

export function logout() {
  localStorage.removeItem(STORAGE_KEY);
}

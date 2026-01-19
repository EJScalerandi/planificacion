export const LS_TOKEN = 'dg_admin_token';
export const LS_USER = 'dg_admin_user';
export const LS_SCOPES = 'dg_admin_scopes';

export function clearAdminSession() {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_USER);
  localStorage.removeItem(LS_SCOPES);
}

export function hasAdminToken() {
  const t = localStorage.getItem(LS_TOKEN);
  return !!(t && String(t).trim());
}

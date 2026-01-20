// src/api.js
import axios from 'axios';

const API_BASE =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE ||
  'http://localhost:4000';

const api = axios.create({
  baseURL: String(API_BASE).replace(/\/+$/, ''), // sin trailing slash
  timeout: 15000,
});

// ====== ADMIN TOKEN (localStorage) ======
// Clave "nueva" (la que estás usando en el login page)
const LS_TOKEN_PRIMARY = 'dg_admin_token';
// Clave "vieja" para compatibilidad con código anterior
const LS_TOKEN_FALLBACK = 'admin_token';

export function getAdminToken() {
  try {
    const a = localStorage.getItem(LS_TOKEN_PRIMARY);
    if (a && String(a).trim()) return String(a).trim();

    const b = localStorage.getItem(LS_TOKEN_FALLBACK);
    return b ? String(b).trim() : '';
  } catch {
    return '';
  }
}

export function setAdminToken(t) {
  try {
    const v = String(t || '').trim();
    localStorage.setItem(LS_TOKEN_PRIMARY, v);
    // compatibilidad
    localStorage.setItem(LS_TOKEN_FALLBACK, v);
  } catch {}
}

export function clearAdminToken() {
  try {
    localStorage.removeItem(LS_TOKEN_PRIMARY);
    localStorage.removeItem(LS_TOKEN_FALLBACK);
  } catch {}
}

// Inyecta token si existe
api.interceptors.request.use((config) => {
  const t = getAdminToken();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

/* ========= Portones ========= */
export const fetchPortones = () => api.get('/portones');
export const createPorton = (payload) => api.post('/portones', payload);
export const startStage = (id, stage) => api.post(`/portones/${id}/stage`, { stage, action: 'start' });
export const stopStage = (id, stage) => api.post(`/portones/${id}/stage`, { stage, action: 'stop' });

export const setFechaPlan = (id, fechaOrNull) => api.post(`/portones/${id}/fecha-plan`, { fecha_plan: fechaOrNull });
export const setFechaProd = (id, fechaOrNull) => api.post(`/portones/${id}/fecha-prod`, { fecha_prod: fechaOrNull });
export const setFechaNV = (id, fechaOrNull) => api.post(`/portones/${id}/fecha-nv`, { fecha_nv: fechaOrNull });
export const setFechaMed = (id, fechaOrNull) => api.post(`/portones/${id}/fecha-med`, { fecha_med: fechaOrNull });

export const setFechaPlanEntrega = (id, fechaOrNull) =>
  api.post(`/portones/${id}/fecha-plan-entrega`, { fecha_plan_entrega: fechaOrNull });

/**
 * ✅ NUEVO: Sistema en Portones
 * Requiere endpoint backend:
 *   POST /portones/:id/sistema   body: { sistema: string|null }
 */
export const setSistemaPorton = (id, sistemaOrNull) =>
  api.post(`/portones/${id}/sistema`, { sistema: sistemaOrNull });

/* ========= Observaciones Portones ========= */
export const getPortonObservaciones = (id) => api.get(`/portones/${id}/observaciones`);
export const savePortonObservaciones = (id, observaciones) => api.post(`/portones/${id}/observaciones`, { observaciones });
export const updatePortonObservaciones = (id, observaciones) => api.put(`/portones/${id}/observaciones`, { observaciones });
export const setPortonObservaciones = (id, observaciones) => updatePortonObservaciones(id, observaciones);

/* ========= iPanels ========= */
export const fetchIpanels = () => api.get('/ipanel');
export const createIpanel = (payload) => api.post('/ipanel', payload);
export const startIpanelStage = (id, stage) => api.post(`/ipanel/${id}/stage`, { stage, action: 'start' });
export const stopIpanelStage = (id, stage) => api.post(`/ipanel/${id}/stage`, { stage, action: 'stop' });

/* ========= Fechas iPanels ========= */
export const setIpanelFechaProd = (id, fechaOrNull) => api.post(`/ipanel/${id}/fecha-prod`, { fecha_prod: fechaOrNull });
export const setIpanelFechaNV = (id, fechaOrNull) => api.post(`/ipanel/${id}/fecha-nv`, { fecha_nv: fechaOrNull });
export const setIpanelFechaMed = (id, fechaOrNull) => api.post(`/ipanel/${id}/fecha-med`, { fecha_med: fechaOrNull });
export const setIpanelFechaPlan = (id, fechaOrNull) => api.post(`/ipanel/${id}/fecha-plan`, { fecha_plan: fechaOrNull });

export const setIpanelFechaPlanEntrega = (id, fechaOrNull) =>
  api.post(`/ipanel/${id}/fecha-plan-entrega`, { fecha_plan_entrega: fechaOrNull });

/* ========= Observaciones iPanels ========= */
export const getIpanelObservaciones = (id) => api.get(`/ipanel/${id}/observaciones`);
export const saveIpanelObservaciones = (id, observaciones) => api.post(`/ipanel/${id}/observaciones`, { observaciones });
export const updateIpanelObservaciones = (id, observaciones) => api.put(`/ipanel/${id}/observaciones`, { observaciones });
export const setIpanelObservaciones = (id, observaciones) => updateIpanelObservaciones(id, observaciones);

/* ============ ADMIN WORKFLOW ============ */
export async function adminLogin(username, password) {
  const { data } = await api.post('/admin/login', { username, password });
  if (data?.token) setAdminToken(data.token);
  return data;
}

export async function getWorkflowConfig(line) {
  const { data } = await api.get('/admin/workflow/config', { params: { line } });
  return data;
}

export async function saveWorkflowConfig(line, payload) {
  const { data } = await api.put('/admin/workflow/config', payload, { params: { line } });
  return data;
}

export async function getWorkflowConditionFields(line) {
  const { data } = await api.get('/admin/workflow/condition-fields', { params: { line } });
  return data;
}

/* ============ QC (CALIDAD) ============ */
export async function qcGetMotives({ line, kind, stage }) {
  const { data } = await api.get('/qc/motives', {
    params: { line, kind, stage: stage ?? null },
    headers: { 'Cache-Control': 'no-cache' },
  });
  return data;
}

export async function qcAuthorize(payload) {
  const { data } = await api.post('/qc/authorize', payload, {
    headers: { 'Cache-Control': 'no-cache' },
  });
  return data;
}

export async function qcHistory({ line, item_id }) {
  const t = Date.now();
  const { data } = await api.get(
    `/qc/history/${encodeURIComponent(line)}/${encodeURIComponent(item_id)}`,
    {
      params: { t },
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    }
  );
  return data;
}

export async function qcSummary({ line, item_ids, stage_key } = {}) {
  const payload = {
    line: String(line || '').trim(),
    item_ids: Array.isArray(item_ids)
      ? item_ids.map((n) => Number(n)).filter((n) => Number.isInteger(n))
      : [],
    stage_key: stage_key == null ? null : String(stage_key).trim(),
  };

  const { data } = await api.post('/qc/summary', payload, {
    headers: { 'Cache-Control': 'no-cache' },
  });
  return data;
}

/* ============ ADMIN QC (CRUD usuarios + motivos) ============ */
export async function adminQcUsersList() {
  const { data } = await api.get('/admin/qc/users');
  return data;
}

export async function adminQcUsersCreate(payload) {
  const { data } = await api.post('/admin/qc/users', payload);
  return data;
}

export async function adminQcUsersUpdate(id, payload) {
  const { data } = await api.put(`/admin/qc/users/${id}`, payload);
  return data;
}

export async function adminQcUsersReplaceScopes(id, scopes) {
  const { data } = await api.put(`/admin/qc/users/${id}/scopes`, { scopes });
  return data;
}

export async function adminQcMotivesList(params = {}) {
  const { data } = await api.get('/admin/qc/motives', { params });
  return data;
}

export async function adminQcMotivesCreate(payload) {
  const { data } = await api.post('/admin/qc/motives', payload);
  return data;
}

export async function adminQcMotivesUpdate(id, payload) {
  const { data } = await api.put(`/admin/qc/motives/${id}`, payload);
  return data;
}

/* ========= Bases (Planta / Despachar) ========= */
export const getPlantaBase = () => api.get('/planta/base');
export const postPlantaBase = (payload) => api.post('/planta/base', payload);
export const getPlantaBases = () => api.get('/planta/bases');

export const getDespacharBase = () => api.get('/despachar/base');
export const postDespacharBase = (payload) => api.post('/despachar/base', payload);
export const getDespacharBases = () => api.get('/despachar/bases');

/* ========= Preproducción ========= */
export const fetchPreproduccionValores = () => api.get('/preproduccion-valores');
export const updatePreproduccionValor = (id, patch) => api.put(`/preproduccion-valores/${id}`, { patch });

// --------------------
// ADMIN USERS / SCOPES
// --------------------
export function fetchUsers() {
  return api.get('/admin/users');
}

export function createUser(payload) {
  return api.post('/admin/users', payload);
}

export function updateUser(id, patch) {
  return api.patch(`/admin/users/${id}`, patch);
}

export function setUserPassword(id, payload) {
  return api.post(`/admin/users/${id}/password`, payload);
}

export function fetchScopes() {
  return api.get('/admin/scopes');
}

export default api;

// src/api.js
import axios from 'axios';

const api = axios.create({
  baseURL:
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE ||
    //'https://planificacion-6sk9.onrender.com'
    'http://localhost:4000',
  timeout: 15000,
});

// ====== ADMIN TOKEN (localStorage) ======
export function getAdminToken() {
  try {
    return localStorage.getItem('admin_token') || '';
  } catch {
    return '';
  }
}
export function setAdminToken(t) {
  try {
    localStorage.setItem('admin_token', t || '');
  } catch {}
}
export function clearAdminToken() {
  try {
    localStorage.removeItem('admin_token');
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

export const startStage = (id, stage) =>
  api.post(`/portones/${id}/stage`, { stage, action: 'start' });

export const stopStage = (id, stage) =>
  api.post(`/portones/${id}/stage`, { stage, action: 'stop' });

// Fecha de entrega planificada (YYYY-MM-DD o null)
export const setFechaPlan = (id, fechaOrNull) =>
  api.post(`/portones/${id}/fecha-plan`, { fecha_plan: fechaOrNull });

// Fecha de inicio de producción (YYYY-MM-DD o null)
export const setFechaProd = (id, fechaOrNull) =>
  api.post(`/portones/${id}/fecha-prod`, { fecha_prod: fechaOrNull });

// Fecha de venta (NV) (YYYY-MM-DD o null)
export const setFechaNV = (id, fechaOrNull) =>
  api.post(`/portones/${id}/fecha-nv`, { fecha_nv: fechaOrNull });

// Fecha de medición (YYYY-MM-DD o null)
export const setFechaMed = (id, fechaOrNull) =>
  api.post(`/portones/${id}/fecha-med`, { fecha_med: fechaOrNull });

// Fecha planificada llegada (YYYY-MM-DD o null)
export const setFechaPlanEntrega = (id, fechaOrNull) =>
  api.post(`/portones/${id}/fecha-plan-entrega`, {
    fecha_plan_entrega: fechaOrNull,
  });

/* ========= Observaciones Portones ========= */

// GET observaciones de un portón
export const getPortonObservaciones = (id) =>
  api.get(`/portones/${id}/observaciones`);

// POST observaciones (crear/actualizar – tu backend hace UPDATE)
export const savePortonObservaciones = (id, observaciones) =>
  api.post(`/portones/${id}/observaciones`, { observaciones });

// PUT observaciones (idempotente)
export const updatePortonObservaciones = (id, observaciones) =>
  api.put(`/portones/${id}/observaciones`, { observaciones });

// ✅ Alias de compatibilidad
export const setPortonObservaciones = (id, observaciones) =>
  updatePortonObservaciones(id, observaciones);

/* ========= iPanels ========= */
export const fetchIpanels = () => api.get('/ipanel');

export const createIpanel = (payload) => api.post('/ipanel', payload);

export const startIpanelStage = (id, stage) =>
  api.post(`/ipanel/${id}/stage`, { stage, action: 'start' });

export const stopIpanelStage = (id, stage) =>
  api.post(`/ipanel/${id}/stage`, { stage, action: 'stop' });

/* ========= Fechas iPanels ========= */

export const setIpanelFechaProd = (id, fechaOrNull) =>
  api.post(`/ipanel/${id}/fecha-prod`, { fecha_prod: fechaOrNull });

export const setIpanelFechaNV = (id, fechaOrNull) =>
  api.post(`/ipanel/${id}/fecha-nv`, { fecha_nv: fechaOrNull });

export const setIpanelFechaMed = (id, fechaOrNull) =>
  api.post(`/ipanel/${id}/fecha-med`, { fecha_med: fechaOrNull });

export const setIpanelFechaPlan = (id, fechaOrNull) =>
  api.post(`/ipanel/${id}/fecha-plan`, { fecha_plan: fechaOrNull });

export const setIpanelFechaPlanEntrega = (id, fechaOrNull) =>
  api.post(`/ipanel/${id}/fecha-plan-entrega`, {
    fecha_plan_entrega: fechaOrNull,
  });

/* ========= Observaciones iPanels ========= */

export const getIpanelObservaciones = (id) =>
  api.get(`/ipanel/${id}/observaciones`);

export const saveIpanelObservaciones = (id, observaciones) =>
  api.post(`/ipanel/${id}/observaciones`, { observaciones });

export const updateIpanelObservaciones = (id, observaciones) =>
  api.put(`/ipanel/${id}/observaciones`, { observaciones });

export const setIpanelObservaciones = (id, observaciones) =>
  updateIpanelObservaciones(id, observaciones);

/* ============ ADMIN WORKFLOW ============ */

export async function adminLogin(username, password) {
  const { data } = await api.post('/admin/login', { username, password });
  if (data?.token) setAdminToken(data.token);
  return data;
}

export async function getWorkflowConfig(line) {
  const { data } = await api.get('/admin/workflow/config', {
    params: { line },
  });
  return data;
}

export async function saveWorkflowConfig(line, payload) {
  const { data } = await api.put('/admin/workflow/config', payload, {
    params: { line },
  });
  return data;
}

/* ============ QC (CALIDAD) ============ */

export async function qcGetMotives({ line, kind, stage }) {
  const { data } = await api.get('/qc/motives', {
    params: { line, kind, stage: stage ?? null },
  });
  return data;
}

export async function qcAuthorize(payload) {
  const { data } = await api.post('/qc/authorize', payload);
  return data;
}

export async function qcHistory(line, itemId) {
  const { data } = await api.get(
    `/qc/history/${encodeURIComponent(line)}/${encodeURIComponent(itemId)}`
  );
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

export default api;

/* ========= Bases (Planta / Despachar) ========= */
export const getPlantaBase = () => api.get('/planta/base');
export const postPlantaBase = (payload) => api.post('/planta/base', payload);
export const getPlantaBases = () => api.get('/planta/bases');

export const getDespacharBase = () => api.get('/despachar/base');
export const postDespacharBase = (payload) => api.post('/despachar/base', payload);
export const getDespacharBases = () => api.get('/despachar/bases');

/* ========= Preproducción ========= */
export const fetchPreproduccionValores = () => api.get('/preproduccion-valores');

export const updatePreproduccionValor = (id, patch) =>
  api.put(`/preproduccion-valores/${id}`, { patch });

// --------------------
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
  // payload: { password: '...' }
  return api.post(`/admin/users/${id}/password`, payload);
}

export function fetchScopes() {
  return api.get('/admin/scopes');
}

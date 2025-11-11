import axios from 'axios';

const api = axios.create({
  // Intentá unificar con lo que usa el hook (VITE_API_BASE). Dejo ambos por compatibilidad.
  baseURL: import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE || 'https://planificacion-6sk9.onrender.com',
  timeout: 15000
});

/* ========= Portones ========= */
export const fetchPortones = () => api.get('/portones');

export const createPorton = (payload) =>
  api.post('/portones', payload);

export const startStage = (id, stage) =>
  api.post(`/portones/${id}/stage`, { stage, action: 'start' });

export const stopStage = (id, stage) =>
  api.post(`/portones/${id}/stage`, { stage, action: 'stop' });

// Fecha de entrega planificada (YYYY-MM-DD o null)
export const setFechaPlan = (id, fechaOrNull) =>
  api.post(`/portones/${id}/fecha-plan`, { fecha_plan: fechaOrNull });

// ⬇️ NUEVO: Fecha de inicio de producción (YYYY-MM-DD o null)
export const setFechaProd = (id, fechaOrNull) =>
  api.post(`/portones/${id}/fecha-prod`, { fecha_prod: fechaOrNull });

/* ========= iPanels ========= */
export const fetchIpanels = () =>
  api.get('/ipanel');

export const createIpanel = (payload) =>
  api.post('/ipanel', payload);

export const startIpanelStage = (id, stage) =>
  api.post(`/ipanel/${id}/stage`, { stage, action: 'start' });

export const stopIpanelStage = (id, stage) =>
  api.post(`/ipanel/${id}/stage`, { stage, action: 'stop' });

export default api;
// Fecha de venta (NV) (YYYY-MM-DD o null)
export const setFechaNV = (id, fechaOrNull) =>
  api.post(`/portones/${id}/fecha-nv`, { fecha_nv: fechaOrNull });

// Fecha de medición (YYYY-MM-DD o null)
export const setFechaMed = (id, fechaOrNull) =>
  api.post(`/portones/${id}/fecha-med`, { fecha_med: fechaOrNull });

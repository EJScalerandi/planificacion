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

// Fecha de inicio de producción (YYYY-MM-DD o null)
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

/* ========= Fechas extra Portones ========= */

// Fecha de venta (NV) (YYYY-MM-DD o null)
export const setFechaNV = (id, fechaOrNull) =>
  api.post(`/portones/${id}/fecha-nv`, { fecha_nv: fechaOrNull });

// Fecha de medición (YYYY-MM-DD o null)
export const setFechaMed = (id, fechaOrNull) =>
  api.post(`/portones/${id}/fecha-med`, { fecha_med: fechaOrNull });

/* ========= Observaciones Portones ========= */

// GET observaciones de un portón
export const getPortonObservaciones = (id) =>
  api.get(`/portones/${id}/observaciones`);

// POST observaciones (crear/actualizar – tu backend hace UPDATE)
export const savePortonObservaciones = (id, observaciones) =>
  api.post(`/portones/${id}/observaciones`, { observaciones });

// PUT observaciones (idempotente, misma lógica que POST)
export const updatePortonObservaciones = (id, observaciones) =>
  api.put(`/portones/${id}/observaciones`, { observaciones });

/* ========= Observaciones iPanels ========= */

// GET observaciones de un iPanel
export const getIpanelObservaciones = (id) =>
  api.get(`/ipanel/${id}/observaciones`);

// POST observaciones (crear/actualizar – tu backend hace UPDATE)
export const saveIpanelObservaciones = (id, observaciones) =>
  api.post(`/ipanel/${id}/observaciones`, { observaciones });

// PUT observaciones (idempotente)
export const updateIpanelObservaciones = (id, observaciones) =>
  api.put(`/ipanel/${id}/observaciones`, { observaciones });
// Fecha planificada llegada (YYYY-MM-DD o null)
export const setFechaPlanEntrega = (id, fechaOrNull) =>
  api.post(`/portones/${id}/fecha-plan-entrega`, { fecha_plan_entrega: fechaOrNull });
// Observaciones portón (string o null)
export const setPortonObservaciones = (id, observaciones) =>
  api.put(`/portones/${id}/observaciones`, { observaciones });

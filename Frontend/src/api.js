// src/api.js
import axios from 'axios';

const api = axios.create({
  // Intentá unificar con lo que usa el hook (VITE_API_BASE). Dejo ambos por compatibilidad.
  baseURL:
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE ||
    'https://planificacion-6sk9.onrender.com',
  timeout: 15000,
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

/* ========= iPanels ========= */
export const fetchIpanels = () => api.get('/ipanel');

export const createIpanel = (payload) => api.post('/ipanel', payload);

export const startIpanelStage = (id, stage) =>
  api.post(`/ipanel/${id}/stage`, { stage, action: 'start' });

export const stopIpanelStage = (id, stage) =>
  api.post(`/ipanel/${id}/stage`, { stage, action: 'stop' });

/* ========= Fechas iPanels ========= */

// Fecha de inicio de producción (YYYY-MM-DD o null)
export const setIpanelFechaProd = (id, fechaOrNull) =>
  api.post(`/ipanel/${id}/fecha-prod`, { fecha_prod: fechaOrNull });

// Fecha de venta (NV) (YYYY-MM-DD o null)
export const setIpanelFechaNV = (id, fechaOrNull) =>
  api.post(`/ipanel/${id}/fecha-nv`, { fecha_nv: fechaOrNull });

// Fecha de medición (YYYY-MM-DD o null)
export const setIpanelFechaMed = (id, fechaOrNull) =>
  api.post(`/ipanel/${id}/fecha-med`, { fecha_med: fechaOrNull });

// Fecha planificada salida (YYYY-MM-DD o null)
export const setIpanelFechaPlan = (id, fechaOrNull) =>
  api.post(`/ipanel/${id}/fecha-plan`, { fecha_plan: fechaOrNull });

// Fecha planificada llegada (YYYY-MM-DD o null)
export const setIpanelFechaPlanEntrega = (id, fechaOrNull) =>
  api.post(`/ipanel/${id}/fecha-plan-entrega`, {
    fecha_plan_entrega: fechaOrNull,
  });

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
  api.post(`/portones/${id}/fecha-plan-entrega`, {
    fecha_plan_entrega: fechaOrNull,
  });

// Observaciones portón (string o null)
export const setPortonObservaciones = (id, observaciones) =>
  api.put(`/portones/${id}/observaciones`, { observaciones });

export const setIpanelObservaciones = (id, observaciones) =>
  api.post(`/ipanel/${id}/observaciones`, { observaciones });

/* ============ PREPRODUCCIÓN ============ */

// Sincronizar Pre_Produccion (SQL Server -> Supabase)
// (devuelve directamente data, no el response completo)
export const syncPreproduccion = async () => {
  const { data } = await api.post('/sync/preproduccion', null, {
    timeout: 5 * 60 * 1000, // 5 minutos solo para esta llamada
  });
  return data;
};

// Listar preproducción (axios response crudo – lo mantenemos)
export const fetchPreproduccion = (params = {}) => {
  return api.get('/preproduccion', { params });
};

// Enviar items de preproducción a producción (axios response crudo)
export const sendPreprodToProduccion = (payload) => {
  // payload: { ids: number[], nlista?: number }
  return api.post('/preproduccion/a-produccion', payload);
};

/* ==== Helpers usados por PreproduccionPage.jsx ==== */

// Wrapper que devuelve solo data
export async function getPreproduccion(params = {}) {
  const { data } = await fetchPreproduccion(params);
  return data;
}

// Wrapper que recibe array de IDs y devuelve solo data
export async function sendPreproduccionToProduccion(ids, extra = {}) {
  // extra puede traer nlista si querés
  const { data } = await sendPreprodToProduccion({ ids, ...extra });
  return data;
}

// Última fecha de sincronización
export async function getPreproduccionLastSync() {
  const { data } = await api.get('/preproduccion/last-sync');
  // espero algo como { lastSyncAt: string|null }
  return data;
}

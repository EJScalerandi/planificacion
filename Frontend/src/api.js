import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000',
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


/* ========= iPanels ========= */
// GET todos los iPanels
export const fetchIpanels = () =>
  api.get('/ipanel');

// Crear iPanel: { nv, partida? }
export const createIpanel = (payload) =>
  api.post('/ipanel', payload);

// Iniciar etapa de iPanel: stage ∈ {'guillotina','plegado','pintura','inyeccion'}
export const startIpanelStage = (id, stage) =>
  api.post(`/ipanel/${id}/stage`, { stage, action: 'start' });

// Finalizar etapa de iPanel
export const stopIpanelStage = (id, stage) =>
  api.post(`/ipanel/${id}/stage`, { stage, action: 'stop' });

export default api;

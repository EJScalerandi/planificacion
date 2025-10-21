import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000',
  timeout: 10000
});

export const fetchPortones = () => api.get('/portones');
export const startStage = (id, stage) =>
  api.post(`/portones/${id}/stage`, { stage, action: 'start' });
export const stopStage = (id, stage) =>
  api.post(`/portones/${id}/stage`, { stage, action: 'stop' });
// ...
export const createPorton = (payload) => api.post('/portones', payload);


export default api;

import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE || 'https://planificacion-uprm.onrender.com';

// Etapas válidas del backend para Portones (referencia útil para UI/autocomplete)
export const PORTONES_STAGES = [
  'diseno','laser','guillotina','plegadora',
  'armado_marco_piernas','armado_piernas','armado_primario','armado_hojas',
  'inyeccion','revestimiento','pintura','armado_final','despacho'
];

export default function usePortones(opts = {}) {
  const { pollMs = 0 } = opts; // 0 => sin auto-refresh
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const didFetchOnce = useRef(false);
  const isVisible = () =>
    (typeof document !== 'undefined'
      ? document.visibilityState === 'visible'
      : true);

  const refresh = useCallback(async () => {
    try {
      setErr('');
      setRefreshing(true);
      if (!didFetchOnce.current) setLoading(true);
      const { data } = await axios.get(`${BASE_URL}/portones`, { timeout: 15000 });
      setData(data);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      didFetchOnce.current = true;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // primera carga
  useEffect(() => { refresh(); }, [refresh]);

  // auto-refresh opcional
  useEffect(() => {
    if (!pollMs) return;
    const tick = () => { if (isVisible()) refresh(); };
    const id = setInterval(tick, pollMs);
    const onVis = () => { if (isVisible()) refresh(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [pollMs, refresh]);

  const replaceItem = useCallback((updated) => {
    setData(prev => {
      const i = prev.findIndex(p => p.id === updated.id);
      if (i === -1) return prev;
      const copy = prev.slice();
      copy[i] = updated;
      return copy;
    });
  }, []);

  // ---- NUEVOS HELPERS (tal cual los endpoints del backend) ----

  const createPorton = useCallback(async ({ nv, nlista, partida, npartida }) => {
    try {
      setErr('');
      const { data: created } = await axios.post(
        `${BASE_URL}/portones`,
        { nv, nlista, partida, npartida },
        { timeout: 15000 }
      );
      setData(prev => [...prev, created]);
      return created;
    } catch (e) {
      const msg = e?.response?.data?.error || e.message;
      setErr(msg);
      throw new Error(msg);
    }
  }, []);

  const setFechaPlan = useCallback(async (id, fecha /* string YYYY-MM-DD | null */) => {
    try {
      setErr('');
      const { data: updated } = await axios.post(
        `${BASE_URL}/portones/${id}/fecha-plan`,
        { fecha_plan: fecha ?? null },
        { timeout: 15000 }
      );
      replaceItem(updated);
      return updated;
    } catch (e) {
      const msg = e?.response?.data?.error || e.message;
      setErr(msg);
      throw new Error(msg);
    }
  }, [replaceItem]);

  const setFechaProd = useCallback(async (id, fecha /* string YYYY-MM-DD | null */) => {
    try {
      setErr('');
      const { data: updated } = await axios.post(
        `${BASE_URL}/portones/${id}/fecha-prod`,
        { fecha_prod: fecha ?? null },
        { timeout: 15000 }
      );
      replaceItem(updated);
      return updated;
    } catch (e) {
      const msg = e?.response?.data?.error || e.message;
      setErr(msg);
      throw new Error(msg);
    }
  }, [replaceItem]);

  const startStage = useCallback(async (id, stage) => {
    try {
      setErr('');
      const { data: updated } = await axios.post(
        `${BASE_URL}/portones/${id}/stage`,
        { stage, action: 'start' },
        { timeout: 15000 }
      );
      replaceItem(updated);
      return updated;
    } catch (e) {
      const msg = e?.response?.data?.error || e.message;
      setErr(msg);
      throw new Error(msg);
    }
  }, [replaceItem]);

  const stopStage = useCallback(async (id, stage) => {
    try {
      setErr('');
      const { data: updated } = await axios.post(
        `${BASE_URL}/portones/${id}/stage`,
        { stage, action: 'stop' },
        { timeout: 15000 }
      );
      replaceItem(updated);
      return updated;
    } catch (e) {
      const msg = e?.response?.data?.error || e.message;
      setErr(msg);
      throw new Error(msg);
    }
  }, [replaceItem]);

  return {
    data, loading, err, refresh, refreshing, replaceItem,
    // nuevos métodos:
    createPorton,
    setFechaPlan,
    setFechaProd,
    startStage,
    stopStage,
  };
}

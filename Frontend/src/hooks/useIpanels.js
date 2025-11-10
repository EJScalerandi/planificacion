import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

// Misma env que en usePortones
const BASE_URL = import.meta.env.VITE_API_BASE || 'https://planificacion-6sk9.onrender.com';

// Etapas válidas del backend para iPanel
export const IPANEL_STAGES = ['guillotina', 'plegado', 'pintura', 'inyeccion', 'despacho'];

export default function useIpanels(opts = {}) {
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

      const url = `${BASE_URL}/ipanel`;
      const { data: payload, headers } = await axios.get(url, { timeout: 15000 });

      if (!Array.isArray(payload)) {
        const ctype = headers?.['content-type'] || 'desconocido';
        throw new Error(
          `Respuesta inesperada desde ${url}. Content-Type: ${ctype}. ` +
          `Verificá VITE_API_BASE y que GET /ipanel devuelva JSON (array).`
        );
      }

      setData(payload);
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

  const createIpanel = useCallback(async ({ nv, partida, npartida }) => {
    try {
      setErr('');
      const payload = { nv };
      if (partida != null) payload.partida = partida;
      if (npartida != null) payload.npartida = npartida;

      const { data: created } = await axios.post(
        `${BASE_URL}/ipanel`,
        payload,
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

  const setFechaProd = useCallback(async (id, fecha /* string YYYY-MM-DD | null */) => {
    try {
      setErr('');
      const { data: updated } = await axios.post(
        `${BASE_URL}/ipanel/${id}/fecha-prod`,
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
        `${BASE_URL}/ipanel/${id}/stage`,
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
        `${BASE_URL}/ipanel/${id}/stage`,
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
    createIpanel,
    setFechaProd,
    startStage,
    stopStage,
  };
}

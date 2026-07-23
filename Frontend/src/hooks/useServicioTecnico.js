import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL || 'https://planificacion-uprm.onrender.com';

export default function useServicioTecnico(opts = {}) {
  const { pollMs = 0 } = opts;
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const didFetchOnce = useRef(false);
  const isVisible = () =>
    (typeof document !== 'undefined' ? document.visibilityState === 'visible' : true);

  const refresh = useCallback(async () => {
    try {
      setErr('');
      setRefreshing(true);
      if (!didFetchOnce.current) setLoading(true);
      const url = `${String(BASE_URL).replace(/\/+$/, '')}/servicio-tecnico`;
      const { data: payload } = await axios.get(url, { timeout: 15000 });
      setData(Array.isArray(payload) ? payload : []);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      didFetchOnce.current = true;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

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
    setData((prev) => {
      const i = prev.findIndex((p) => p.id === updated.id);
      if (i === -1) return prev;
      const copy = prev.slice();
      copy[i] = updated;
      return copy;
    });
  }, []);

  return { data, loading, err, refresh, refreshing, replaceItem };
}

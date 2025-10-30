// src/hooks/useIpanels.js
import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

// Usá la MISMA env que en usePortones (VITE_API_BASE)
const BASE_URL = import.meta.env.VITE_API_BASE || 'https://planificacion-6sk9.onrender.com';

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

      // Si el backend responde HTML por error de URL/CORS/etc, axios no parsea a JSON.
      // Aseguramos que sea un array:
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

  // por si querés actualizar un item en memoria (igual a usePortones)
  const replaceItem = useCallback((updated) => {
    setData(prev => {
      const i = prev.findIndex(p => p.id === updated.id);
      if (i === -1) return prev;
      const copy = prev.slice();
      copy[i] = updated;
      return copy;
    });
  }, []);

  return { data, loading, err, refresh, refreshing, replaceItem };
}

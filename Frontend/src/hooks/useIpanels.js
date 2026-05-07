import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

// Misma env que en usePortones
const BASE_URL = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL || 'https://planificacion-6sk9.onrender.com';

// Etapas validas del backend para iPanel
export const IPANEL_STAGES = ['diseno', 'guillotina', 'plegado', 'pintura', 'inyeccion', 'despacho'];

export default function useIpanels(opts = {}) {
  const { pollMs = 0, onlyProduction = true } = opts; // por defecto: tablero productivo
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

      const params = onlyProduction ? { produccion: 1 } : {};
      const url = `${String(BASE_URL).replace(/\/+$/, '')}/ipanel`;
      const { data: payload, headers } = await axios.get(url, { params, timeout: 15000 });

      if (!Array.isArray(payload)) {
        const ctype = headers?.['content-type'] || 'desconocido';
        throw new Error(
          `Respuesta inesperada desde ${url}. Content-Type: ${ctype}. ` +
          `Verifica VITE_API_BASE/VITE_API_URL y que GET /ipanel devuelva JSON (array).`
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
  }, [onlyProduction]);

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
    setData(prev => {
      const i = prev.findIndex(p => p.id === updated.id);
      if (i === -1) return prev;
      const copy = prev.slice();
      copy[i] = updated;
      return copy;
    });
  }, []);

  const createIpanel = useCallback(async ({ nv, partida, npartida, fecha_prod, fecha_plan_entrega }) => {
    try {
      setErr('');
      const payload = { nv };
      if (partida != null) payload.partida = partida;
      if (npartida != null) payload.npartida = npartida;
      if (fecha_prod != null) payload.fecha_prod = fecha_prod;
      if (fecha_plan_entrega != null) payload.fecha_plan_entrega = fecha_plan_entrega;

      const { data: created } = await axios.post(
        `${String(BASE_URL).replace(/\/+$/, '')}/ipanel`,
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

  const setFechaProd = useCallback(async (id, fecha) => {
    try {
      setErr('');
      const { data: updated } = await axios.post(
        `${String(BASE_URL).replace(/\/+$/, '')}/ipanel/${id}/fecha-prod`,
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
        `${String(BASE_URL).replace(/\/+$/, '')}/ipanel/${id}/stage`,
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
        `${String(BASE_URL).replace(/\/+$/, '')}/ipanel/${id}/stage`,
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
    createIpanel,
    setFechaProd,
    startStage,
    stopStage,
  };
}

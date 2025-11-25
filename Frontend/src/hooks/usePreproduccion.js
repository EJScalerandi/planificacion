// src/hooks/usePreproduccion.js
import { useCallback, useEffect, useState } from 'react';
import { fetchPreproduccion } from '../api';

export default function usePreproduccion() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await fetchPreproduccion();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error cargando preproducción', err);
      setError(err?.message || 'Error cargando preproducción');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return {
    items,
    loading,
    error,
    reload: load,
    setItems,
  };
}

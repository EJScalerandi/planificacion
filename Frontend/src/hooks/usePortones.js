import { useEffect, useState, useCallback } from 'react';
import { fetchPortones } from '../api';

export default function usePortones() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await fetchPortones();
      setData(data);
      setErr(null);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const replaceItem = (updated) =>
    setData(prev => prev.map(p => (p.id === updated.id ? updated : p)));

  return { data, loading, err, refresh, replaceItem };
}

// src/pages/PreproduccionPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  getPreproduccion,
  syncPreproduccion,
  sendPreproduccionToProduccion,
  getPreproduccionLastSync,
} from '../src/api';

export default function PreproduccionPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [syncSuccess, setSyncSuccess] = useState('');

  const [lastSyncAt, setLastSyncAt] = useState(null);

  const [searchText, setSearchText] = useState('');
  const [searchNLista, setSearchNLista] = useState('');

  const [selectedIds, setSelectedIds] = useState([]);

  // ==============================
  // Carga de datos
  // ==============================
  async function loadPreproduccion() {
    try {
      setLoading(true);
      const data = await getPreproduccion();
      setRows(data || []);
    } catch (err) {
      console.error('Error cargando preproducción', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadLastSync() {
    try {
      const info = await getPreproduccionLastSync();
      // espero { lastSyncAt: '2025-11-25T15:38:30.000Z' } o null
      setLastSyncAt(info?.lastSyncAt || null);
    } catch (err) {
      console.error('Error leyendo última sync', err);
    }
  }

  useEffect(() => {
    // Solo leer lo que YA hay en Supabase
    loadPreproduccion();
    loadLastSync();
  }, []);

  // ==============================
  // Sincronización manual
  // ==============================
  async function handleSync() {
    try {
      setSyncError('');
      setSyncSuccess('');
      setSyncLoading(true);

      const result = await syncPreproduccion(); // POST /sync/preproduccion

      await loadPreproduccion();
      await loadLastSync();

      setSyncSuccess(
        result?.imported != null
          ? `Sincronización completa. Importados ${result.imported} registros.`
          : 'Sincronización completa.'
      );
    } catch (err) {
      console.error('Error sync preproducción', err);
      setSyncError('Error sincronizando Pre_Produccion');
    } finally {
      setSyncLoading(false);
    }
  }

  // ==============================
  // Enviar seleccionados a producción
  // ==============================
  async function handleSendToProduccion() {
    if (!selectedIds.length) return;

    if (!window.confirm(`¿Enviar ${selectedIds.length} portones a producción?`)) {
      return;
    }

    try {
      setLoading(true);
      await sendPreproduccionToProduccion(selectedIds);
      setSelectedIds([]);
      await loadPreproduccion(); // ya no verás los enviados
    } catch (err) {
      console.error('Error enviando a producción', err);
      alert('Error enviando a producción. Revisar consola.');
    } finally {
      setLoading(false);
    }
  }

  // ==============================
  // Búsqueda / filtros
  // ==============================
  const filteredRows = useMemo(() => {
    const text = searchText.trim().toLowerCase();
    const nlista = searchNLista.trim();

    return rows.filter((r) => {
      if (text) {
        const hayTexto =
          String(r.nv ?? '').toLowerCase().includes(text) ||
          String(r.partida ?? '').toLowerCase().includes(text) ||
          String(r.razsoc ?? '').toLowerCase().includes(text) ||
          String(r.nombre ?? '').toLowerCase().includes(text) ||
          String(r.direccion ?? '').toLowerCase().includes(text) ||
          String(r.sistema ?? '').toLowerCase().includes(text);

        if (!hayTexto) return false;
      }

      if (nlista) {
        if (String(r.nlista ?? '') !== nlista) return false;
      }

      return true;
    });
  }, [rows, searchText, searchNLista]);

  // ==============================
  // Selección de filas
  // ==============================
  function toggleSelect(id) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleSelectVisible() {
    const visibleIds = filteredRows.map((r) => r.id);
    const allVisibleSelected = visibleIds.every((id) => selectedIds.includes(id));

    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  // ==============================
  // Render helpers
  // ==============================
  function formatDate(d) {
    if (!d) return '-';
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('es-AR');
  }

  const tableContainerStyle = {
    overflowX: 'auto',
    maxHeight: '70vh',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    boxShadow: 'var(--shadow)',
    background: 'var(--surface)',
  };

  const thTdBase = {
    border: '1px solid var(--border)',
    padding: '4px',
  };

  return (
    <div className="screen page" style={{ fontFamily: 'system-ui,sans-serif' }}>
      <div className="container">
        {/* Header principal */}
        <div className="header-row" style={{ marginBottom: 12 }}>
          <h1 className="h1">Preproducción de Portones</h1>

          <div className="actions">
            <button
              onClick={handleSync}
              disabled={syncLoading}
              className="btn btn--brand"
            >
              {syncLoading ? 'Sincronizando…' : 'Sincronizar ahora'}
            </button>
          </div>
        </div>

        <p style={{ marginTop: 4, marginBottom: 12, color: 'var(--muted)' }}>
          Sincroniza con SQL Server y envía portones seleccionados a producción.
        </p>

        {/* Última sync como "chip" / métrica */}
        <div style={{ marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="chip">
            <span style={{ fontSize: 12, textTransform: 'uppercase', opacity: 0.7 }}>
              Última sincronización
            </span>
            <span style={{ fontWeight: 900 }}>
              {lastSyncAt ? formatDate(lastSyncAt) : 'Sin datos'}
            </span>
          </div>

          {syncError && (
            <div className="metric metric--warn" style={{ fontSize: 14 }}>
              {syncError}
            </div>
          )}
          {syncSuccess && (
            <div className="metric metric--ok" style={{ fontSize: 14 }}>
              {syncSuccess}
            </div>
          )}
        </div>

        {/* Filtros */}
        <div
          className="page__header"
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
            marginBottom: 10,
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Buscar</span>
            <input
              type="text"
              placeholder="NV, partida, cliente, dirección, sistema…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="btn"
              style={{ minWidth: 250 }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>N° de lista</span>
            <input
              type="text"
              placeholder="N° de lista"
              value={searchNLista}
              onChange={(e) => setSearchNLista(e.target.value)}
              className="btn"
              style={{ width: 120 }}
            />
          </label>
        </div>

        {/* Botonera de acciones sobre selección */}
        <div
          className="actions"
          style={{ marginBottom: 10, flexWrap: 'wrap', display: 'flex' }}
        >
          <button
            onClick={handleSendToProduccion}
            disabled={!selectedIds.length || loading}
            className="btn btn--brand"
          >
            A producción {selectedIds.length ? `(${selectedIds.length})` : ''}
          </button>

          <button
            onClick={clearSelection}
            disabled={!selectedIds.length}
            className="btn btn--ghost"
          >
            Limpiar selección
          </button>

          <button
            onClick={toggleSelectVisible}
            disabled={!filteredRows.length}
            className="btn"
          >
            Seleccionar visibles
          </button>
        </div>

        {/* Info de conteo */}
        <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--muted)' }}>
          {loading ? (
            <span>Cargando…</span>
          ) : (
            <span>
              Mostrando <strong>{filteredRows.length}</strong> de{' '}
              <strong>{rows.length}</strong> registros
            </span>
          )}
        </div>

        {/* Tabla */}
        <div style={tableContainerStyle}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.9rem',
            }}
          >
            <thead
              style={{
                position: 'sticky',
                top: 0,
                background: 'var(--surface)',
                zIndex: 1,
              }}
            >
              <tr>
                <th style={{ ...thTdBase }}>Sel</th>
                <th style={{ ...thTdBase }}>NV</th>
                <th style={{ ...thTdBase }}>Partida</th>
                <th style={{ ...thTdBase }}>Cliente</th>
                <th style={{ ...thTdBase }}>Nombre</th>
                <th style={{ ...thTdBase }}>Dirección</th>
                <th style={{ ...thTdBase }}>Sistema</th>
                <th style={{ ...thTdBase }}>F. NV</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id}>
                  <td
                    style={{
                      ...thTdBase,
                      textAlign: 'center',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(r.id)}
                      onChange={() => toggleSelect(r.id)}
                    />
                  </td>
                  <td style={thTdBase}>{r.nv}</td>
                  <td style={thTdBase}>{r.partida}</td>
                  <td style={thTdBase}>{r.razsoc}</td>
                  <td style={thTdBase}>{r.nombre}</td>
                  <td style={thTdBase}>{r.direccion}</td>
                  <td style={thTdBase}>{r.sistema}</td>
                  <td style={thTdBase}>
                    {r.fecha_nv
                      ? new Date(r.fecha_nv).toLocaleDateString('es-AR')
                      : '-'}
                  </td>
                </tr>
              ))}

              {!filteredRows.length && !loading && (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      textAlign: 'center',
                      padding: '8px',
                      color: 'var(--muted)',
                    }}
                  >
                    No hay registros para mostrar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

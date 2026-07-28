import { useEffect, useState } from 'react';
import { fetchInsumosPedidoHoy } from '../api';
import InsumosPedidoModal from './modals/InsumosPedidoModal';

export default function InsumosCartButton({ seccion }) {
  const [open, setOpen] = useState(false);
  const [pedido, setPedido] = useState(null);

  async function refresh() {
    try {
      const { data } = await fetchInsumosPedidoHoy(seccion);
      setPedido(data);
    } catch {
      // silencioso: el boton no debe romper el tablero si insumos falla
    }
  }

  useEffect(() => {
    if (!seccion) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seccion]);

  if (!seccion) return null;

  const itemsCount = Array.isArray(pedido?.items) ? pedido.items.length : 0;
  const pendientes = Array.isArray(pedido?.items) ? pedido.items.filter((i) => i.is_carryover || i.no_disponible).length : 0;

  return (
    <>
      <button
        type="button"
        className="btn btn--brand"
        onClick={() => setOpen(true)}
        title="Pedido de insumos del día"
        style={{ fontWeight: 900, position: 'relative' }}
      >
        🛒 Insumos
        {itemsCount > 0 ? (
          <span
            style={{
              marginLeft: 6,
              background: pendientes > 0 ? '#dc2626' : 'rgba(255,255,255,0.35)',
              color: '#fff',
              borderRadius: 999,
              padding: '1px 7px',
              fontSize: 12,
              fontWeight: 900,
            }}
          >
            {itemsCount}
          </span>
        ) : null}
      </button>
      <InsumosPedidoModal
        open={open}
        onClose={() => { setOpen(false); refresh(); }}
        seccion={seccion}
      />
    </>
  );
}

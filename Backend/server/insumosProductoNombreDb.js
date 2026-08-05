const { pool } = require('./db');

// Nombre "para mostrar" de un producto de Odoo en el planificador de insumos.
// Si un producto no tiene fila acá, se usa el nombre de Odoo tal cual.

async function getProductoNombreOverrides(productoIds = []) {
  const ids = Array.from(new Set((productoIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0)));
  if (!ids.length) return new Map();
  const { rows } = await pool.query(
    `select producto_odoo_id, nombre_display
       from public.insumos_producto_nombre_display
      where producto_odoo_id = any($1::int[])`,
    [ids]
  );
  return new Map(rows.map((r) => [r.producto_odoo_id, r.nombre_display]));
}

// nombreDisplay vacío/null borra el override (vuelve a mostrar el nombre de Odoo).
async function setProductoNombreOverride(productoId, nombreDisplay) {
  const id = Number(productoId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('producto_odoo_id inválido');

  const nombre = nombreDisplay == null ? '' : String(nombreDisplay).trim();
  if (!nombre) {
    await pool.query(`delete from public.insumos_producto_nombre_display where producto_odoo_id = $1`, [id]);
    return { producto_odoo_id: id, nombre_display: null };
  }

  const { rows } = await pool.query(
    `insert into public.insumos_producto_nombre_display (producto_odoo_id, nombre_display, updated_at)
     values ($1, $2, now())
     on conflict (producto_odoo_id) do update
       set nombre_display = excluded.nombre_display, updated_at = now()
     returning producto_odoo_id, nombre_display`,
    [id, nombre]
  );
  return rows[0];
}

module.exports = { getProductoNombreOverrides, setProductoNombreOverride };

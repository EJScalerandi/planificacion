-- Permite asignar una misma categoría de Odoo a más de una sección: pasa
-- insumos_categoria_seccion de PK simple (categ_id) a PK compuesta
-- (categ_id, seccion). Correr a mano contra la base (Supabase), igual que el
-- resto de server/sql/*.sql.

alter table public.insumos_categoria_seccion
  drop constraint if exists insumos_categoria_seccion_pkey;

alter table public.insumos_categoria_seccion
  add constraint insumos_categoria_seccion_pkey primary key (categ_id, seccion);

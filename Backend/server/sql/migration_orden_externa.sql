-- Agrega "Orden Externa" (OE) como segundo tipo dentro de st_ordenes, junto a
-- "Servicio Técnico" (ST). A diferencia de ST (atado a un NV existente), una
-- OE no requiere NV y usa su propia numeración correlativa (oe_seq), similar
-- a como Prefabricados usa prefabricado_seq.

create sequence if not exists public.oe_seq;

alter table public.st_ordenes
  add column if not exists tipo text not null default 'ST';

alter table public.st_ordenes
  drop constraint if exists st_ordenes_tipo_check;
alter table public.st_ordenes
  add constraint st_ordenes_tipo_check check (tipo in ('ST','OE'));

alter table public.st_ordenes
  add column if not exists numero int;

alter table public.st_ordenes
  alter column nv drop not null;

-- QC: nueva línea 'orden_externa', separada de 'servicio_tecnico' para no
-- mezclar el espacio de NVs (ST) con el de números correlativos (OE) dentro
-- del mismo item_id.
alter table public.qc_event drop constraint if exists qc_event_line_check;
alter table public.qc_event add constraint qc_event_line_check
  check (line = any (array['portones','ipanel','prefabricados','servicio_tecnico','orden_externa']));

alter table public.qc_user_scope drop constraint if exists qc_user_scope_line_check;
alter table public.qc_user_scope add constraint qc_user_scope_line_check
  check (line = any (array['portones','ipanel','prefabricados','servicio_tecnico','orden_externa']));

alter table public.qc_motive drop constraint if exists qc_motive_line_check;
alter table public.qc_motive add constraint qc_motive_line_check
  check (line = any (array['portones','ipanel','prefabricados','servicio_tecnico','orden_externa']));

-- Agrega "Refabricado" (REFAB) como tercer tipo dentro de st_ordenes, junto a
-- "Servicio Técnico" (ST) y "Orden Externa" (OE). Igual que ST, REFAB requiere
-- un NV (a diferencia de OE, que usa su propia numeración oe_seq).
--
-- Necesita su propia línea de QC ('refabricado', separada de 'servicio_tecnico')
-- por la misma razón que OE tiene 'orden_externa' separada: si compartiera línea
-- con ST, una orden ST y una REFAB para el mismo NV colisionarían en
-- qc_event.item_id (que para ambas usa el nv).

alter table public.st_ordenes drop constraint if exists st_ordenes_tipo_check;
alter table public.st_ordenes add constraint st_ordenes_tipo_check check (tipo in ('ST','OE','REFAB'));

alter table public.qc_event drop constraint if exists qc_event_line_check;
alter table public.qc_event add constraint qc_event_line_check
  check (line = any (array['portones','ipanel','prefabricados','servicio_tecnico','orden_externa','insumos','refabricado']));

alter table public.qc_user_scope drop constraint if exists qc_user_scope_line_check;
alter table public.qc_user_scope add constraint qc_user_scope_line_check
  check (line = any (array['portones','ipanel','prefabricados','servicio_tecnico','orden_externa','insumos','refabricado']));

alter table public.qc_motive drop constraint if exists qc_motive_line_check;
alter table public.qc_motive add constraint qc_motive_line_check
  check (line = any (array['portones','ipanel','prefabricados','servicio_tecnico','orden_externa','insumos','refabricado']));

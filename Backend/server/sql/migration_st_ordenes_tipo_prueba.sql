-- Agrega "Prueba Laser" (PRUEBA) como cuarto tipo dentro de st_ordenes, junto
-- a ST/OE/REFAB. Como OE, no requiere NV y usa su propia numeración
-- correlativa (prueba_seq), independiente de oe_seq.
--
-- Necesita su propia línea de QC ('prueba', separada de 'orden_externa') por
-- la misma razón que REFAB tiene 'refabricado' separada de 'servicio_tecnico':
-- si compartiera línea con OE, una orden OE y una PRUEBA con el mismo numero
-- colisionarían en qc_event.item_id (que para ambas usa el numero).
--
-- Uso: botón "Generar Prueba Laser Plano" en /diseno. Crea una orden de un
-- solo paso (workflow_stages = ['guillotina']) sin NV. Al aprobarse el QC en
-- guillotina no hay siguiente etapa (indexOf+1 da undefined), así que
-- desaparece de la vista de todos apenas se completa - no requiere ningún
-- cambio adicional en la lógica de avance/ocultamiento genérica.

create sequence if not exists public.prueba_seq;

alter table public.st_ordenes drop constraint if exists st_ordenes_tipo_check;
alter table public.st_ordenes add constraint st_ordenes_tipo_check check (tipo in ('ST','OE','REFAB','PRUEBA'));

alter table public.qc_event drop constraint if exists qc_event_line_check;
alter table public.qc_event add constraint qc_event_line_check
  check (line = any (array['portones','ipanel','prefabricados','servicio_tecnico','orden_externa','insumos','refabricado','prueba']));

alter table public.qc_user_scope drop constraint if exists qc_user_scope_line_check;
alter table public.qc_user_scope add constraint qc_user_scope_line_check
  check (line = any (array['portones','ipanel','prefabricados','servicio_tecnico','orden_externa','insumos','refabricado','prueba']));

alter table public.qc_motive drop constraint if exists qc_motive_line_check;
alter table public.qc_motive add constraint qc_motive_line_check
  check (line = any (array['portones','ipanel','prefabricados','servicio_tecnico','orden_externa','insumos','refabricado','prueba']));

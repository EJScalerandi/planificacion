-- Amplía los CHECK constraints de line en las tablas de QC para permitir
-- 'prefabricados' y 'servicio_tecnico', además de 'portones'/'ipanel'.
-- Sin esto, /qc/authorize falla con un error de constraint al intentar
-- insertar un qc_event para estas líneas nuevas.

alter table public.qc_event drop constraint if exists qc_event_line_check;
alter table public.qc_event add constraint qc_event_line_check
  check (line = any (array['portones','ipanel','prefabricados','servicio_tecnico']));

alter table public.qc_user_scope drop constraint if exists qc_user_scope_line_check;
alter table public.qc_user_scope add constraint qc_user_scope_line_check
  check (line = any (array['portones','ipanel','prefabricados','servicio_tecnico']));

alter table public.qc_motive drop constraint if exists qc_motive_line_check;
alter table public.qc_motive add constraint qc_motive_line_check
  check (line = any (array['portones','ipanel','prefabricados','servicio_tecnico']));

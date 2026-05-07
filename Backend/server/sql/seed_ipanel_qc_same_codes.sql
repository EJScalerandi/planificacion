-- QC iPanels: mismos PIN/codigos que portones.
-- Ejecutar en Supabase SQL Editor.
--
-- Este script copia scopes y motivos de QC de line='portones' hacia line='ipanel'
-- para las etapas que existen en iPanels.
-- No borra datos existentes y no duplica si ya existen filas equivalentes.

begin;

-- Etapas productivas disponibles para iPanel.
with ipanel_stages(stage_key) as (
  values
    ('diseno'),
    ('guillotina'),
    ('plegado'),
    ('pintura'),
    ('inyeccion'),
    ('despacho')
)
insert into public.qc_user_scope(user_id, line, stage_key, enabled, created_at)
select s.user_id, 'ipanel', s.stage_key, s.enabled, now()
from public.qc_user_scope s
join ipanel_stages st on st.stage_key = s.stage_key
where s.line = 'portones'
  and not exists (
    select 1
    from public.qc_user_scope x
    where x.user_id = s.user_id
      and x.line = 'ipanel'
      and x.stage_key = s.stage_key
  );

-- Motivos por etapa o globales.
with ipanel_stages(stage_key) as (
  values
    ('diseno'),
    ('guillotina'),
    ('plegado'),
    ('pintura'),
    ('inyeccion'),
    ('despacho')
)
insert into public.qc_motive(line, kind, stage_key, label, enabled, priority, created_at)
select 'ipanel', m.kind, m.stage_key, m.label, m.enabled, m.priority, now()
from public.qc_motive m
where m.line = 'portones'
  and (
    m.stage_key is null
    or exists (select 1 from ipanel_stages st where st.stage_key = m.stage_key)
  )
  and not exists (
    select 1
    from public.qc_motive x
    where x.line = 'ipanel'
      and x.kind = m.kind
      and coalesce(x.stage_key, '') = coalesce(m.stage_key, '')
      and x.label = m.label
  );

commit;

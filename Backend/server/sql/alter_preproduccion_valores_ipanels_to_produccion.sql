-- Requerido para que Planificacion use:
-- preproduccion_valores_ipanels = listado/logistica desde SQL
-- ipanel = tabla productiva/flujo

alter table public.preproduccion_valores_ipanels
  add column if not exists fecha_prod date;

alter table public.preproduccion_valores_ipanels
  add column if not exists fecha_plan_entrega date;

alter table public.preproduccion_valores_ipanels
  add column if not exists produccion_enviada boolean not null default false;

alter table public.preproduccion_valores_ipanels
  add column if not exists produccion_enviada_at timestamp with time zone null;

alter table public.preproduccion_valores_ipanels
  add column if not exists ipanel_id bigint null;

-- Si existe public.ipanel, agregamos FK liviana. Si ya existe, no la duplica.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'ipanel'
  ) and not exists (
    select 1 from pg_constraint
    where conname = 'preproduccion_valores_ipanels_ipanel_id_fkey'
  ) then
    alter table public.preproduccion_valores_ipanels
      add constraint preproduccion_valores_ipanels_ipanel_id_fkey
      foreign key (ipanel_id) references public.ipanel(id) on delete set null;
  end if;
end $$;

create index if not exists preproduccion_valores_ipanels_fecha_prod_idx
  on public.preproduccion_valores_ipanels using btree (fecha_prod);

create index if not exists preproduccion_valores_ipanels_fecha_plan_entrega_idx
  on public.preproduccion_valores_ipanels using btree (fecha_plan_entrega);

create index if not exists preproduccion_valores_ipanels_produccion_enviada_idx
  on public.preproduccion_valores_ipanels using btree (produccion_enviada);

create index if not exists preproduccion_valores_ipanels_ipanel_id_idx
  on public.preproduccion_valores_ipanels using btree (ipanel_id);

create index if not exists ipanel_partida_planificacion_idx
  on public.ipanel using btree (partida);

create index if not exists ipanel_fecha_prod_planificacion_idx
  on public.ipanel using btree (fecha_prod);

-- Descripcion del producto iPanel para listar en /i y usar en condiciones de workflow.
alter table public.preproduccion_valores_ipanels
  add column if not exists descripcion text;

alter table public.ipanel
  add column if not exists descripcion text;

update public.preproduccion_valores_ipanels
set descripcion = coalesce(
  nullif(descripcion, ''),
  nullif(data->>'descripcion', ''),
  nullif(data->>'producto_descripcion', ''),
  nullif(data->>'producto_descripciones', ''),
  nullif(data->>'descripcion_producto', '')
)
where coalesce(descripcion, '') = ''
  and data is not null;

update public.preproduccion_valores_ipanels
set data = jsonb_set(
  coalesce(data, '{}'::jsonb),
  '{descripcion}',
  to_jsonb(descripcion)
)
where coalesce(descripcion, '') <> ''
  and coalesce(data->>'descripcion', '') = '';

update public.ipanel i
set descripcion = coalesce(
  nullif(i.descripcion, ''),
  nullif(p.descripcion, ''),
  nullif(p.data->>'descripcion', ''),
  nullif(p.data->>'producto_descripcion', ''),
  nullif(p.data->>'producto_descripciones', ''),
  nullif(p.data->>'descripcion_producto', '')
)
from public.preproduccion_valores_ipanels p
where p.partida = i.partida
  and coalesce(i.descripcion, '') = '';

create index if not exists preproduccion_valores_ipanels_descripcion_idx
  on public.preproduccion_valores_ipanels using btree (descripcion);

create index if not exists ipanel_descripcion_idx
  on public.ipanel using btree (descripcion);

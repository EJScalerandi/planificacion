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

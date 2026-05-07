-- Workflow default para iPanels.
-- Ejecutar en Supabase SQL Editor.
--
-- Este script RESETEA solamente la configuracion de workflow de line = 'ipanel':
--   workflow_requirement
--   workflow_edge
--   workflow_stage
-- No toca portones ni registros productivos de public.ipanel.

begin;

-- Asegura que public.ipanel tenga las columnas que usa el flujo.
alter table public.ipanel add column if not exists diseno text null default 'Pendiente'::text;
alter table public.ipanel add column if not exists diseno_inicio timestamp with time zone null;
alter table public.ipanel add column if not exists diseno_fin timestamp with time zone null;

alter table public.ipanel add column if not exists guillotina text null default 'Pendiente'::text;
alter table public.ipanel add column if not exists guillotina_inicio timestamp with time zone null;
alter table public.ipanel add column if not exists guillotina_fin timestamp with time zone null;

alter table public.ipanel add column if not exists plegado text null default 'Pendiente'::text;
alter table public.ipanel add column if not exists plegado_inicio timestamp with time zone null;
alter table public.ipanel add column if not exists plegado_fin timestamp with time zone null;

alter table public.ipanel add column if not exists pintura text null default 'Pendiente'::text;
alter table public.ipanel add column if not exists pintura_inicio timestamp with time zone null;
alter table public.ipanel add column if not exists pintura_fin timestamp with time zone null;

alter table public.ipanel add column if not exists inyeccion text null default 'Pendiente'::text;
alter table public.ipanel add column if not exists inyeccion_inicio timestamp with time zone null;
alter table public.ipanel add column if not exists inyeccion_fin timestamp with time zone null;

alter table public.ipanel add column if not exists despacho text null default 'Pendiente'::text;
alter table public.ipanel add column if not exists despacho_inicio timestamp with time zone null;
alter table public.ipanel add column if not exists despacho_fin timestamp with time zone null;

alter table public.ipanel add column if not exists fecha_prod date null;
alter table public.ipanel add column if not exists fecha_plan_entrega date null;
alter table public.ipanel add column if not exists descripcion text null;

-- Normaliza nulos legacy a Pendiente para que aparezcan correctamente en el tablero.
update public.ipanel
set
  diseno = coalesce(diseno, 'Pendiente'),
  guillotina = coalesce(guillotina, 'Pendiente'),
  plegado = coalesce(plegado, 'Pendiente'),
  pintura = coalesce(pintura, 'Pendiente'),
  inyeccion = coalesce(inyeccion, 'Pendiente'),
  despacho = coalesce(despacho, 'Pendiente')
where diseno is null
   or guillotina is null
   or plegado is null
   or pintura is null
   or inyeccion is null
   or despacho is null;

-- Resetea solo la linea ipanel.
delete from public.workflow_requirement where line = 'ipanel';
delete from public.workflow_edge where line = 'ipanel';
delete from public.workflow_stage where line = 'ipanel';

-- Etapas productivas iPanel.
insert into public.workflow_stage (line, key, label, status_col, start_col, end_col, enabled)
values
  ('ipanel', 'diseno',     'Diseño iPanel',      'diseno',     'diseno_inicio',     'diseno_fin',     true),
  ('ipanel', 'guillotina', 'Corte iPanel',       'guillotina', 'guillotina_inicio', 'guillotina_fin', true),
  ('ipanel', 'plegado',    'Plegado iPanel',     'plegado',    'plegado_inicio',    'plegado_fin',    true),
  ('ipanel', 'pintura',    'Pintura iPanel',     'pintura',    'pintura_inicio',    'pintura_fin',    true),
  ('ipanel', 'inyeccion',  'Inyección iPanel',   'inyeccion',  'inyeccion_inicio',  'inyeccion_fin',  true),
  ('ipanel', 'despacho',   'Despacho iPanel',    'despacho',   'despacho_inicio',   'despacho_fin',   true);

-- Flujo lineal default:
-- Diseño -> Corte -> Plegado -> Pintura -> Inyección -> Despacho
insert into public.workflow_edge (line, from_key, to_key, priority, enabled, condition_json)
values
  ('ipanel', 'diseno',     'guillotina', 100, true, null),
  ('ipanel', 'guillotina', 'plegado',    100, true, null),
  ('ipanel', 'plegado',    'pintura',    100, true, null),
  ('ipanel', 'pintura',    'inyeccion',  100, true, null),
  ('ipanel', 'inyeccion',  'despacho',   100, true, null);

-- Requisitos para poder iniciar cada etapa.
-- La primera etapa, diseno, no tiene requisitos.
insert into public.workflow_requirement (line, stage_key, type, group_id, required_key)
values
  ('ipanel', 'guillotina', 'ALL', null, 'diseno'),
  ('ipanel', 'plegado',    'ALL', null, 'guillotina'),
  ('ipanel', 'pintura',    'ALL', null, 'plegado'),
  ('ipanel', 'inyeccion',  'ALL', null, 'pintura'),
  ('ipanel', 'despacho',   'ALL', null, 'inyeccion');

commit;


-- Campo disponible para condiciones de workflow:
-- En /admin/workflow, linea iPanels, usar campo `descripcion` con operador `contains`.
-- Ejemplos:
--   descripcion contains SIMIL ALUMINIO
--   descripcion contains SIMIL MADERA

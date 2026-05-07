-- Workflow iPanels con bifurcacion por descripcion:
-- - ALUMINIO: Plegado -> Pintura -> Inyeccion
-- - MADERA:   Plegado -> Inyeccion (saltea Pintura)
--
-- Ejecutar en Supabase.
-- No toca registros de public.ipanel; solo configura workflow_* para line = 'ipanel'.

insert into public.workflow_stage(line, key, label, status_col, start_col, end_col, enabled)
values
  ('ipanel', 'diseno', 'Diseño iPanel', 'diseno', 'diseno_inicio', 'diseno_fin', true),
  ('ipanel', 'guillotina', 'Corte iPanel', 'guillotina', 'guillotina_inicio', 'guillotina_fin', true),
  ('ipanel', 'plegado', 'Plegado iPanel', 'plegado', 'plegado_inicio', 'plegado_fin', true),
  ('ipanel', 'pintura', 'Pintura iPanel', 'pintura', 'pintura_inicio', 'pintura_fin', true),
  ('ipanel', 'inyeccion', 'Inyección iPanel', 'inyeccion', 'inyeccion_inicio', 'inyeccion_fin', true),
  ('ipanel', 'despacho', 'Despacho iPanel', 'despacho', 'despacho_inicio', 'despacho_fin', true)
on conflict (line, key) do update set
  label = excluded.label,
  status_col = excluded.status_col,
  start_col = excluded.start_col,
  end_col = excluded.end_col,
  enabled = excluded.enabled;

delete from public.workflow_edge where line = 'ipanel';

insert into public.workflow_edge(line, from_key, to_key, priority, enabled, condition_json)
values
  ('ipanel', 'diseno', 'guillotina', 100, true, null),
  ('ipanel', 'guillotina', 'plegado', 100, true, null),
  (
    'ipanel',
    'plegado',
    'pintura',
    100,
    true,
    '{"all":[{"field":"descripcion","op":"contains","value":"ALUMINIO"}],"any":[]}'::jsonb
  ),
  (
    'ipanel',
    'plegado',
    'inyeccion',
    110,
    true,
    '{"all":[{"field":"descripcion","op":"contains","value":"MADERA"}],"any":[]}'::jsonb
  ),
  ('ipanel', 'pintura', 'inyeccion', 100, true, null),
  ('ipanel', 'inyeccion', 'despacho', 100, true, null);

delete from public.workflow_requirement where line = 'ipanel';

-- Requisitos simples. Inyeccion NO requiere Pintura, porque si no bloquea la ruta de MADERA.
-- La habilitacion de Inyeccion queda definida por las rutas: desde Plegado (MADERA) o desde Pintura (ALUMINIO).
insert into public.workflow_requirement(line, stage_key, type, group_id, required_key)
values
  ('ipanel', 'guillotina', 'ALL', null, 'diseno'),
  ('ipanel', 'plegado', 'ALL', null, 'guillotina'),
  ('ipanel', 'pintura', 'ALL', null, 'plegado'),
  ('ipanel', 'despacho', 'ALL', null, 'inyeccion');

-- Divide la sección "Laser" (portones) en 3 secciones físicas paralelas:
--   laser_dintel          -> habilita Armado marcos piernas (misma condición de
--                            Sistema que tenía el viejo edge laser->armado_marco_piernas)
--   laser_hojas           -> habilita Armado de hoja
--   laser_brazos_espada   -> habilita Armado Primario (nuevo; Armado Primario ya
--                            requería ALL(armado_hojas, armado_marco_piernas), ahora
--                            además requiere ALL(laser_brazos_espada))
--
-- La sección "laser" vieja NO se borra: se deshabilita (workflow_stage.enabled=false)
-- y sus datos históricos quedan intactos. Todo portón que ya tenía laser=Finalizado
-- se backfillea como Finalizado en las 3 nuevas (mismos inicio/fin), para que nada
-- quede invisible en Armado de hoja / Armado marcos piernas / Armado Primario al
-- cambiar los workflow_requirement (la lección del quilombo de Diseño Piernas/
-- Revestimiento: ahí lo que rompió visibilidad fue agregar un requirement nuevo
-- sin backfillear a los portones que ya habían pasado esa etapa bajo las reglas viejas).
--
-- IMPORTANTE: los 3 ALTER TYPE deben ejecutarse fuera de cualquier transacción
-- explícita (Postgres no permite usar un valor de enum recién agregado dentro de
-- la misma transacción en la que se agregó).

-- 1) Nuevos valores del enum porton_etapa
ALTER TYPE public.porton_etapa ADD VALUE IF NOT EXISTS 'laser_dintel';
ALTER TYPE public.porton_etapa ADD VALUE IF NOT EXISTS 'laser_hojas';
ALTER TYPE public.porton_etapa ADD VALUE IF NOT EXISTS 'laser_brazos_espada';

-- 2) Altas en workflow_stage (línea portones) + baja cosmética de la vieja 'laser'
--    (enabled=false: deja de ofrecerse en el Workflow Designer, pero conserva su
--    fila y todo su historial en porton_etapas_estado/tiempos intacto)
INSERT INTO public.workflow_stage (line, key, label, status_col, start_col, end_col, enabled)
VALUES
  ('portones', 'laser_dintel', 'Laser tubos Dintel', 'laser_dintel', 'laser_dintel_inicio', 'laser_dintel_fin', true),
  ('portones', 'laser_hojas', 'Laser tubos Hojas', 'laser_hojas', 'laser_hojas_inicio', 'laser_hojas_fin', true),
  ('portones', 'laser_brazos_espada', 'Laser tubos Brazos y Espada', 'laser_brazos_espada', 'laser_brazos_espada_inicio', 'laser_brazos_espada_fin', true)
ON CONFLICT (line, key) DO NOTHING;

UPDATE public.workflow_stage
   SET enabled = false, updated_at = now()
 WHERE line = 'portones' AND key = 'laser';

-- 3) Backfill: todo portón con laser=Finalizado pasa a tener las 3 nuevas también
--    Finalizado, con los mismos inicio/fin históricos que tenía 'laser'.
INSERT INTO public.porton_etapas_estado (porton_id, etapa, estado)
SELECT e.porton_id, k.etapa::public.porton_etapa, 'Finalizado'
FROM public.porton_etapas_estado e
CROSS JOIN (VALUES ('laser_dintel'), ('laser_hojas'), ('laser_brazos_espada')) AS k(etapa)
WHERE e.etapa = 'laser' AND e.estado = 'Finalizado'
ON CONFLICT (porton_id, etapa) DO NOTHING;

INSERT INTO public.porton_etapas_tiempos (porton_id, etapa, inicio, fin)
SELECT t.porton_id, k.etapa::public.porton_etapa, t.inicio, t.fin
FROM public.porton_etapas_tiempos t
JOIN public.porton_etapas_estado e ON e.porton_id = t.porton_id AND e.etapa = 'laser' AND e.estado = 'Finalizado'
CROSS JOIN (VALUES ('laser_dintel'), ('laser_hojas'), ('laser_brazos_espada')) AS k(etapa)
WHERE t.etapa = 'laser'
ON CONFLICT (porton_id, etapa) DO NOTHING;

-- 4) Motivos de QC (Observado/Rechazado): copiar los de 'laser' a las 3 nuevas,
--    para que el desplegable de motivos no quede vacío en las nuevas secciones.
--    (sin unique constraint en qc_motive: se guarda con NOT EXISTS para poder
--    re-correr el script sin duplicar filas)
INSERT INTO public.qc_motive (line, kind, stage_key, label, enabled, priority)
SELECT m.line, m.kind, k.etapa, m.label, m.enabled, m.priority
FROM public.qc_motive m
CROSS JOIN (VALUES ('laser_dintel'), ('laser_hojas'), ('laser_brazos_espada')) AS k(etapa)
WHERE m.line = 'portones' AND m.stage_key = 'laser'
  AND NOT EXISTS (
    SELECT 1 FROM public.qc_motive m2
    WHERE m2.line = m.line AND m2.kind = m.kind AND m2.stage_key = k.etapa AND m2.label = m.label
  );

-- 5) Scope de QC: todo usuario con scope no-global sobre 'laser' recibe el mismo
--    scope en las 3 nuevas (si no, queda bloqueado para aprobar QC ahí).
INSERT INTO public.qc_user_scope (user_id, line, stage_key, enabled)
SELECT s.user_id, s.line, k.etapa, s.enabled
FROM public.qc_user_scope s
CROSS JOIN (VALUES ('laser_dintel'), ('laser_hojas'), ('laser_brazos_espada')) AS k(etapa)
WHERE s.line = 'portones' AND s.stage_key = 'laser'
ON CONFLICT DO NOTHING;

-- 6) Insumos: la sección de pedidos "laser" (por ruta /laser) ahora se
--    autoriza también vía scope de portones en cualquiera de las 3 nuevas
--    (ver Backend/server/routes/public/insumos.js, cambio de código en paralelo).

-- 7) Edges: apagar los 3 viejos que salen de/hacia 'laser', prender los nuevos.
UPDATE public.workflow_edge SET enabled = false
 WHERE line = 'portones' AND from_key = 'diseno' AND to_key = 'laser';
UPDATE public.workflow_edge SET enabled = false
 WHERE line = 'portones' AND from_key = 'laser' AND to_key = 'armado_hojas';
UPDATE public.workflow_edge SET enabled = false
 WHERE line = 'portones' AND from_key = 'laser' AND to_key = 'armado_marco_piernas';

INSERT INTO public.workflow_edge (line, from_key, to_key, priority, enabled, condition_json)
SELECT * FROM (VALUES
  ('portones', 'diseno', 'laser_dintel', 40, true, null::jsonb),
  ('portones', 'diseno', 'laser_hojas', 41, true, null::jsonb),
  ('portones', 'diseno', 'laser_brazos_espada', 42, true, null::jsonb),
  ('portones', 'laser_hojas', 'armado_hojas', 100, true, null::jsonb),
  ('portones', 'laser_dintel', 'armado_marco_piernas', 101, true,
    '{"all":[],"any":[{"op":"contains","field":"Sistema","value":"PVC"},{"op":"contains","field":"Sistema","value":"ACERO"}]}'::jsonb),
  ('portones', 'laser_brazos_espada', 'armado_primario', 100, true, null::jsonb)
) AS v(line, from_key, to_key, priority, enabled, condition_json)
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_edge e
  WHERE e.line = v.line AND e.from_key = v.from_key AND e.to_key = v.to_key
);

-- 8) Requirements: armado_hojas y armado_marco_piernas ahora piden la nueva
--    etapa de laser correspondiente en vez de la vieja 'laser'. Armado Primario
--    suma el requisito de laser_brazos_espada (además de los ya existentes
--    armado_hojas + armado_marco_piernas).
UPDATE public.workflow_requirement SET required_key = 'laser_hojas'
 WHERE line = 'portones' AND stage_key = 'armado_hojas' AND required_key = 'laser';
UPDATE public.workflow_requirement SET required_key = 'laser_dintel'
 WHERE line = 'portones' AND stage_key = 'armado_marco_piernas' AND required_key = 'laser';

INSERT INTO public.workflow_requirement (line, stage_key, type, group_id, required_key)
SELECT 'portones', 'armado_primario', 'ALL', null, 'laser_brazos_espada'
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_requirement
  WHERE line = 'portones' AND stage_key = 'armado_primario' AND required_key = 'laser_brazos_espada'
);

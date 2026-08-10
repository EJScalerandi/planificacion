-- Nuevas secciones iniciales: "Diseño Piernas" y "Diseño Revestimiento".
-- La sección "Diseño" existente se mantiene 100% funcional, solo se le
-- renombra el label a "Diseño Tubos" para distinguirla de las 2 nuevas.
--
-- IMPORTANTE: las 2 sentencias ALTER TYPE deben ejecutarse cada una en su
-- propia transacción/autocommit (Postgres no permite usar un valor de enum
-- recién agregado dentro de la misma transacción en la que se agregó).
-- No envolver este archivo completo en un BEGIN/COMMIT.

-- 1) Nuevos valores del enum porton_etapa (uno por sentencia, sin transacción explícita)
ALTER TYPE public.porton_etapa ADD VALUE IF NOT EXISTS 'diseno_piernas';
ALTER TYPE public.porton_etapa ADD VALUE IF NOT EXISTS 'diseno_revestimiento';

-- 2) Rename cosmético del stage existente (solo label, sin tocar key/status_col/etc.)
UPDATE public.workflow_stage
   SET label = 'Diseño Tubos', updated_at = now()
 WHERE line = 'portones' AND key = 'diseno';

-- 3) Altas de los 2 nuevos stages en workflow_stage (línea portones).
--    Enabled = true para que aparezcan de entrada en el Workflow Designer,
--    pero SIN edges/requirements todavía: el usuario los va a definir a mano
--    desde /admin/workflow. Hasta que eso pase, no entra ningún portón
--    (nuevo ni existente) a estas 2 etapas automáticamente.
INSERT INTO public.workflow_stage (line, key, label, status_col, start_col, end_col, enabled)
VALUES
  ('portones', 'diseno_piernas', 'Diseño Piernas', 'diseno_piernas', 'diseno_piernas_inicio', 'diseno_piernas_fin', true),
  ('portones', 'diseno_revestimiento', 'Diseño Revestimiento', 'diseno_revestimiento', 'diseno_revestimiento_inicio', 'diseno_revestimiento_fin', true)
ON CONFLICT (line, key) DO NOTHING;

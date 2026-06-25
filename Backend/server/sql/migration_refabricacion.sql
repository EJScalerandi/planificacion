-- =============================================================
-- MIGRACIÓN: Refabricación + Gate armado_final → despacho
-- Aplicar ANTES de reiniciar el backend.
-- Todas las operaciones son aditivas (IF NOT EXISTS) — seguro en producción.
-- =============================================================

ALTER TABLE public.portones
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES public.portones(id),
  ADD COLUMN IF NOT EXISTS revision_ok BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS detalle_refabricacion TEXT;

-- Índice para buscar refabricaciones por portón padre
CREATE INDEX IF NOT EXISTS idx_portones_parent_id ON public.portones(parent_id);

-- Índice para listar portones por tipo (normal/refabricacion)
CREATE INDEX IF NOT EXISTS idx_portones_tipo ON public.portones(tipo);

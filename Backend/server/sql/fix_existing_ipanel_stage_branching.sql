-- IMPORTANTE: usar solo si tenes registros de prueba/legacy en public.ipanel
-- creados antes del cambio, donde todas las etapas quedaron en 'Pendiente'.
--
-- Este script deja solo Diseño como etapa inicial cuando no hay tiempos iniciados/finalizados.
-- No toca etapas que ya tengan inicio o fin.

update public.ipanel
set
  guillotina = case when guillotina = 'Pendiente' and guillotina_inicio is null and guillotina_fin is null then null else guillotina end,
  plegado = case when plegado = 'Pendiente' and plegado_inicio is null and plegado_fin is null then null else plegado end,
  pintura = case when pintura = 'Pendiente' and pintura_inicio is null and pintura_fin is null then null else pintura end,
  inyeccion = case when inyeccion = 'Pendiente' and inyeccion_inicio is null and inyeccion_fin is null then null else inyeccion end,
  despacho = case when despacho = 'Pendiente' and despacho_inicio is null and despacho_fin is null then null else despacho end,
  updated_at = now()
where fecha_prod is not null;

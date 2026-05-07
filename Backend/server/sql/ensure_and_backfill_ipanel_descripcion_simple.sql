-- Asegura columnas necesarias y rellena descripcion_simple en iPanels ya creados
-- usando preproduccion_valores_ipanels como fuente.

alter table if exists public.preproduccion_valores_ipanels
  add column if not exists descripcion_simple text;

alter table if exists public.ipanel
  add column if not exists descripcion_simple text;

-- Normaliza el valor simple en preproduccion desde top-level o data JSON.
update public.preproduccion_valores_ipanels p
set descripcion_simple = upper(nullif(trim(coalesce(
      p.descripcion_simple,
      p.data->>'DescripcionSimple',
      p.data->>'descripcion_simple'
    )), '')),
    data = jsonb_set(
      jsonb_set(
        coalesce(p.data, '{}'::jsonb),
        '{DescripcionSimple}',
        to_jsonb(upper(nullif(trim(coalesce(
          p.descripcion_simple,
          p.data->>'DescripcionSimple',
          p.data->>'descripcion_simple'
        )), ''))),
        true
      ),
      '{descripcion_simple}',
      to_jsonb(upper(nullif(trim(coalesce(
        p.descripcion_simple,
        p.data->>'DescripcionSimple',
        p.data->>'descripcion_simple'
      )), ''))),
      true
    ),
    updated_at = now()
where nullif(trim(coalesce(
      p.descripcion_simple,
      p.data->>'DescripcionSimple',
      p.data->>'descripcion_simple'
    )), '') is not null;

-- Rellena public.ipanel.descripcion_simple para los ya enviados a produccion.
update public.ipanel i
set descripcion_simple = src.descripcion_simple,
    updated_at = now()
from (
  select distinct on (p.partida)
    p.partida,
    upper(nullif(trim(coalesce(
      p.descripcion_simple,
      p.data->>'DescripcionSimple',
      p.data->>'descripcion_simple'
    )), '')) as descripcion_simple
  from public.preproduccion_valores_ipanels p
  where nullif(trim(coalesce(
      p.descripcion_simple,
      p.data->>'DescripcionSimple',
      p.data->>'descripcion_simple'
    )), '') is not null
  order by p.partida, p.updated_at desc nulls last, p.id desc
) src
where i.partida = src.partida
  and src.descripcion_simple is not null
  and (i.descripcion_simple is null or trim(i.descripcion_simple) = '');

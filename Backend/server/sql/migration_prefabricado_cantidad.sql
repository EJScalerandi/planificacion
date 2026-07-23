-- La sección que solicita un prefabricado ahora debe indicar la cantidad.
alter table public.prefabricado_ordenes
  add column if not exists cantidad int not null default 1;

-- Referencia opcional (NV u otro número) al pedir un prefabricado desde una
-- sección, para que quien lo reciba en las secciones siguientes sepa a qué
-- producto corresponde. Texto libre, nunca requerido.
alter table public.prefabricado_ordenes add column if not exists referencia text;

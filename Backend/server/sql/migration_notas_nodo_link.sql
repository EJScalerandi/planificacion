-- Suma un link editable a public.notas_nodo (ver migration_notas_nodo.sql),
-- para poder guardar por cuadro del diagrama "Índice de Programación" una URL
-- de referencia (ej. el repo, un doc, un tablero) visible para todo el equipo.
-- Correr a mano contra la base (Supabase), igual que el resto de server/sql/*.sql.

alter table public.notas_nodo
  add column if not exists link text not null default '';

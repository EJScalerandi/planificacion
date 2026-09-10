-- Suma usuario/contraseña editables a public.notas_nodo (ver
-- migration_notas_nodo.sql), para que el equipo pueda cargar a mano el
-- acceso real de cada cuadro del diagrama "Índice de Programación" y
-- quede guardado para todos, junto con la nota.
-- Correr a mano contra la base (Supabase), igual que el resto de server/sql/*.sql.

alter table public.notas_nodo
  add column if not exists admin_user text not null default '',
  add column if not exists admin_password text not null default '';

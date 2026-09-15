-- Nota compartida por nodo del diagrama "Índice de Programación": texto libre
-- para que los programadores anoten quién está trabajando ahí y qué está
-- haciendo. Un nodo sin fila acá todavía no tiene nota cargada.
-- Correr a mano contra la base (Supabase), igual que el resto de server/sql/*.sql.

create table if not exists public.notas_nodo (
  nodo_id text primary key,
  nota text not null default '',
  updated_by text,
  updated_at timestamptz not null default now()
);

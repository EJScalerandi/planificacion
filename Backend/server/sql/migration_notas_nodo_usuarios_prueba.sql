-- Usuarios de prueba cargados a mano por cuadro del diagrama "Índice de
-- Programación" (ver migration_notas_nodo.sql / migration_notas_nodo_credenciales.sql).
-- A diferencia de admin_user/admin_password (un solo acceso "principal" por
-- nodo), acá se pueden cargar varios usuarios de prueba distintos por nodo
-- (ej. uno por rol: vendedor, distribuidor, superusuario).
-- Correr a mano contra la base (Supabase), igual que el resto de server/sql/*.sql.

create table if not exists public.notas_nodo_usuarios_prueba (
  id bigint generated always as identity primary key,
  nodo_id text not null,
  etiqueta text not null default '',
  usuario text not null,
  password text not null,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists notas_nodo_usuarios_prueba_nodo_id_idx
  on public.notas_nodo_usuarios_prueba (nodo_id, created_at);

# Portones Backend (refactor modular)

Este ZIP contiene una refactorización **modular** del `index.js` monolítico que compartiste.
- Mantiene las rutas existentes (QC, workflow, portones, ipanel, bases, preproducción)
- Centraliza infra (CORS, DB pool, auth admin JWT, cierre del pool)
- Agrega endpoints faltantes para **gestión de admin_users** (crear usuarios, scopes, activar/desactivar, cambiar password)

## Instalación
```bash
npm install
npm run dev
# o
npm start
```

## Migración recomendada (admin_users scopes)
Si tu tabla `public.admin_users` todavía no tiene columna `scopes`, ejecutá:

```sql
alter table public.admin_users
  add column if not exists scopes text[] not null default '{}'::text[];

alter table public.admin_users
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
```

## Nuevos endpoints (Admin Users Dashboard)
Requieren `Authorization: Bearer <token>` obtenido con `/admin/login`.

- `GET  /admin/users`
- `POST /admin/users`  body: `{ username, password, is_active?, scopes? }`
- `PATCH /admin/users/:id` body: `{ is_active?, scopes? }`
- `POST /admin/users/:id/password` body: `{ password }`
- `GET  /admin/scopes` (lista scopes disponibles; configurable en env `ADMIN_SCOPES`)

## Nota sobre .env
El archivo `.env` viene incluido porque lo solicitaste. Evitá commitearlo a repos públicos.

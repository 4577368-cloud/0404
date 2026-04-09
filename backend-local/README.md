# backend-local

Local-only backend for Supabase data operations.

## Why this folder exists

- Runs only on your machine.
- Does not deploy to Vercel (excluded by root `.vercelignore`).
- Keeps service-role logic out of frontend/Vercel runtime.

## Setup

1. Copy env file:
   - `cp .env.example .env`
2. Fill in:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Install dependencies:
   - `npm install`
4. Start local backend:
   - `npm run dev`

Default URL: `http://localhost:8787`
Admin page: `http://localhost:8787/admin`

## Endpoints

- `GET /health`
- `GET /admin/api/overview`
- `GET /admin/api/users?page=1&pageSize=20&keyword=&vipOnly=0`
  - If RPC `admin_users` fails (SQL 未执行或版本不一致)，会自动回退到 **Auth Admin API** + `user_stats` 拼表（响应里 `data._source === 'auth_admin_fallback'`）。
  - 建议在 Supabase 执行 `supabase/sql/009_admin_users_group_by.sql` 修复 `admin_users`（多行 `user_stats` 时去重）。
- `GET /admin/api/trends?days=30`
- `POST /supabase/rpc/:fn`
  - body: `{ "args": { ... } }`
- `POST /supabase/query`
  - body:
    - `table`: string (required)
    - `select`: string (optional, default `*`)
    - `filters`: array (optional), each item: `{ "column": "user_id", "op": "eq", "value": "..." }`
    - `order`: object (optional), e.g. `{ "column": "created_at", "ascending": false }`
    - `limit`: number (optional)
    - `single`: boolean (optional)
- `POST /supabase/upsert`
  - body: `{ "table": "...", "rows": {...} | [{...}], "onConflict": "id" }`

This backend is local-only by design and uses service-role key to handle privileged Supabase operations off the frontend.

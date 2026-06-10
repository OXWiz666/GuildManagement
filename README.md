# Guild Management

Guild Management is a monorepo for running MMO guild operations: member onboarding, role management, boss schedules, attendance, loot sales, guild accounting, audit history, and real-time dashboard updates.

## Workspace Map

- `apps/web` - Next.js application. Owns routes, dashboard screens, auth screens, UI components, browser state, Socket.IO client wiring, and typed API calls.
- `apps/api` - Express API. Owns authentication, authorization, business workflows, cache invalidation, audit logging, and Socket.IO events.
- `packages/shared` - Shared TypeScript contracts, constants, enums, and Zod validators used across apps.
- `packages/db` - Prisma schema, generated Prisma client, seed data, and database exports.

## Prerequisites

- Node.js `>=20.0.0`
- pnpm `10.12.1`
- PostgreSQL or a Supabase-compatible Postgres database
- Optional Redis instance for multi-process Socket.IO scaling

Install dependencies from the repository root:

```powershell
pnpm.cmd install
```

If your PowerShell policy allows pnpm scripts, `pnpm install` is also fine.

## Environment Variables

Create a root `.env` file for local development. Do not commit secrets.

| Name | Used by | Required | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | API | No | Defaults to `development`. |
| `PORT` | API | No | Defaults to `4000`. |
| `DATABASE_URL` | API, Prisma | Yes | Postgres connection string. |
| `DIRECT_URL` | Prisma | Yes | Direct database URL for Prisma migrations/generation. |
| `JWT_ACCESS_SECRET` | API | Yes | Minimum 32 characters. |
| `JWT_REFRESH_SECRET` | API | Yes | Minimum 32 characters. |
| `JWT_ACCESS_EXPIRY` | API | No | Defaults to `15m`. |
| `JWT_REFRESH_EXPIRY` | API | No | Defaults to `7d`. |
| `BCRYPT_ROUNDS` | API | No | Defaults to `12`; accepted range is `10` to `15`. |
| `CORS_ORIGIN` | API | No | Defaults to `http://localhost:3000`. |
| `REDIS_URL` | API | No | Enables the Socket.IO Redis adapter when present. |
| `NEXT_PUBLIC_API_URL` | Web | No | Defaults to `http://localhost:4000/api`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Web Supabase utils | If Supabase utils are used | Public Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Web Supabase utils | If Supabase utils are used | Public/publishable key only. Never use a service-role key. |

## Development

Generate Prisma client code:

```powershell
pnpm.cmd db:generate
```

Run migrations and seed data when needed:

```powershell
pnpm.cmd db:migrate
pnpm.cmd db:seed
```

Start all dev services:

```powershell
pnpm.cmd run dev
```

Target one app:

```powershell
pnpm.cmd run dev:web
pnpm.cmd run dev:api
```

Local URLs:

- Web: `http://localhost:3000`
- API base: `http://localhost:4000/api`
- API health: `http://localhost:4000/api/health`

## Windows PowerShell Troubleshooting

### `pnpm.ps1 cannot be loaded`

PowerShell may block the pnpm PowerShell wrapper with this error:

```text
pnpm.ps1 cannot be loaded because running scripts is disabled on this system.
```

Use either option:

```powershell
pnpm.cmd run dev
```

Or allow locally trusted user scripts once:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

After that, `pnpm run dev` should work in normal PowerShell sessions.

The root also includes Windows-named aliases for discoverability:

```powershell
pnpm.cmd run dev:win
pnpm.cmd run dev:web:win
pnpm.cmd run dev:api:win
```

### Port `3000` is already in use

Next.js may report that another dev server is already running for `apps/web`. If it prints a PID, stop that process:

```powershell
Stop-Process -Id <PID> -Force
```

### Port `4000` is already in use

The API listens on `PORT`, defaulting to `4000`. Check the process and stop it only if it belongs to this local dev app:

```powershell
netstat -ano | Select-String ":4000"
Get-Process -Id <PID>
Stop-Process -Id <PID> -Force
```

Alternatively, change `PORT` and update `CORS_ORIGIN` / `NEXT_PUBLIC_API_URL` consistently.

## Quality Commands

```powershell
pnpm.cmd lint
pnpm.cmd build
pnpm.cmd --filter @guild/api test
```

Database helpers:

```powershell
pnpm.cmd db:generate
pnpm.cmd db:migrate
pnpm.cmd db:push
pnpm.cmd db:seed
pnpm.cmd db:studio
```

## Documentation

- [Architecture](./ARCHITECTURE.md) is the canonical system architecture and engineering-rules document.
- `apps/web/README.md` is the generated Next.js README and is not the primary project onboarding guide.

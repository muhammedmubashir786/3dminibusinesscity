# Virtual Angadi (വെർച്വൽ അങ്ങാടി കച്ചവടം) — Monorepo

Status: **Phase 1 scope — Electronics, Mobile & Technology, Kochi only.** No database, no auth, no commerce logic yet.
See `/docs/PROJECT-STATUS.md`, `/docs/PRD.md`, `/docs/ARCHITECTURE.md`, `/docs/ROADMAP.md`, `/docs/DECISIONS.md`.

## What's here
- `apps/web` — Next.js 15 + TypeScript (strict) + Tailwind, skeleton only (one placeholder page)
- `packages/ui`, `packages/database`, `packages/types`, `packages/ai` — empty shared packages, wired into the workspace, populated as later phases land
- `3d/` — empty, reserved for Phase 10+ (Lite 3D City)
- `supabase/` — empty CLI project structure, no schema/migrations yet (Phase 2, pending your approval)
- `.github/workflows/ci.yml` — lint + typecheck on every PR

## What you need to do next (things I can't do for you)
1. **Create a GitHub repo** and push this scaffold to it.
2. **Create a Supabase project** at https://supabase.com/dashboard (free tier). Copy the project URL and anon key into `apps/web/.env.local` (copy from `.env.example` — never commit `.env.local`).
3. Install the Supabase CLI locally/in Termux, then run `supabase init` and `supabase link` inside `/supabase` to connect this folder to your real project.
4. Run `pnpm install` at the repo root.
5. Run `pnpm dev` to confirm the placeholder page loads at `localhost:3000`.
6. Come back and tell me it's running — then we move to **Phase 1 (UX/UI)**, where I need your brand style, colors, logo direction, and visual identity before I write `/docs/UX.md` and start on real screens.

## Commands
```bash
pnpm install       # install all workspace deps
pnpm dev           # run apps/web in dev mode
pnpm build         # production build of apps/web
pnpm lint          # lint all workspaces
pnpm typecheck     # typecheck all workspaces
```

## Non-negotiable rules baked into this scaffold
- No fake/placeholder commerce data anywhere — the home page explicitly says so until real data exists.
- Service-role Supabase key is never referenced in `apps/web/lib/supabase/client.ts` (browser) — only ever in server-only code, later.
- No schema exists yet — `/supabase/migrations` is empty until you approve Phase 2.

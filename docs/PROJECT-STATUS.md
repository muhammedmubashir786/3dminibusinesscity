# PROJECT-STATUS.md — Virtual Angadi (വെർച്വൽ അങ്ങാടി കച്ചവടം)

_Updated after the Phase 1 schema was drafted, applied to local Supabase, security-hardened, and tested._

## 1. Current Project State
Scaffold exists (from the prior "digital-shopping-city" working name), not yet renamed. `pnpm install` / `typecheck` / `build` all verified passing. **The Phase 1 database schema is applied to local Supabase** (5 baseline migrations + 1 RLS-recursion repair migration), with RLS policies verified by SQL tests (01–06, all passing). Application code beyond a placeholder page has not been written yet. Remote Supabase has not been touched.

## 2. Existing Technologies
Installed and verified: Next.js 15, React 18, TypeScript (strict), Tailwind, `@supabase/supabase-js` + `@supabase/ssr` (client/server helpers written, correctly separated, not yet wired into any page), ESLint, pnpm workspaces, GitHub Actions CI (lint/typecheck). Not yet added: shadcn/ui, Three.js/R3F (correctly deferred), Razorpay, Mapbox, Claude API SDK.

## 3. Existing Files
`apps/web` (Next.js app, placeholder page only, Supabase client/server helpers), `packages/{ui,database,types,ai}` (mostly empty placeholders; `packages/types` now holds real generated Supabase types), `supabase/migrations/*` (6 applied migrations — see Section 9), `supabase/seed.sql`, `tests/sql/*` (01–06, all passing locally), `3d/` (empty, untouched — correct for this phase), `.github/workflows/ci.yml`, `/docs/*`.

## 4. Existing Functionality
Database/RLS layer only — no UI beyond the placeholder page reads or writes any of it yet.

## 5. Missing Functionality (Phase 1 scope only — Electronics/Mobile/Tech, Kochi)
Auth UI, product catalog pages, search, product comparison, cart UI, checkout UI. The underlying schema and RLS for all of these already exist and are tested; what's missing is the Next.js application layer on top.

## 6. Required Renaming
Still outstanding. The scaffold still uses the working name "digital-shopping-city" in `package.json`, README, and doc titles. Not yet scheduled — flag before starting.

## 7. MVP Scope (Phase 1, revised)
Unchanged: one city (Kochi), one category group (Electronics, Mobile & Technology — 10 approved subcategories, seeded and confirmed in the local DB), a small number of real or clearly-labelled "DEMO DATA" merchants, full 2D commerce loop, no payment production activation without approval, no 3D. Full detail in `/docs/PRD.md`.

## 8. Development Phases
Schema/RLS work for Steps 3–4 (Merchant Model, Product System) is done and tested. Current focus is Step 2 (Customer Experience pages), starting with a read-only product catalog. Renaming (Step 1) is still outstanding. Full table in `/docs/ROADMAP.md`.

## 9. Migrations applied (local Supabase only — remote untouched)
1. `20260916093454_profiles_and_roles.sql`
2. `20260916093455_merchants_shops.sql`
3. `20260916093456_categories_products.sql`
4. `20260916093457_cart_orders.sql`
5. `20260917103000_security_hardening.sql`
6. `20260919120000_fix_orders_order_items_recursion.sql` — repair migration for a real RLS recursion bug (42P17) found via testing, using SECURITY DEFINER helper functions (`order_visible_to_merchant`, `order_owned_by_customer`).

## 10. Risks
- Category creep — mitigated: categories table is seeded with exactly the 10 approved subcategories, admin-only writes, confirmed via direct query.
- Renaming mid-scaffold could touch many files — will be done as its own isolated step with a clear diff, not bundled into a feature change.
- Real merchant data availability — currently only one test fixture product exists (`Galaxy S24`, from automated testing). Until real merchants are onboarded, all shown data must be marked "DEMO DATA" per the Real Data Rule.

## 11. Current Implementation Focus
Real TypeScript types have been generated from the applied schema (`packages/types/src/index.ts`). Next: build a read-only `/products` page against the real (currently sparse) `products` table, respecting existing RLS. Category filtering and product detail pages follow as separate approval-gated steps.

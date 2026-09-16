# PROJECT-STATUS.md — Virtual Angadi (വെർച്വൽ അങ്ങാടി കച്ചവടം)

_Updated after repository inspection following the Phase 1 scope refinement._

## 1. Current Project State
Scaffold exists (from the prior "digital-shopping-city" working name), not yet renamed. `pnpm install` / `typecheck` / `build` all verified passing. **No app code beyond a placeholder page. No database, no auth, no real content.** This document supersedes the previous version: the project is now scoped to **Kochi + Electronics/Mobile/Technology only** for Phase 1 — vehicles, showrooms, services, and other categories from the earlier blueprint are explicitly deferred.

## 2. Existing Technologies
Installed and verified in the scaffold: Next.js 15, React 18, TypeScript (strict), Tailwind, `@supabase/supabase-js` + `@supabase/ssr` (client/server helpers written, not wired to a real project), ESLint, pnpm workspaces, GitHub Actions CI (lint/typecheck). Not yet added: shadcn/ui, Three.js/R3F (correctly deferred — no 3D in Phase 1), Razorpay, Mapbox, Claude API SDK.

## 3. Existing Files
`apps/web` (Next.js app, one placeholder page, Supabase client/server helper stubs), `packages/{ui,database,types,ai}` (empty placeholders), `supabase/` (empty CLI structure, no migrations), `3d/` (empty, untouched — correct for this phase), `.github/workflows/ci.yml`, `/docs/*`.

## 4. Existing Functionality
None beyond the placeholder page rendering.

## 5. Missing Functionality (Phase 1 scope only — Electronics/Mobile/Tech, Kochi)
Auth, merchant/shop model, product catalog with variants (storage/RAM/color for phones/laptops), search, product comparison, cart, checkout, and the required security/RLS layer underneath all of it.

## 6. Required Renaming
The scaffold still uses the working name "digital-shopping-city" in `package.json`, README, and doc titles. **Proposed:** rename the repo/package to `virtual-angadi`, keep the Malayalam name as the in-app display brand, update all doc titles accordingly. Flagging this as part of the next implementation step rather than doing it silently.

## 7. MVP Scope (Phase 1, revised)
One city (Kochi), one category group (Electronics, Mobile & Technology — 10 subcategories per the Phase 1 spec), a small number of real or clearly-labelled "DEMO DATA" merchants, full 2D commerce loop (discover shop → browse → search → product detail → compare → cart → checkout/enquiry → order), no payment production activation without approval, no 3D. Full detail in `/docs/PRD.md`.

## 8. Development Phases
Phase 1 is now scoped strictly to Electronics/Mobile/Tech in Kochi, built in the 8 steps from your spec (Foundation → Customer Experience → Merchant Model → Product System → Search → Comparison → Cart → Checkout). 3D, additional categories, AI assistant, chat, delivery, and expansion cities are Phase 2+ and require explicit approval before starting. Full table in `/docs/ROADMAP.md`.

## 9. Risks
- Category creep — mitigated by hard-coding category options to the 10 approved subcategories only; adding a category requires an explicit approval step, not just a schema change.
- Renaming mid-scaffold could touch many files — will be done as its own isolated step with a clear diff, not bundled into a feature change.
- Real merchant data availability — until real merchants are onboarded, all shown data must be marked "DEMO DATA" per your Real Data Rule; nothing ships labeled as real without a real merchant behind it.

## 10. Proposed First Implementation Milestone
Given the scaffold already exists and passes install/typecheck/build, the next milestone is **Step 1 (rename + doc alignment) followed by Step 3–4 (merchant + product schema for Electronics only)** — not Step 2 (customer pages) yet, since pages need a schema to query against.

Concretely:
1. Rename package/repo references from `digital-shopping-city` → `virtual-angadi` (isolated commit, no logic changes).
2. Draft the Phase 1 schema: `profiles`, `merchants`, `shops`, `categories` (seeded with only the 10 approved Electronics subcategories), `products`, `product_variants`, `inventory` — **schema draft only, not applied**, per your approval-gate rule.
3. Draft RLS policies for the above.
4. Wait for your approval before writing the migration files or touching `apps/web` pages.

**Files I'd touch for step 1:** `package.json` (root + `apps/web`), `README.md`, `/docs/*.md` titles. No application logic changes.

**Waiting for your approval before starting.**

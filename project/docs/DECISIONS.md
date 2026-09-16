# DECISIONS.md — Virtual Angadi

A running log of human decisions, in order. AI proposes; only entries here are binding.

| # | Decision | Made by |
|---|---|---|
| 1 | Brand name: വെർച്വൽ അങ്ങാടി കച്ചവടം | Human |
| 2 | Code name / repo name: `virtual-angadi` | Human |
| 3 | First launch city: Kochi, Kerala | Human |
| 4 | Expansion order: Kozhikode → other Kerala cities | Human |
| 5 | Full future category list (context only, not Phase 1): Electronics & Mobile Technology, All Services, Second-hand Bikes, Second-hand Cars, Car/Bike Showrooms | Human |
| 6 | Phase 1 scope narrowed to Electronics, Mobile & Technology **only** — 10 subcategories (Mobile Phones, Laptops, Tablets, Smartwatches, Mobile Accessories, Computer Accessories, Headphones/Earphones, TVs, Cameras, Other Electronics) | Human |
| 7 | Vehicles, showrooms, services explicitly excluded from Phase 1; require explicit approval before implementation | Human |
| 8 | Platform type: digital shopping city / virtual marketplace; primary market Kerala; language Malayalam + English | Human |
| 9 | Commerce before 3D — 3D deferred to Phase 5+ | Human |
| 10 | Existing stack (Next.js/TS/Tailwind/Supabase) reused rather than replaced | Human (per spec: "do not replace the stack just for preference") |
| _pending_ | Business model (subscription/commission/hybrid) | Not yet decided — AI proposed hybrid as default, awaiting confirmation |
| _pending_ | Visual/brand direction reference | Not yet given |
| _pending_ | Repo rename execution (package.json/README/doc titles → `virtual-angadi`) | Proposed by AI in PROJECT-STATUS.md, awaiting approval |
| _pending_ | Phase 1 schema (profiles/merchants/shops/categories/products/product_variants/inventory/carts/orders) + RLS — written as real SQL in `/supabase/migrations/` and verified against a real Postgres instance (see `/tests/sql/README.md`), **not applied to any live database**, awaiting approval to run against your actual Supabase project | Drafted by AI, awaiting approval |

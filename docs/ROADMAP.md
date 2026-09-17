# ROADMAP.md — Virtual Angadi

## Phase 1 — Electronics & Technology Marketplace (Kochi)
Workflow per step: inspect → plan → **approval** → implement → test (lint/typecheck/build/tests) → report exactly what changed → **approval** → next step.

| Step | Focus | Gate |
|---|---|---|
| 1 | Project Foundation — inspect repo, align docs, rename to `virtual-angadi` | Docs approved (this update) |
| 2 | Customer Experience — `/`, `/shops`, `/shops/[shop]`, `/products`, `/products/[product]`, `/search`, `/compare`, `/cart`, `/checkout` pages | After schema (Step 3–4) is approved and applied |
| 3 | Merchant Model — merchants → shops → products → variants → inventory (minimum viable, no dashboard yet) | Schema/RLS approval |
| 4 | Product System — fields per PRD, variants for phones/laptops | Schema/RLS approval |
| 5 | Search — product/brand/category/shop search, simple and reliable first | After Step 2 pages exist |
| 6 | Product Comparison — only real DB fields, no invented specs | After Step 4/5 |
| 7 | Cart — add/remove/qty, server-side price & stock validation | After Step 4 |
| 8 | Checkout — address, order summary, enquiry/order confirmation; payment marked pending until Phase 4 builds real payment verification | After Step 7 |

**MVP success criteria:** a real user can go Discover shop → Browse → Search → Product detail → Compare → Cart → Checkout/enquiry → Order, end-to-end, on real or "DEMO DATA"-labeled merchant data.

## Future Phases (not started — listed for context, sequence may change)
| Phase | Focus |
|---|---|
| 2 | More merchant onboarding |
| 3 | Advanced merchant dashboard |
| 4 | Payments + order management hardening |
| 5 | Lite 3D Kochi shopping environment |
| 6 | 3D virtual electronics shops |
| 7 | Merchant/customer chat |
| 8 | AI shopping assistant |
| 9 | Delivery integration |
| 10 | Additional categories (vehicles, showrooms, services, etc.) |
| 11 | Kozhikode launch |
| 12 | Additional Kerala cities |

## Human approval gates (recap)
Database architecture, RLS policies, authentication, payment systems, security changes, data deletion, production infrastructure, major dependencies, architecture changes, and any category/city/scope expansion beyond Phase 1.

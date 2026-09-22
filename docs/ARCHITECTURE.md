# ARCHITECTURE.md — Virtual Angadi, Phase 1

## Stack (unchanged from scaffold — reused, not replaced)
Next.js, React, TypeScript (strict), Tailwind, shadcn/ui (to be added), Supabase (Postgres, Auth, Storage, Realtime where useful), GitHub, Vercel. Razorpay/Mapbox/Claude API/Three.js are **not added in Phase 1** — they belong to later phases per PRD.md's future roadmap.

## System Diagram (Phase 1 scope)
```
User (Browser)
   │
Next.js Frontend (2D pages only)
   │
API Layer (Next.js route handlers)
   │
   ├── Auth (Supabase Auth + RLS)
   ├── Shop/Merchant Service
   ├── Product/Catalog Service (Electronics only)
   ├── Search Service (Postgres full-text)
   ├── Compare Service
   └── Cart/Order Service (server-validated price & stock)
   │
PostgreSQL (Supabase)
```

## Pages (Phase 1)
```
/
/shops
/shops/[shop]
/products
/products/[product]
/search
/compare
/cart
/checkout
```

## Database Schema — Phase 1 (applied to local Supabase, tested; remote untouched)
| Table | Purpose | Key fields |
|---|---|---|
| profiles | User account + role (customer/merchant/admin) | id, role, phone/email |
| merchants | Business owner | id, profile_id, business_name, verified, is_demo |
| shops | Storefront | id, merchant_id, name, address, is_demo |
| categories | Fixed to the 10 approved Electronics subcategories — seeded, not user-editable in Phase 1 | id, name, slug |
| products | Catalog item | id, shop_id, category_id, name, slug, description, brand, price, sale_price, specifications (jsonb), warranty, stock_status, is_demo |
| product_variants | Storage/RAM/color/model variants for phones & laptops | id, product_id, sku, storage, ram, color, model, price, stock |
| inventory | Stock levels | product_id or variant_id, quantity |
| carts, cart_items | Active cart | user/session id, product_id/variant_id, qty |
| orders, order_items | Placed orders/enquiries | id, customer_id, shop_id, status, total |
| payments | Reserved for Phase 4 — not implemented yet | order_id, gateway_ref, status |
| reviews | Reserved for later, not built in Phase 1 | product_id, rating, text |

`is_demo` boolean on merchants/shops/products enforces the Real Data Rule at the schema level — the UI reads this flag to render the "DEMO DATA" label rather than relying on convention alone. Money fields use `numeric`, not float. All tables get `created_at`/`updated_at`.

RLS: customers can read all non-deleted products/shops but only their own cart/orders; merchants can read/write only their own shop/products/orders; admin bypasses via a separate policy, never via a client-trusted role flag. **Schema and RLS are applied locally and verified by tests 01–06. Remote Supabase is not touched without explicit approval.**

## Security (Phase 1)
Supabase Auth + Postgres RLS per role; server-side validation on every cart/checkout mutation (price and stock re-read from DB, never trusted from the request body); no service-role key in any client-bundled file; input validation on all route handlers; secrets only in environment variables.

## Performance (Phase 1)
Fast initial load, image optimization (Next/Image), pagination on product/shop lists, indexes on `products.category_id`, `products.shop_id`, and full-text search columns. No 3D assets in this phase, so no 3D-specific performance work yet.

## Explicitly deferred (do not build in Phase 1)
Payments integration, merchant dashboard beyond basic product/shop CRUD, chat, AI assistant, delivery, admin panel beyond merchant verification, any category outside Electronics/Mobile/Technology, any 3D work.

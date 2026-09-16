# PRD.md — Virtual Angadi (വെർച്വൽ അങ്ങാടി കച്ചവടം)

## Product Vision
Virtual Angadi will become a digital shopping city where real local businesses have digital shops. **Commerce comes first, 3D comes later.** Phase 1 proves the commerce loop works with one category group in one city before any spatial/3D layer is built.

## Phase 1 Scope
**Kochi, Kerala — Electronics, Mobile & Technology only.** Subcategories: Mobile Phones, Laptops, Tablets, Smartwatches, Mobile Accessories, Computer Accessories, Headphones/Earphones, TVs, Cameras, Other Electronics. No other category (vehicles, showrooms, services, fashion, food, grocery) is implemented until Phase 1 is validated and explicitly approved to expand.

## Problem
Local electronics/mobile shops in Kochi are hard to discover and compare online — customers rely on scattered WhatsApp groups or generic marketplaces with no local price transparency.

## Solution
A focused marketplace where a customer can find real Kochi electronics shops, browse real products with real specs/prices, compare across sellers, and complete a checkout or enquiry — validated with real (or clearly labeled demo) merchant data before anything else is added.

## Core Customer Journey (Phase 1)
```
Discover Kochi electronics shops
        ↓
Open a shop
        ↓
Browse products
        ↓
Search products
        ↓
View product details
        ↓
Compare products/prices
        ↓
Add to cart
        ↓
Checkout / enquiry
        ↓
Order
```

## Merchant Journey (Phase 1)
Merchant record → Shop → Products → Product Variants (storage/RAM/color for phones/laptops) → Inventory. No advanced merchant dashboard yet — only the minimum needed to manage products and shop info.

## Admin Journey (Phase 1)
Minimal: verify a merchant is real before their shop goes live. Full admin panel is Phase 2+.

## MVP Success Criteria
Phase 1 is successful only when a real user can go from opening the app to completing a checkout/enquiry, end-to-end, on real or clearly-labeled "DEMO DATA" merchant data — matching the flow above exactly.

## Business Rules
- No product price, discount, stock, spec, warranty, delivery promise, or payment status may be invented. Anything not backed by real merchant input is labeled **"DEMO DATA"** in the UI, never presented as real.
- Cart/checkout price and stock values are always re-validated server-side — the browser's copy of price/stock is never trusted at checkout.
- Payment status is only ever set from a verified server-side/webhook source, never from frontend state, once payments are implemented (Phase 4+).
- Comparison only shows fields that actually exist in the database — no fabricated specs to fill gaps.
- No category, city, or major feature is added without explicit human approval, even if the underlying schema would technically support it.

## Technical Assumptions
Existing scaffold (Next.js/TypeScript/Tailwind/Supabase) is reused, not replaced. Supabase free tier covers Phase 1 database/auth/storage needs. No 3D dependencies (Three.js/R3F) are added until Phase 5+.

## Future Roadmap (not built now, listed for context only)
Phase 2 — more merchant onboarding · Phase 3 — advanced merchant dashboard · Phase 4 — payments/order hardening · Phase 5 — Lite 3D Kochi shopping environment · Phase 6 — 3D virtual electronics shops · Phase 7 — merchant/customer chat · Phase 8 — AI shopping assistant · Phase 9 — delivery integration · Phase 10 — additional categories (vehicles, services, showrooms, etc.) · Phase 11 — Kozhikode launch · Phase 12 — additional Kerala cities. Sequence may change based on real-world validation.

## Risks
| Risk | Impact | Probability | Mitigation |
|---|---|---|---|
| Category/scope creep | High | Medium | Categories hard-limited to the 10 approved Electronics subcategories; any addition needs explicit sign-off |
| Presenting unverified data as real | High | Medium | "DEMO DATA" labeling enforced in UI wherever a real merchant isn't behind the listing |
| Client-trusted price/stock at checkout | High | Low | Server-side re-validation on every cart/checkout action |
| Building 3D before commerce is proven | Medium | Low (explicitly deferred) | 3D work blocked until Phase 5, after Phase 1–4 validation |

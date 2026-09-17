# tests/sql — Manual RLS verification harness

These scripts were used to actually run and verify `/supabase/migrations/*.sql`
against a real Postgres instance before handing them to you — not just
eyeballed. They caught a real bug (see DECISIONS.md / commit notes): the
first draft of the public-read policies on `shops`/`products`/
`product_variants`/`inventory` joined directly to the `merchants` table,
which has no public-read policy of its own — so the join was silently
RLS-filtered to zero rows for anonymous/other users, even after a merchant
was verified. Fixed by routing verification checks through a
`SECURITY DEFINER` helper (`merchant_is_verified()`) instead of a raw join.

## Running against a generic Postgres (no Supabase CLI/Docker needed)
```bash
createdb virtual_angadi_test
psql -d virtual_angadi_test -f tests/sql/00_auth_stub.sql   # fakes auth.users/auth.uid()
for f in supabase/migrations/*.sql; do psql -d virtual_angadi_test -f "$f"; done
psql -d virtual_angadi_test -f supabase/seed/seed.sql
psql -d virtual_angadi_test -f tests/sql/01_seed_test_users.sql
psql -d virtual_angadi_test -f tests/sql/02_merchant_creates_shop_product.sql
psql -d virtual_angadi_test -f tests/sql/03_visibility_before_after_verification.sql
psql -d virtual_angadi_test -f tests/sql/04_role_escalation_and_cart_isolation.sql
```
Each script prints `label | result` rows with the expected value in the
label — compare by eye. `04_...sql` intentionally triggers one expected
Postgres error (a blocked role-escalation attempt) — run it without
`ON_ERROR_STOP` so the rest of the script still executes.

## Running against real Supabase local dev
Skip `00_auth_stub.sql` — `supabase start` already provides the real
`auth` schema. Run the migrations via `supabase db reset` (which applies
everything in `/supabase/migrations` in order) instead of looping `psql`
manually, then run scripts `01`–`04` as above.

## What's NOT covered here yet
Payment RLS (Phase 4, not built), chat RLS (Phase 7), admin panel RLS beyond
the `_all_admin` policies (exercised only structurally, not with a real
admin user in this pass) — add scenarios here as those phases land.

## 05_security_hardening.sql
Added after an independent review (via a separate AI browsing agent) found
two real bugs in the original four migrations, both confirmed and fixed
here, then runtime-verified (not just statically reviewed):
1. `merchants_update_own` had no protection on `verified`/`is_demo` — a
   merchant could self-verify their own shop. Fixed with a trigger
   (`protect_merchant_verification_trigger`) mirroring the pattern already
   used on `profiles.role`.
2. `orders_insert_own` let a customer insert an order with an arbitrary
   `total_amount`/`status`/`is_demo` — the "server validates price" design
   was never actually enforced by RLS. Fixed by removing the policy
   entirely (no client-side order creation until a trusted server-side
   checkout path is built in a later phase) plus a defense-in-depth
   trigger.
Also added: composite FK constraints so a cart/order item can't pair a
product with another product's variant, and corrected partial unique
indexes so duplicate cart rows (with or without a variant) are rejected
while different variants of the same product coexist. All 8 assertions in
`05_security_hardening.sql` pass against a real disposable Postgres —
see the run log in `DECISIONS.md` / commit history for the actual output.

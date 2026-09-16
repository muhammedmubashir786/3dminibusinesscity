-- 0004_cart_orders.sql
-- Phase 1 — Virtual Angadi. NOT APPLIED — draft for review.
-- Payments are NOT part of this migration — Phase 4 adds a payments table
-- and webhook-verified status once payment integration is approved. For
-- Phase 1, checkout produces an order in 'pending_confirmation' status,
-- which is effectively an enquiry until a merchant/admin confirms it.

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.carts is
  'One active cart per customer for Phase 1 — no multi-cart support needed yet.';

create unique index carts_customer_unique_idx on public.carts (customer_id);

create trigger set_carts_updated_at
  before update on public.carts
  for each row execute procedure public.set_updated_at();

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts (id) on delete cascade,
  product_id uuid not null references public.products (id),
  variant_id uuid references public.product_variants (id),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (cart_id, product_id, variant_id)
);

comment on table public.cart_items is
  'Stores ONLY product_id/variant_id/quantity — price is deliberately not
   stored here. It is re-read from products/product_variants at checkout
   time, server-side, so a stale or client-tampered price can never reach
   an order. See PRD.md Business Rules.';

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id),
  status text not null default 'pending_confirmation'
    check (status in ('pending_confirmation', 'confirmed', 'cancelled', 'fulfilled')),
  total_amount numeric(12, 2) not null check (total_amount >= 0),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.orders is
  'total_amount is computed and written server-side at checkout from live
   product/variant prices — never accepted from the client request body.';

create trigger set_orders_updated_at
  before update on public.orders
  for each row execute procedure public.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id),
  variant_id uuid references public.product_variants (id),
  shop_id uuid not null references public.shops (id),
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  created_at timestamptz not null default now()
);

comment on table public.order_items is
  'shop_id is denormalized onto the line item (rather than joined through
   product_id) specifically so merchant order-visibility RLS below does not
   need to join through products/shops on every read — and so a line item
   keeps its original shop even if a product is later reassigned or deleted.
   unit_price is the price AT THE TIME OF ORDER, captured server-side.';

create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_shop_id_idx on public.order_items (shop_id);

-- RLS: carts / cart_items — customer owns their own cart only.
alter table public.carts enable row level security;

create policy "carts_all_own"
  on public.carts for all
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid());

alter table public.cart_items enable row level security;

create policy "cart_items_all_own"
  on public.cart_items for all
  using (
    exists (select 1 from public.carts c where c.id = cart_items.cart_id and c.customer_id = auth.uid())
  )
  with check (
    exists (select 1 from public.carts c where c.id = cart_id and c.customer_id = auth.uid())
  );

-- RLS: orders — customer sees their own; merchant sees orders containing
-- at least one of their own shop's items (via order_items, see below);
-- admin sees all.
alter table public.orders enable row level security;

create policy "orders_select_own"
  on public.orders for select
  using (customer_id = auth.uid());

create policy "orders_insert_own"
  on public.orders for insert
  with check (customer_id = auth.uid());

-- Merchants can see an order if any line item belongs to one of their shops.
create policy "orders_select_merchant"
  on public.orders for select
  using (
    exists (
      select 1 from public.order_items oi
      where oi.order_id = orders.id and public.owns_merchant(
        (select merchant_id from public.shops where id = oi.shop_id)
      )
    )
  );

create policy "orders_all_admin"
  on public.orders for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- RLS: order_items — visible to the order's customer, to the owning
-- merchant of that specific line item, and to admin. No direct insert
-- policy for customers: order_items are written server-side (using the
-- service role, inside the checkout route handler) after price/stock are
-- re-validated — never inserted directly from client code.
alter table public.order_items enable row level security;

create policy "order_items_select_customer"
  on public.order_items for select
  using (
    exists (select 1 from public.orders o where o.id = order_items.order_id and o.customer_id = auth.uid())
  );

create policy "order_items_select_merchant"
  on public.order_items for select
  using (
    public.owns_merchant((select merchant_id from public.shops where id = order_items.shop_id))
  );

create policy "order_items_all_admin"
  on public.order_items for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- 0003_categories_products.sql
-- Phase 1 — Virtual Angadi. NOT APPLIED — draft for review.
-- Categories are fixed to the 10 approved Electronics/Mobile/Technology
-- subcategories for Phase 1. No insert/update/delete policy is granted to
-- any non-admin role, so the category list cannot grow via the app itself —
-- expanding it requires a migration + explicit approval, matching the
-- "no category creep" rule in PRD.md.

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  category_id uuid not null references public.categories (id),
  name text not null,
  slug text not null,
  description text,
  brand text,
  price numeric(12, 2) not null check (price >= 0),
  sale_price numeric(12, 2) check (sale_price is null or sale_price >= 0),
  specifications jsonb not null default '{}'::jsonb,
  warranty text,
  stock_status text not null default 'in_stock'
    check (stock_status in ('in_stock', 'low_stock', 'out_of_stock')),
  is_demo boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, slug)
);

comment on table public.products is
  'Phase 1: Electronics/Mobile/Technology only, enforced by which category_id rows exist, not by an application-level check — see categories seed data.';

create index products_shop_id_idx on public.products (shop_id) where deleted_at is null;
create index products_category_id_idx on public.products (category_id) where deleted_at is null;
create index products_name_search_idx on public.products using gin (to_tsvector('simple', name || ' ' || coalesce(brand, '')));

create trigger set_products_updated_at
  before update on public.products
  for each row execute procedure public.set_updated_at();

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  sku text not null unique,
  storage text,
  ram text,
  color text,
  model text,
  price numeric(12, 2) not null check (price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.product_variants is
  'Optional per product — a product with no variant rows is sold as-is at products.price. Used for phones/laptops (storage/RAM/color).';

create index product_variants_product_id_idx on public.product_variants (product_id);

create trigger set_product_variants_updated_at
  before update on public.product_variants
  for each row execute procedure public.set_updated_at();

create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  check (
    (product_id is not null and variant_id is null)
    or (product_id is null and variant_id is not null)
  )
);

comment on table public.inventory is
  'One row per product (no variants) or per variant. The check constraint prevents a row that is ambiguously attached to both or neither.';

create unique index inventory_product_unique_idx on public.inventory (product_id) where variant_id is null;
create unique index inventory_variant_unique_idx on public.inventory (variant_id) where product_id is null;

create trigger set_inventory_updated_at
  before update on public.inventory
  for each row execute procedure public.set_updated_at();

-- Helper: does the given product belong to a shop the caller's merchant owns?
create function public.owns_product(target_product_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.products p
    join public.shops s on s.id = p.shop_id
    where p.id = target_product_id and public.owns_merchant(s.merchant_id)
  );
$$;

-- RLS: categories — read-only to everyone, writable only via service role
-- (i.e. not through any client-facing policy at all in Phase 1).
alter table public.categories enable row level security;

create policy "categories_select_all"
  on public.categories for select
  using (true);

-- RLS: products — public can read products belonging to a visible shop;
-- merchants can manage their own; admin can manage all.
alter table public.products enable row level security;

create policy "products_select_public"
  on public.products for select
  using (
    deleted_at is null
    and exists (
      select 1 from public.shops s
      where s.id = products.shop_id
        and s.is_active and s.deleted_at is null
        and public.merchant_is_verified(s.merchant_id)
    )
  );

create policy "products_select_own"
  on public.products for select
  using (
    exists (
      select 1 from public.shops s
      where s.id = products.shop_id and public.owns_merchant(s.merchant_id)
    )
  );

create policy "products_insert_own"
  on public.products for insert
  with check (
    exists (
      select 1 from public.shops s
      where s.id = shop_id and public.owns_merchant(s.merchant_id)
    )
  );

create policy "products_update_own"
  on public.products for update
  using (
    exists (
      select 1 from public.shops s
      where s.id = products.shop_id and public.owns_merchant(s.merchant_id)
    )
  )
  with check (
    exists (
      select 1 from public.shops s
      where s.id = shop_id and public.owns_merchant(s.merchant_id)
    )
  );

create policy "products_all_admin"
  on public.products for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- RLS: product_variants — same visibility rules as the parent product.
alter table public.product_variants enable row level security;

create policy "variants_select_public"
  on public.product_variants for select
  using (
    exists (
      select 1 from public.products p
      where p.id = product_variants.product_id
        and p.deleted_at is null
        and exists (
          select 1 from public.shops s
          where s.id = p.shop_id
            and s.is_active and s.deleted_at is null
            and public.merchant_is_verified(s.merchant_id)
        )
    )
  );

create policy "variants_manage_own"
  on public.product_variants for all
  using (public.owns_product(product_id))
  with check (public.owns_product(product_id));

create policy "variants_all_admin"
  on public.product_variants for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- RLS: inventory — stock LEVELS are visible to everyone who can see the
-- product (needed for stock_status/compare views), writable only by the
-- owning merchant or admin.
alter table public.inventory enable row level security;

create policy "inventory_select_public"
  on public.inventory for select
  using (
    (product_id is not null and exists (
      select 1 from public.products p
      where p.id = inventory.product_id and p.deleted_at is null
        and exists (
          select 1 from public.shops s
          where s.id = p.shop_id and s.is_active and s.deleted_at is null
            and public.merchant_is_verified(s.merchant_id)
        )
    ))
    or
    (variant_id is not null and exists (
      select 1 from public.product_variants v
      join public.products p on p.id = v.product_id
      where v.id = inventory.variant_id and p.deleted_at is null
        and exists (
          select 1 from public.shops s
          where s.id = p.shop_id and s.is_active and s.deleted_at is null
            and public.merchant_is_verified(s.merchant_id)
        )
    ))
  );

create policy "inventory_manage_own"
  on public.inventory for all
  using (
    (product_id is not null and public.owns_product(product_id))
    or (variant_id is not null and exists (
      select 1 from public.product_variants v
      where v.id = inventory.variant_id and public.owns_product(v.product_id)
    ))
  )
  with check (
    (product_id is not null and public.owns_product(product_id))
    or (variant_id is not null and exists (
      select 1 from public.product_variants v
      where v.id = inventory.variant_id and public.owns_product(v.product_id)
    ))
  );

create policy "inventory_all_admin"
  on public.inventory for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

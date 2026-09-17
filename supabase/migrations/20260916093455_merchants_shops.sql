-- 0002_merchants_shops.sql
-- Phase 1 — Virtual Angadi. NOT APPLIED — draft for review.

create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  business_name text not null,
  contact_phone text not null,
  verified boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.merchants is
  'Business owner record. verified=false hides the merchant''s shops from public listing until admin approval. is_demo enforces the Real Data Rule.';

create trigger set_merchants_updated_at
  before update on public.merchants
  for each row execute procedure public.set_updated_at();

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  name text not null,
  slug text not null unique,
  address text not null,
  city text not null default 'Kochi',
  is_demo boolean not null default false,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.shops is
  'One merchant may have multiple shops later; Phase 1 assumes one shop per merchant in practice but does not enforce it.';

create index shops_merchant_id_idx on public.shops (merchant_id);
create index shops_city_idx on public.shops (city) where deleted_at is null;

create trigger set_shops_updated_at
  before update on public.shops
  for each row execute procedure public.set_updated_at();

-- Helper: is the given merchant verified? SECURITY DEFINER so that public
-- read policies on shops/products/etc. can check verification status
-- without needing (and without granting) direct public read access to the
-- merchants table itself, which holds contact_phone and other non-public
-- business data.
create function public.merchant_is_verified(target_merchant_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select verified from public.merchants where id = target_merchant_id),
    false
  );
$$;

-- Helper: is the caller the owning merchant of a given merchants.id row?
create function public.owns_merchant(target_merchant_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.merchants
    where id = target_merchant_id and profile_id = auth.uid()
  );
$$;

-- RLS: merchants
alter table public.merchants enable row level security;

-- A merchant can read/update only their own business record.
create policy "merchants_select_own"
  on public.merchants for select
  using (profile_id = auth.uid());

create policy "merchants_update_own"
  on public.merchants for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- A signed-in user can create their own merchant record (self-registration);
-- verified/is_demo default false and are not settable by the client insert
-- because the WITH CHECK below pins them regardless of the submitted row.
create policy "merchants_insert_own"
  on public.merchants for insert
  with check (profile_id = auth.uid() and verified = false and is_demo = false);

-- Admin sees/manages every merchant (approval workflow).
create policy "merchants_all_admin"
  on public.merchants for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- RLS: shops
alter table public.shops enable row level security;

-- Public can see active, non-deleted shops belonging to a verified merchant.
-- (Demo shops are included deliberately — is_demo controls the UI label,
-- not visibility, so Phase 1 can be demoed before real merchants exist.)
create policy "shops_select_public"
  on public.shops for select
  using (
    is_active
    and deleted_at is null
    and public.merchant_is_verified(merchant_id)
  );

-- A merchant can see/manage their own shop even before verification.
create policy "shops_select_own"
  on public.shops for select
  using (public.owns_merchant(merchant_id));

create policy "shops_insert_own"
  on public.shops for insert
  with check (public.owns_merchant(merchant_id));

create policy "shops_update_own"
  on public.shops for update
  using (public.owns_merchant(merchant_id))
  with check (public.owns_merchant(merchant_id));

create policy "shops_all_admin"
  on public.shops for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- 20260917103000_security_hardening.sql
-- Phase 1 — Virtual Angadi / 3dminibusinesscity. NOT APPLIED to any live
-- database — draft, runtime-verified in a disposable local Postgres only.
-- Fixes two real bugs found in the original four migrations:
--   1. merchants_update_own allowed a merchant to self-verify (set
--      verified/is_demo to anything, since the WITH CHECK only pinned
--      profile_id, the same class of bug the profiles table already
--      guarded against but this table did not).
--   2. orders_insert_own let a customer insert an order with an
--      arbitrary total_amount/status/is_demo — the "server validates
--      price" design was never actually enforced at the RLS layer.
-- Also hardens product/variant consistency and cart uniqueness.

-- ---------------------------------------------------------------------
-- 1. Merchant self-verification / is_demo protection
-- ---------------------------------------------------------------------
-- Same pattern as profiles: a trigger pins verified/is_demo to their
-- existing values unless the caller is admin or a trusted (auth.uid()
-- is null) service-role/superuser context.
create or replace function public.protect_merchant_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and public.current_user_role() is distinct from 'admin' then
    if new.verified is distinct from old.verified
       or new.is_demo is distinct from old.is_demo then
      raise exception 'Only an admin can change verified or is_demo on merchants';
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_merchant_verification_trigger
  before update on public.merchants
  for each row execute procedure public.protect_merchant_verification();

-- ---------------------------------------------------------------------
-- 2. Remove direct customer order insertion
-- ---------------------------------------------------------------------
-- total_amount/status/is_demo must never be client-supplied. Until a
-- trusted server-side checkout function (Phase 7/8, not built here) is
-- implemented, no client role can insert orders at all — order creation
-- is intentionally blocked rather than left open with a fake guard.
drop policy if exists "orders_insert_own" on public.orders;

-- A parallel trigger-level guard (defense in depth, in case a future
-- policy reintroduces client insert without noticing the total/status
-- implications): non-admin, non-trusted callers cannot create orders or
-- change server-controlled fields.
create or replace function public.protect_order_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and public.current_user_role() is distinct from 'admin' then
    if tg_op = 'INSERT' then
      raise exception 'Orders must be created via the trusted checkout path';
    end if;

    if new.total_amount is distinct from old.total_amount
       or new.status is distinct from old.status
       or new.is_demo is distinct from old.is_demo then
      raise exception 'Order total, status, and demo state are server-controlled';
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_order_fields_trigger
  before insert or update on public.orders
  for each row execute procedure public.protect_order_fields();

-- ---------------------------------------------------------------------
-- 3. Product/variant integrity — a variant must belong to its product
-- ---------------------------------------------------------------------
alter table public.product_variants
  add constraint product_variants_id_product_unique unique (id, product_id);

alter table public.cart_items
  add constraint cart_items_variant_matches_product
  foreign key (variant_id, product_id) references public.product_variants (id, product_id)
  -- NULL variant_id is allowed through (no variant selected); only a
  -- non-null, mismatched pair is rejected, since composite FKs only
  -- enforce when both columns are non-null.
  ;

alter table public.order_items
  add constraint order_items_variant_matches_product
  foreign key (variant_id, product_id) references public.product_variants (id, product_id);

-- ---------------------------------------------------------------------
-- 4. Cart uniqueness — fix nullable variant_id duplicate bug
-- ---------------------------------------------------------------------
alter table public.cart_items drop constraint if exists cart_items_cart_id_product_id_variant_id_key;

create unique index cart_items_unique_no_variant_idx
  on public.cart_items (cart_id, product_id) where variant_id is null;

create unique index cart_items_unique_with_variant_idx
  on public.cart_items (cart_id, product_id, variant_id) where variant_id is not null;

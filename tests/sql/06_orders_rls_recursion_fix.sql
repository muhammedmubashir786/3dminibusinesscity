-- 06_orders_rls_recursion_fix.sql
-- Covers migration 20260919120000_fix_orders_order_items_recursion.sql
-- (orders <-> order_items circular RLS, SQLSTATE 42P17).
-- Depends on tests 01 and 02 having run first (merchant1 + shop
-- 'kochi-mobile-world' + a product in that shop + test users exist).
-- Independent of test 05 (05 rolls back its own data).
-- Transactional: seeds its own orders in a trusted context and rolls back.
--
-- Fixture users:
--   merchant1 = 11111111-1111-1111-1111-111111111111
--   customer1 = 22222222-2222-2222-2222-222222222222
--   customer2 = 33333333-3333-3333-3333-333333333333
--
-- Fixture orders (both owned by customer1):
--   ...601 has one line item from merchant1's shop
--   ...602 has NO line items
--
-- KNOWN GAP: cross-merchant isolation (merchant B must not see merchant A's
-- order) needs a second merchant + shop. Not seeded here; add once the
-- merchants/shops insert shape is confirmed.

begin;

-- ---------------------------------------------------------------------
-- Seed (trusted context: auth.uid() is null, so protect_order_fields
-- allows the insert, same pattern as test 05)
-- ---------------------------------------------------------------------
insert into public.orders (id, customer_id, total_amount)
values
  ('66666666-6666-6666-6666-666666666601', '22222222-2222-2222-2222-222222222222', 100.00),
  ('66666666-6666-6666-6666-666666666602', '22222222-2222-2222-2222-222222222222', 50.00);

insert into public.order_items (order_id, product_id, shop_id, quantity, unit_price)
select
  '66666666-6666-6666-6666-666666666601',
  p.id,
  s.id,
  1,
  100.00
from public.shops s join public.products p on p.shop_id = s.id
where s.slug = 'kochi-mobile-world' limit 1;

do $$
declare n bigint;
begin
  select count(*) into n from public.order_items
  where order_id = '66666666-6666-6666-6666-666666666601';
  if n <> 1 then
    raise exception 'TEST SETUP FAILED: expected 1 seeded order_item, got % (did tests 01/02 run?)', n;
  end if;
end $$;

select 'seed ok (2 orders, 1 order_item):' as label, 'pass' as result;

-- ---------------------------------------------------------------------
-- A. Recursion regression: bare UPDATEs must not raise 42P17
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222'; -- customer1

do $$
declare
  completed boolean := false;
  caught_state text;
begin
  begin
    update public.orders
    set updated_at = now()
    where id = '66666666-6666-6666-6666-666666666601';
    completed := true;
  exception when others then
    caught_state := sqlstate;
  end;

  if not completed then
    raise exception 'TEST FAILED: bare UPDATE on orders raised % (42P17 = recursion regression)', caught_state;
  end if;
end $$;

select 'bare UPDATE on orders: no recursion error:' as label, 'pass' as result;

do $$
declare
  completed boolean := false;
  caught_state text;
begin
  begin
    update public.order_items
    set quantity = quantity
    where order_id = '66666666-6666-6666-6666-666666666601';
    completed := true;
  exception when others then
    caught_state := sqlstate;
  end;

  if not completed then
    raise exception 'TEST FAILED: bare UPDATE on order_items raised % (42P17 = recursion regression)', caught_state;
  end if;
end $$;

select 'bare UPDATE on order_items: no recursion error:' as label, 'pass' as result;

-- ---------------------------------------------------------------------
-- B. customer1 sees own orders + items, and helpers agree
-- ---------------------------------------------------------------------
do $$
declare n bigint;
begin
  select count(*) into n from public.orders
  where id in ('66666666-6666-6666-6666-666666666601',
               '66666666-6666-6666-6666-666666666602');
  if n <> 2 then
    raise exception 'TEST FAILED: customer1 should see 2 own orders, saw %', n;
  end if;

  select count(*) into n from public.order_items
  where order_id = '66666666-6666-6666-6666-666666666601';
  if n <> 1 then
    raise exception 'TEST FAILED: customer1 should see 1 item on own order, saw %', n;
  end if;

  if not public.order_owned_by_customer('66666666-6666-6666-6666-666666666601') then
    raise exception 'TEST FAILED: order_owned_by_customer false for own order';
  end if;
  if public.order_visible_to_merchant('66666666-6666-6666-6666-666666666601') then
    raise exception 'TEST FAILED: order_visible_to_merchant true for a non-merchant';
  end if;
end $$;

select 'customer1 sees own orders and items (expect 2 / 1):' as label, 'pass' as result;

-- ---------------------------------------------------------------------
-- C. customer2 sees nothing of customer1
-- ---------------------------------------------------------------------
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; -- customer2

do $$
declare n bigint;
begin
  select count(*) into n from public.orders
  where id in ('66666666-6666-6666-6666-666666666601',
               '66666666-6666-6666-6666-666666666602');
  if n <> 0 then
    raise exception 'TEST FAILED: customer2 saw % of customer1 orders', n;
  end if;

  select count(*) into n from public.order_items
  where order_id = '66666666-6666-6666-6666-666666666601';
  if n <> 0 then
    raise exception 'TEST FAILED: customer2 saw % of customer1 order_items', n;
  end if;

  if public.order_owned_by_customer('66666666-6666-6666-6666-666666666601') then
    raise exception 'TEST FAILED: order_owned_by_customer true for another customer';
  end if;
  if public.order_visible_to_merchant('66666666-6666-6666-6666-666666666601') then
    raise exception 'TEST FAILED: order_visible_to_merchant true for a non-merchant';
  end if;
end $$;

select 'customer2 sees no orders/items of customer1 (expect 0 / 0):' as label, 'pass' as result;

-- ---------------------------------------------------------------------
-- D. merchant1 sees only orders containing their shop's items
-- ---------------------------------------------------------------------
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; -- merchant1

do $$
declare n bigint;
begin
  select count(*) into n from public.orders
  where id = '66666666-6666-6666-6666-666666666601';
  if n <> 1 then
    raise exception 'TEST FAILED: merchant1 should see order 601 (has their item), saw %', n;
  end if;

  select count(*) into n from public.orders
  where id = '66666666-6666-6666-6666-666666666602';
  if n <> 0 then
    raise exception 'TEST FAILED: merchant1 saw order 602 (no items from their shop), saw %', n;
  end if;

  select count(*) into n from public.order_items
  where order_id = '66666666-6666-6666-6666-666666666601';
  if n <> 1 then
    raise exception 'TEST FAILED: merchant1 should see their line item, saw %', n;
  end if;

  if not public.order_visible_to_merchant('66666666-6666-6666-6666-666666666601') then
    raise exception 'TEST FAILED: order_visible_to_merchant false for order with own item';
  end if;
  if public.order_visible_to_merchant('66666666-6666-6666-6666-666666666602') then
    raise exception 'TEST FAILED: order_visible_to_merchant true for order with no items';
  end if;
end $$;

select 'merchant1 sees order 601 not 602, and own item (expect 1 / 0 / 1):' as label, 'pass' as result;

-- ---------------------------------------------------------------------
-- E. anon sees nothing (and EXECUTE grants let policies evaluate)
-- ---------------------------------------------------------------------
reset role;
reset request.jwt.claim.sub;
set role anon;

do $$
declare n bigint;
begin
  select count(*) into n from public.orders
  where id in ('66666666-6666-6666-6666-666666666601',
               '66666666-6666-6666-6666-666666666602');
  if n <> 0 then
    raise exception 'TEST FAILED: anon saw % orders', n;
  end if;

  select count(*) into n from public.order_items
  where order_id = '66666666-6666-6666-6666-666666666601';
  if n <> 0 then
    raise exception 'TEST FAILED: anon saw % order_items', n;
  end if;
end $$;

select 'anon sees no orders/items (expect 0 / 0):' as label, 'pass' as result;

reset role;

rollback;

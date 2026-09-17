-- 05_security_hardening.sql
-- Depends on tests 01 and 02 having run first (merchant, shop, product,
-- and test users already exist). Run in the same session/right after.
-- Customer isolation and role-escalation coverage remains in
-- 04_role_escalation_and_cart_isolation.sql.
-- This script is intentionally transactional and rolls back its test data.

begin;

-- ---------------------------------------------------------------------
-- Fix 1: merchant self-verification is blocked
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; -- merchant

-- Ordinary business-field update must still work.
update public.merchants
set contact_phone = '9000000000'
where business_name = 'Kochi Mobile World';

select 'merchant updated own phone (expect 9000000000):' as label, contact_phone
from public.merchants
where business_name = 'Kochi Mobile World';

-- Merchant cannot change verified.
do $$
declare
  completed boolean := false;
  caught_state text;
begin
  begin
    update public.merchants
    set verified = not verified
    where business_name = 'Kochi Mobile World';
    completed := true;
  exception when others then
    caught_state := sqlstate;
  end;

  if completed then
    raise exception 'TEST FAILED: merchant self-verification was not blocked';
  end if;
  if caught_state <> 'P0001' then
    raise exception 'TEST FAILED: expected P0001 for self-verification, got %', caught_state;
  end if;
end $$;

select 'merchant self-verification blocked (expect P0001):' as label, 'pass' as result;

-- Merchant cannot change is_demo.
do $$
declare
  completed boolean := false;
  caught_state text;
begin
  begin
    update public.merchants
    set is_demo = true
    where business_name = 'Kochi Mobile World';
    completed := true;
  exception when others then
    caught_state := sqlstate;
  end;

  if completed then
    raise exception 'TEST FAILED: merchant is_demo modification was not blocked';
  end if;
  if caught_state <> 'P0001' then
    raise exception 'TEST FAILED: expected P0001 for is_demo protection, got %', caught_state;
  end if;
end $$;

select 'merchant is_demo modification blocked (expect P0001):' as label, 'pass' as result;

reset role;
reset request.jwt.claim.sub;

-- Admin path: a trusted superuser action promotes customer2, then the
-- authenticated admin can change verification-controlled fields.
update public.profiles
set role = 'admin'
where id = '33333333-3333-3333-3333-333333333333';

set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; -- admin

update public.merchants
set verified = true,
    is_demo = true
where business_name = 'Kochi Mobile World';

select 'admin can modify verification fields (expect t/t):' as label,
       verified,
       is_demo
from public.merchants
where business_name = 'Kochi Mobile World';

reset role;
reset request.jwt.claim.sub;

-- ---------------------------------------------------------------------
-- Fix 2: direct customer order insertion and controlled updates blocked
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222'; -- customer1

-- No customer-facing INSERT policy exists. RLS must reject this directly.
do $$
declare
  completed boolean := false;
  caught_state text;
begin
  begin
    insert into public.orders (customer_id, total_amount)
    values ('22222222-2222-2222-2222-222222222222', 0.01);
    completed := true;
  exception when others then
    caught_state := sqlstate;
  end;

  if completed then
    raise exception 'TEST FAILED: customer was able to insert an order directly';
  end if;
  if caught_state <> '42501' then
    raise exception 'TEST FAILED: expected 42501 for direct order insert, got %', caught_state;
  end if;
end $$;

select 'direct customer order insert blocked (expect 42501):' as label, 'pass' as result;

-- Create an order in the trusted/superuser context so customer UPDATE
-- attempts can be checked without granting the customer an insert path.
reset role;
reset request.jwt.claim.sub;

insert into public.orders (id, customer_id, total_amount)
values (
  '44444444-4444-4444-4444-444444444444',
  '22222222-2222-2222-2222-222222222222',
  100.00
);

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222'; -- customer1

-- Customer cannot update total_amount.
do $$
declare
  completed boolean := false;
  caught_state text;
begin
  begin
    update public.orders
    set total_amount = 0.01
    where id = '44444444-4444-4444-4444-444444444444';
    completed := true;
  exception when others then
    caught_state := sqlstate;
  end;

  if completed then
    raise exception 'TEST FAILED: customer changed order total_amount';
  end if;
  if caught_state <> '42501' then
    raise exception 'TEST FAILED: expected 42501 for total_amount update, got %', caught_state;
  end if;
end $$;

-- Customer cannot update status.
do $$
declare
  completed boolean := false;
  caught_state text;
begin
  begin
    update public.orders
    set status = 'confirmed'
    where id = '44444444-4444-4444-4444-444444444444';
    completed := true;
  exception when others then
    caught_state := sqlstate;
  end;

  if completed then
    raise exception 'TEST FAILED: customer changed order status';
  end if;
  if caught_state <> '42501' then
    raise exception 'TEST FAILED: expected 42501 for status update, got %', caught_state;
  end if;
end $$;

-- Customer cannot update is_demo.
do $$
declare
  completed boolean := false;
  caught_state text;
begin
  begin
    update public.orders
    set is_demo = true
    where id = '44444444-4444-4444-4444-444444444444';
    completed := true;
  exception when others then
    caught_state := sqlstate;
  end;

  if completed then
    raise exception 'TEST FAILED: customer changed order is_demo';
  end if;
  if caught_state <> '42501' then
    raise exception 'TEST FAILED: expected 42501 for is_demo update, got %', caught_state;
  end if;
end $$;

reset role;
reset request.jwt.claim.sub;

-- ---------------------------------------------------------------------
-- Fix 3: product/variant integrity
-- ---------------------------------------------------------------------
-- Create a product with a variant and a decoy product with another
-- variant, to prove mismatched pairs are rejected in both item tables.
insert into public.products (
  id, shop_id, category_id, name, slug, brand, price, specifications
)
select
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  s.id,
  c.id,
  'Hardening Test Product A',
  'hardening-test-product-a',
  'TestBrand',
  100.00,
  '{"test": true}'::jsonb
from public.shops s
join public.categories c on c.slug = 'mobile-phones'
where s.slug = 'kochi-mobile-world';

insert into public.products (
  id, shop_id, category_id, name, slug, brand, price, specifications
)
select
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  s.id,
  c.id,
  'Hardening Test Product B',
  'hardening-test-product-b',
  'TestBrand',
  200.00,
  '{"test": true}'::jsonb
from public.shops s
join public.categories c on c.slug = 'mobile-phones'
where s.slug = 'kochi-mobile-world';

insert into public.product_variants (
  id, product_id, sku, storage, price
)
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'HARDEN-A-1',
    '128GB',
    110.00
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'HARDEN-A-2',
    '256GB',
    120.00
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'HARDEN-B-1',
    '128GB',
    210.00
  );

-- Customer1 owns an isolated cart for this test.
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

insert into public.carts (customer_id)
values ('22222222-2222-2222-2222-222222222222');

-- Correct product + correct variant succeeds.
insert into public.cart_items (cart_id, product_id, variant_id, quantity)
select c.id,
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001',
       1
from public.carts c
where c.customer_id = '22222222-2222-2222-2222-222222222222';

select 'correct product and variant accepted in cart_items:' as label, 'pass' as result;

-- Product A + Variant B is rejected by the composite foreign key.
do $$
declare
  completed boolean := false;
  caught_state text;
begin
  begin
    insert into public.cart_items (cart_id, product_id, variant_id, quantity)
    select c.id,
           'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
           'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001',
           1
    from public.carts c
    where c.customer_id = '22222222-2222-2222-2222-222222222222';
    completed := true;
  exception when others then
    caught_state := sqlstate;
  end;

  if completed then
    raise exception 'TEST FAILED: cart accepted a variant belonging to another product';
  end if;
  if caught_state <> '23503' then
    raise exception 'TEST FAILED: expected 23503 for cart variant mismatch, got %', caught_state;
  end if;
end $$;

select 'mismatched product and variant rejected in cart_items (expect 23503):' as label,
       'pass' as result;

-- Duplicate same-variant cart item is rejected.
do $$
declare
  completed boolean := false;
  caught_state text;
begin
  begin
    insert into public.cart_items (cart_id, product_id, variant_id, quantity)
    select c.id,
           'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
           'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001',
           1
    from public.carts c
    where c.customer_id = '22222222-2222-2222-2222-222222222222';
    completed := true;
  exception when others then
    caught_state := sqlstate;
  end;

  if completed then
    raise exception 'TEST FAILED: duplicate same-variant cart item was accepted';
  end if;
  if caught_state <> '23505' then
    raise exception 'TEST FAILED: expected 23505 for duplicate variant item, got %', caught_state;
  end if;
end $$;

select 'duplicate same-variant cart item rejected (expect 23505):' as label, 'pass' as result;

-- A different variant of the same product remains allowed.
insert into public.cart_items (cart_id, product_id, variant_id, quantity)
select c.id,
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002',
       1
from public.carts c
where c.customer_id = '22222222-2222-2222-2222-222222222222';

select 'different variants of one product remain allowed:' as label, 'pass' as result;

-- A non-variant product can be added once, but not duplicated.
insert into public.cart_items (cart_id, product_id, quantity)
select c.id,
       'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
       1
from public.carts c
where c.customer_id = '22222222-2222-2222-2222-222222222222';

do $$
declare
  completed boolean := false;
  caught_state text;
begin
  begin
    insert into public.cart_items (cart_id, product_id, quantity)
    select c.id,
           'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
           1
    from public.carts c
    where c.customer_id = '22222222-2222-2222-2222-222222222222';
    completed := true;
  exception when others then
    caught_state := sqlstate;
  end;

  if completed then
    raise exception 'TEST FAILED: duplicate non-variant cart item was accepted';
  end if;
  if caught_state <> '23505' then
    raise exception 'TEST FAILED: expected 23505 for duplicate non-variant item, got %', caught_state;
  end if;
end $$;

select 'duplicate non-variant cart item rejected (expect 23505):' as label, 'pass' as result;

reset role;
reset request.jwt.claim.sub;

-- ---------------------------------------------------------------------
-- Fix 4: order_items product/variant integrity
-- ---------------------------------------------------------------------
-- Create the order in a trusted context. The customer has no direct
-- order_items INSERT policy; this section isolates the FK behavior.
insert into public.orders (
  id, customer_id, status, total_amount, is_demo
)
values (
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  '22222222-2222-2222-2222-222222222222',
  'pending_confirmation',
  110.00,
  true
);

insert into public.order_items (
  order_id, product_id, variant_id, shop_id, quantity, unit_price
)
select
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001',
  s.id,
  1,
  110.00
from public.shops s
where s.slug = 'kochi-mobile-world';

select 'correct product and variant accepted in order_items:' as label, 'pass' as result;

do $$
declare
  completed boolean := false;
  caught_state text;
begin
  begin
    insert into public.order_items (
      order_id, product_id, variant_id, shop_id, quantity, unit_price
    )
    select
      'dddddddd-dddd-dddd-dddd-dddddddddddd',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001',
      s.id,
      1,
      110.00
    from public.shops s
    where s.slug = 'kochi-mobile-world';
    completed := true;
  exception when others then
    caught_state := sqlstate;
  end;

  if completed then
    raise exception 'TEST FAILED: order_items accepted a variant belonging to another product';
  end if;
  if caught_state <> '23503' then
    raise exception 'TEST FAILED: expected 23503 for order_items variant mismatch, got %', caught_state;
  end if;
end $$;

select 'mismatched product and variant rejected in order_items (expect 23503):' as label,
       'pass' as result;

rollback;

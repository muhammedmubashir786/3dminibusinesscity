-- 04a_role_escalation_and_cart_isolation_txn.sql
-- Same expectations as 04_role_escalation_and_cart_isolation.sql, but
-- runnable unattended (psql -v ON_ERROR_STOP=1): transactional, asserts
-- instead of relying on eyeballing, rolls back all data. 04 is untouched.
--
-- Expectations (unchanged from 04):
--   A. customer self-escalation to admin is rejected (42501), role stays customer
--   B. customer creates own cart + item -> sees 1 cart_item
--   C. another customer sees 0 of those cart_items
--   D. another customer inserting into that cart is rejected (42501), no row lands
--
-- Depends on tests 01 and 02 (users, verified shop, product 'Galaxy S24').
-- Customer2 = 33333333-..., customer1 = 22222222-...

begin;

-- Hermetic: clear carts left by earlier committed runs of 04 (rolled back below).
delete from public.carts
where customer_id in ('22222222-2222-2222-2222-222222222222',
                      '33333333-3333-3333-3333-333333333333');

-- ---------------------------------------------------------------------
-- A. Role self-escalation is rejected
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; -- customer2

do $$
declare
  completed boolean := false;
  caught_state text;
begin
  begin
    update public.profiles
    set role = 'admin'
    where id = '33333333-3333-3333-3333-333333333333';
    completed := true;
  exception when others then
    caught_state := sqlstate;
  end;

  if completed then
    raise exception 'TEST FAILED: customer self-escalation was not rejected';
  end if;
  if caught_state <> '42501' then
    raise exception 'TEST FAILED: expected 42501 for self-escalation, got %', caught_state;
  end if;
end $$;

reset role;
reset request.jwt.claim.sub;

do $$
declare r text;
begin
  select role::text into r from public.profiles
  where id = '33333333-3333-3333-3333-333333333333';
  if r <> 'customer' then
    raise exception 'TEST FAILED: customer2 role is % after escalation attempt', r;
  end if;
end $$;

select 'A. self-escalation rejected (42501), role stays customer:' as label, 'pass' as result;

-- ---------------------------------------------------------------------
-- B. Customer creates own cart + item
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; -- customer2

insert into public.carts (customer_id)
values ('33333333-3333-3333-3333-333333333333');

insert into public.cart_items (cart_id, product_id, quantity)
select c.id, p.id, 2
from public.carts c
join lateral (
  select id from public.products where name = 'Galaxy S24' limit 1
) p on true
where c.customer_id = '33333333-3333-3333-3333-333333333333';

do $$
declare n bigint;
begin
  select count(*) into n from public.cart_items;
  if n <> 1 then
    raise exception 'TEST FAILED: customer2 should see 1 own cart_item, saw % (is Galaxy S24 visible to customers?)', n;
  end if;
end $$;

select 'B. customer2 creates own cart + item, sees 1 (expect 1):' as label, 'pass' as result;

-- Trusted lookup of ids for test D (custom GUCs are readable by any role).
reset role;
reset request.jwt.claim.sub;
select set_config('test.c2_cart',
  (select id::text from public.carts
   where customer_id = '33333333-3333-3333-3333-333333333333'), false) is not null as cart_id_captured;
select set_config('test.product',
  (select id::text from public.products where name = 'Galaxy S24' limit 1), false) is not null as product_id_captured;

-- ---------------------------------------------------------------------
-- C. Cross-customer visibility
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222'; -- customer1

do $$
declare n bigint;
begin
  select count(*) into n from public.cart_items;
  if n <> 0 then
    raise exception 'TEST FAILED: customer1 saw % of customer2 cart_items', n;
  end if;
end $$;

select 'C. customer1 sees customer2 cart_items (expect 0):' as label, 'pass' as result;

-- ---------------------------------------------------------------------
-- D. Cross-customer insert is rejected
-- ---------------------------------------------------------------------
do $$
declare
  completed boolean := false;
  caught_state text;
begin
  begin
    insert into public.cart_items (cart_id, product_id, quantity)
    values (current_setting('test.c2_cart')::uuid,
            current_setting('test.product')::uuid,
            99);
    completed := true;
  exception when others then
    caught_state := sqlstate;
  end;

  if completed then
    raise exception 'TEST FAILED: customer1 inserted into customer2 cart';
  end if;
  if caught_state <> '42501' then
    raise exception 'TEST FAILED: expected 42501 for cross-customer insert, got %', caught_state;
  end if;
end $$;

reset role;
reset request.jwt.claim.sub;

do $$
declare n bigint;
begin
  select count(*) into n from public.cart_items where quantity = 99;
  if n <> 0 then
    raise exception 'TEST FAILED: % cross-customer rows landed in cart_items', n;
  end if;
end $$;

select 'D. cross-customer cart insert rejected (42501), no rows inserted:' as label, 'pass' as result;

rollback;
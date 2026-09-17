-- Test: can a customer promote themselves to admin via the update-own policy?
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

update public.profiles set role = 'admin' where id = '33333333-3333-3333-3333-333333333333';
select 'customer2 role after self-escalation attempt (expect customer):' as label, role
from public.profiles where id = '33333333-3333-3333-3333-333333333333';

-- Test: cart isolation. customer2 creates a cart + item.
insert into public.carts (customer_id) values ('33333333-3333-3333-3333-333333333333')
returning id;

insert into public.cart_items (cart_id, product_id, quantity)
select c.id, p.id, 2
from public.carts c, public.products p
where c.customer_id = '33333333-3333-3333-3333-333333333333'
  and p.name = 'Galaxy S24'
returning id, quantity;

select 'customer2 sees own cart_items (expect 1):' as label, count(*) from public.cart_items;

-- customer1 (different user) should see 0 cart_items — none of them are theirs.
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select 'customer1 sees customer2''s cart_items (expect 0):' as label, count(*) from public.cart_items;

-- customer1 tries to insert a cart_item directly into customer2's cart — should be rejected by RLS.
insert into public.cart_items (cart_id, product_id, quantity)
select c.id, p.id, 99
from public.carts c, public.products p
where c.customer_id = '33333333-3333-3333-3333-333333333333'
  and p.name = 'Galaxy S24';

reset role;

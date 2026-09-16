-- As an anonymous/no-jwt session (simulates the anon key with no logged-in user):
set role authenticated;
set request.jwt.claim.sub = '';

select 'anon sees products (expect 0, shop unverified):' as label, count(*) from public.products;

-- As customer2 (unrelated user), still expect 0 — not owner, shop unverified.
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select 'customer2 sees products (expect 0):' as label, count(*) from public.products;

-- As the owning merchant, expect 1 (their own product, regardless of verification).
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select 'merchant sees own products (expect 1):' as label, count(*) from public.products;

reset role;

-- Now verify the merchant (as postgres/superuser, simulating an admin action)
update public.merchants set verified = true where business_name = 'Kochi Mobile World';

set role authenticated;
set request.jwt.claim.sub = '';
select 'anon sees products AFTER verification (expect 1):' as label, count(*) from public.products;

set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select 'customer2 sees products AFTER verification (expect 1):' as label, count(*) from public.products;
reset role;

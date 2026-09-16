-- Run this AS the merchant user to create their business data.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into public.merchants (profile_id, business_name, contact_phone)
values ('11111111-1111-1111-1111-111111111111', 'Kochi Mobile World', '9876543210')
returning id, verified;

-- Merchant creates a shop under their own (as yet unverified) merchant record.
insert into public.shops (merchant_id, name, slug, address)
select id, 'Kochi Mobile World', 'kochi-mobile-world', 'MG Road, Kochi'
from public.merchants where business_name = 'Kochi Mobile World'
returning id, is_active;

insert into public.products (shop_id, category_id, name, slug, brand, price, specifications)
select s.id, c.id, 'Galaxy S24', 'galaxy-s24', 'Samsung', 54999.00, '{"ram":"8GB","storage":"256GB"}'::jsonb
from public.shops s, public.categories c
where s.slug = 'kochi-mobile-world' and c.slug = 'mobile-phones'
returning id, name;

reset role;

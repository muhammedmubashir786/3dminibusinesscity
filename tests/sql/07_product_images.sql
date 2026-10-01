-- 07_product_images.sql
-- Depends on tests 01 and 02 having run first (test users, merchant, shop and
-- the Galaxy S24 product exist). Does NOT depend on 03: it verifies the
-- merchant itself, inside the transaction.
-- Transactional: everything is rolled back at the end.
-- Prints one NOTICE per assertion starting with PASS or FAIL, plus
-- "label (expect N): count" rows for visibility checks.
-- Needs psql (or any client that shows NOTICE output).

begin;

select set_config(
  't07.pid',
  (select id::text from public.products where slug = 'galaxy-s24'),
  true
) as galaxy_s24_product_id;

-- ---------------------------------------------------------------------
-- Setup (as postgres): verify the merchant, add two images.
-- request.jwt.claim.sub must be cleared first (see note in 03).
-- ---------------------------------------------------------------------
reset role;
set request.jwt.claim.sub = '';

update public.merchants set verified = true
where business_name = 'Kochi Mobile World';

insert into public.product_images (id, product_id, storage_path, alt_text, position, is_primary)
values
  ('70000000-0000-0000-0000-000000000001', current_setting('t07.pid')::uuid,
   current_setting('t07.pid') || '/front.webp', 'Front', 0, true),
  ('70000000-0000-0000-0000-000000000002', current_setting('t07.pid')::uuid,
   current_setting('t07.pid') || '/back.webp', 'Back', 1, false);

-- ---------------------------------------------------------------------
-- 1. Visibility: visible product (verified merchant, active shop)
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '';
select 'anon sees images, visible product (expect 2):' as label, count(*) from public.product_images;

set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select 'customer2 sees images, visible product (expect 2):' as label, count(*) from public.product_images;

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select 'owner sees own images (expect 2):' as label, count(*) from public.product_images;
reset role;

-- ---------------------------------------------------------------------
-- 2. Visibility: hidden when the shop is inactive
-- ---------------------------------------------------------------------
set request.jwt.claim.sub = '';
update public.shops set is_active = false where slug = 'kochi-mobile-world';

set role authenticated;
set request.jwt.claim.sub = '';
select 'anon, INACTIVE shop (expect 0):' as label, count(*) from public.product_images;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select 'customer2, INACTIVE shop (expect 0):' as label, count(*) from public.product_images;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select 'owner, INACTIVE shop (expect 2):' as label, count(*) from public.product_images;
reset role;
set request.jwt.claim.sub = '';
update public.shops set is_active = true where slug = 'kochi-mobile-world';

-- ---------------------------------------------------------------------
-- 3. Visibility: hidden when the product is soft-deleted
-- ---------------------------------------------------------------------
update public.products set deleted_at = now() where slug = 'galaxy-s24';

set role authenticated;
set request.jwt.claim.sub = '';
select 'anon, DELETED product (expect 0):' as label, count(*) from public.product_images;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select 'owner, DELETED product (expect 2):' as label, count(*) from public.product_images;
reset role;
set request.jwt.claim.sub = '';
update public.products set deleted_at = null where slug = 'galaxy-s24';

-- ---------------------------------------------------------------------
-- 4. Visibility: hidden when the merchant is not verified
-- ---------------------------------------------------------------------
update public.merchants set verified = false where business_name = 'Kochi Mobile World';

set role authenticated;
set request.jwt.claim.sub = '';
select 'anon, UNVERIFIED merchant (expect 0):' as label, count(*) from public.product_images;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select 'owner, UNVERIFIED merchant (expect 2):' as label, count(*) from public.product_images;
reset role;
set request.jwt.claim.sub = '';
update public.merchants set verified = true where business_name = 'Kochi Mobile World';

-- ---------------------------------------------------------------------
-- 5. Table constraints (as postgres)
-- ---------------------------------------------------------------------
do $$
declare st text := null;
begin
  begin
    insert into public.product_images (product_id, storage_path)
    values (current_setting('t07.pid')::uuid, '99999999-9999-9999-9999-999999999999/x.webp');
  exception when others then st := sqlstate;
  end;
  raise notice '%: path must start with product_id (expect 23514, got %)',
    case when st = '23514' then 'PASS' else 'FAIL' end, st;
end $$;

do $$
declare st text := null;
begin
  begin
    insert into public.product_images (product_id, storage_path, position, is_primary)
    values (current_setting('t07.pid')::uuid, current_setting('t07.pid') || '/second-primary.webp', 5, true);
  exception when others then st := sqlstate;
  end;
  raise notice '%: second primary image rejected (expect 23505, got %)',
    case when st = '23505' then 'PASS' else 'FAIL' end, st;
end $$;

do $$
declare st text := null;
begin
  begin
    insert into public.product_images (product_id, storage_path, position)
    values (current_setting('t07.pid')::uuid, current_setting('t07.pid') || '/front.webp', 7);
  exception when others then st := sqlstate;
  end;
  raise notice '%: duplicate storage_path rejected (expect 23505, got %)',
    case when st = '23505' then 'PASS' else 'FAIL' end, st;
end $$;

do $$
declare st text := null;
begin
  begin
    set constraints product_images_product_position_unique immediate;
    insert into public.product_images (product_id, storage_path, position)
    values (current_setting('t07.pid')::uuid, current_setting('t07.pid') || '/dup-pos.webp', 1);
  exception when others then st := sqlstate;
  end;
  set constraints product_images_product_position_unique deferred;
  raise notice '%: duplicate (product, position) rejected (expect 23505, got %)',
    case when st = '23505' then 'PASS' else 'FAIL' end, st;
end $$;

do $$
declare st text := null;
begin
  begin
    insert into public.product_images (product_id, storage_path, position)
    values (current_setting('t07.pid')::uuid, current_setting('t07.pid') || '/neg.webp', -1);
  exception when others then st := sqlstate;
  end;
  raise notice '%: negative position rejected (expect 23514, got %)',
    case when st = '23514' then 'PASS' else 'FAIL' end, st;
end $$;

-- Reordering: swapping two positions must work (constraint is deferrable).
do $$
declare st text := null;
begin
  begin
    update public.product_images set position = 1 where id = '70000000-0000-0000-0000-000000000001';
    update public.product_images set position = 0 where id = '70000000-0000-0000-0000-000000000002';
    set constraints product_images_product_position_unique immediate;
  exception when others then st := sqlstate;
  end;
  set constraints product_images_product_position_unique deferred;
  raise notice '%: swapping positions inside one transaction works (got %)',
    case when st is null then 'PASS' else 'FAIL' end, coalesce(st, 'no error');
end $$;

-- ---------------------------------------------------------------------
-- 6. Write policies
-- ---------------------------------------------------------------------
-- A second merchant with their own (unverified) shop and product.
insert into public.merchants (id, profile_id, business_name, contact_phone)
values ('80000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'Other Merchant', '9000000001');

insert into public.shops (id, merchant_id, name, slug, address)
values ('80000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000001', 'Other Shop', 'other-shop', 'Elsewhere');

insert into public.products (id, shop_id, category_id, name, slug, price)
select '80000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000002', c.id, 'Other Product', 'other-product', 100
from public.categories c where c.slug = 'mobile-phones';

insert into public.product_images (id, product_id, storage_path, position, is_primary)
values ('70000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000003',
        '80000000-0000-0000-0000-000000000003/only.webp', 0, true);

-- Anonymous-like session cannot insert.
set role authenticated;
set request.jwt.claim.sub = '';
do $$
declare st text := null;
begin
  begin
    insert into public.product_images (product_id, storage_path, position)
    values (current_setting('t07.pid')::uuid, current_setting('t07.pid') || '/anon.webp', 9);
  exception when others then st := sqlstate;
  end;
  raise notice '%: anonymous insert blocked (expect 42501, got %)',
    case when st = '42501' then 'PASS' else 'FAIL' end, st;
end $$;

-- Unrelated customer cannot insert on someone else's product.
reset role;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare st text := null;
begin
  begin
    insert into public.product_images (product_id, storage_path, position)
    values (current_setting('t07.pid')::uuid, current_setting('t07.pid') || '/c1.webp', 9);
  exception when others then st := sqlstate;
  end;
  raise notice '%: unrelated customer insert blocked (expect 42501, got %)',
    case when st = '42501' then 'PASS' else 'FAIL' end, st;
end $$;

-- Another merchant cannot insert/update/delete on merchant1's product.
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
declare st text := null; n int;
begin
  begin
    insert into public.product_images (product_id, storage_path, position)
    values (current_setting('t07.pid')::uuid, current_setting('t07.pid') || '/other.webp', 9);
  exception when others then st := sqlstate;
  end;
  raise notice '%: other merchant insert on foreign product blocked (expect 42501, got %)',
    case when st = '42501' then 'PASS' else 'FAIL' end, st;

  update public.product_images set alt_text = 'hijack'
  where id = '70000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  raise notice '%: other merchant update on foreign image affects 0 rows (got %)',
    case when n = 0 then 'PASS' else 'FAIL' end, n;

  delete from public.product_images where id = '70000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  raise notice '%: other merchant delete on foreign image affects 0 rows (got %)',
    case when n = 0 then 'PASS' else 'FAIL' end, n;
end $$;

-- Owner can insert, update and delete on their own product.
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare st text := null; n int;
begin
  begin
    insert into public.product_images (id, product_id, storage_path, alt_text, position)
    values ('70000000-0000-0000-0000-000000000004', current_setting('t07.pid')::uuid,
            current_setting('t07.pid') || '/owner.webp', 'Owner added', 2);
  exception when others then st := sqlstate;
  end;
  raise notice '%: owner insert on own product allowed (got %)',
    case when st is null then 'PASS' else 'FAIL' end, coalesce(st, 'no error');

  update public.product_images set alt_text = 'Owner edited'
  where id = '70000000-0000-0000-0000-000000000004';
  get diagnostics n = row_count;
  raise notice '%: owner update on own image affects 1 row (got %)',
    case when n = 1 then 'PASS' else 'FAIL' end, n;

  delete from public.product_images where id = '70000000-0000-0000-0000-000000000004';
  get diagnostics n = row_count;
  raise notice '%: owner delete on own image affects 1 row (got %)',
    case when n = 1 then 'PASS' else 'FAIL' end, n;

  st := null;
  begin
    insert into public.product_images (product_id, storage_path, position)
    values ('80000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000003/stolen.webp', 9);
  exception when others then st := sqlstate;
  end;
  raise notice '%: owner insert on ANOTHER merchant''s product blocked (expect 42501, got %)',
    case when st = '42501' then 'PASS' else 'FAIL' end, st;
end $$;
reset role;
set request.jwt.claim.sub = '';

-- ---------------------------------------------------------------------
-- 7. Cascade: deleting a product removes its image rows
-- ---------------------------------------------------------------------
delete from public.products where id = '80000000-0000-0000-0000-000000000003';
select 'images left for deleted product (expect 0):' as label, count(*)
from public.product_images where product_id = '80000000-0000-0000-0000-000000000003';

-- A product with no images is still a normal product.
select 'galaxy-s24 still readable via products (expect 1):' as label, count(*)
from public.products where slug = 'galaxy-s24';

-- ---------------------------------------------------------------------
-- 8. Storage bucket
-- ---------------------------------------------------------------------
select 'bucket product-images (expect public=t, 5242880, {image/jpeg,image/png,image/webp}):' as label,
       public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'product-images';

rollback;

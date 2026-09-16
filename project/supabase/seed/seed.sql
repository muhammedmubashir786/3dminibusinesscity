-- seed.sql
-- Phase 1 — Virtual Angadi. NOT APPLIED — draft for review.
-- Categories are the ONLY seed data that ships to production as-is.
-- The demo merchant/shop/product block below is for local dev only and
-- must never be run against a production database — it exists so the
-- Phase 1 UI has something real to render before actual merchants exist,
-- and every row is flagged is_demo = true so the UI shows "DEMO DATA".

insert into public.categories (name, slug) values
  ('Mobile Phones', 'mobile-phones'),
  ('Laptops', 'laptops'),
  ('Tablets', 'tablets'),
  ('Smartwatches', 'smartwatches'),
  ('Mobile Accessories', 'mobile-accessories'),
  ('Computer Accessories', 'computer-accessories'),
  ('Headphones / Earphones', 'headphones-earphones'),
  ('TVs', 'tvs'),
  ('Cameras', 'cameras'),
  ('Other Electronics', 'other-electronics');

-- ---------------------------------------------------------------------
-- DEMO DATA BLOCK — local development only. Do not run in production.
-- ---------------------------------------------------------------------
-- Requires a real auth.users row to attach a profile to; in local dev,
-- create a test user via Supabase Studio first and substitute its id
-- below before running this block.
--
-- insert into public.merchants (profile_id, business_name, contact_phone, verified, is_demo)
-- values ('00000000-0000-0000-0000-000000000000', 'Demo Electronics Kochi', '9999999999', true, true);
--
-- insert into public.shops (merchant_id, name, slug, address, city, is_demo)
-- select id, 'Demo Electronics Kochi', 'demo-electronics-kochi', 'MG Road, Kochi', 'Kochi', true
-- from public.merchants where business_name = 'Demo Electronics Kochi';
--
-- insert into public.products (shop_id, category_id, name, slug, brand, price, specifications, is_demo)
-- select s.id, c.id, 'Demo Phone X', 'demo-phone-x', 'DemoBrand', 14999.00,
--        '{"ram": "8GB", "storage": "128GB"}'::jsonb, true
-- from public.shops s, public.categories c
-- where s.slug = 'demo-electronics-kochi' and c.slug = 'mobile-phones';

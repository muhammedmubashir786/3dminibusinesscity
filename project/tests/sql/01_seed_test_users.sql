-- Local-only RLS functional test. Not part of the shipped migration set.

create role authenticated nologin noinherit;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

-- Seed two auth users: one merchant owner, one plain customer.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'merchant1@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'customer1@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'customer2@test.local')
returning id, email;

-- Profiles are auto-created by the trigger; promote one to merchant.
update public.profiles set role = 'merchant' where id = '11111111-1111-1111-1111-111111111111';

select id, role from public.profiles order by role;

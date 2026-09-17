-- 0001_profiles_and_roles.sql
-- Phase 1 — Virtual Angadi
-- NOT APPLIED. Draft for human review only. Do not run against any
-- database until approved per DECISIONS.md.

create type public.app_role as enum ('customer', 'merchant', 'admin');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'customer',
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per auth.users entry. Role is set here, never trusted from the client.';

-- Auto-create a profile row when a new auth user signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- updated_at maintenance, reused by every table below.
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- Helper: checks the caller's role via a SECURITY DEFINER function so that
-- role-checking policies never re-trigger RLS on profiles (which would
-- otherwise recurse). This function is the ONLY place that reads
-- profiles.role for policy purposes.
create function public.current_user_role()
returns public.app_role
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- RLS
alter table public.profiles enable row level security;

-- A user can read only their own profile.
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- Admins can read every profile (needed for merchant verification later).
create policy "profiles_select_admin"
  on public.profiles for select
  using (public.current_user_role() = 'admin');

-- A user can update their own name/phone but cannot change their own role —
-- role is pinned to its existing value by the WITH CHECK clause. Role
-- changes happen through a separate admin-only path (Phase 2+), never
-- through this customer-facing update.
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id and role = public.current_user_role());

-- Stub of Supabase's auth schema, for local testing of migrations only.
-- Not part of the actual migration set — Supabase provides the real
-- auth schema in production; this exists purely so we can run our SQL
-- against real Postgres and catch real errors before you see the files.

create schema if not exists auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

-- In production, auth.uid() reads the JWT claim of the requesting user.
-- For local testing we fake it with a settable session variable.
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create extension if not exists pgcrypto;

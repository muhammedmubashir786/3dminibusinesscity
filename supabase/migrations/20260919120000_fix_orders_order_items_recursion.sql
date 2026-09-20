-- 20260919120000_fix_orders_order_items_recursion.sql
-- Fixes 42P17 infinite recursion between:
--   orders.orders_select_merchant        -> queries order_items
--   order_items.order_items_select_customer -> queries orders
-- Breaks the cycle with SECURITY DEFINER helpers (bypass RLS on the inner lookup).

create or replace function public.order_visible_to_merchant(target_order_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.order_items oi
    join public.shops s on s.id = oi.shop_id
    where oi.order_id = target_order_id
      and public.owns_merchant(s.merchant_id)
  );
$$;

create or replace function public.order_owned_by_customer(target_order_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.orders o
    where o.id = target_order_id
      and o.customer_id = auth.uid()
  );
$$;

-- Policies call these as the invoking role, so anon/authenticated need EXECUTE
-- (otherwise anon SELECTs error instead of returning 0 rows).
revoke all on function public.order_visible_to_merchant(uuid) from public;
revoke all on function public.order_owned_by_customer(uuid) from public;
grant execute on function public.order_visible_to_merchant(uuid) to anon, authenticated;
grant execute on function public.order_owned_by_customer(uuid) to anon, authenticated;

drop policy if exists "orders_select_merchant" on public.orders;
create policy "orders_select_merchant"
  on public.orders for select
  using (public.order_visible_to_merchant(id));

drop policy if exists "order_items_select_customer" on public.order_items;
create policy "order_items_select_customer"
  on public.order_items for select
  using (public.order_owned_by_customer(order_id));
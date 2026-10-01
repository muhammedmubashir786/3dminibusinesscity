-- Phase 3.2a — Product images: metadata table + public Storage bucket.
--
-- Design (approved):
--   * One row per image; many images per product; products with no rows keep
--     working (the UI falls back to a placeholder).
--   * We store the object PATH, not a URL, so local and cloud both work.
--   * Object path convention: {product_id}/{image_id}.{ext} inside the
--     `product-images` bucket. The path-prefix check below ties every row to
--     its product.
--   * The bucket is PUBLIC (objects are fetchable by URL, CDN-cacheable).
--     Visibility of the metadata rows (and so discoverability of the paths)
--     is gated by RLS below; paths contain two UUIDs and are not guessable.
--     Residual risk, accepted: a leaked URL stays fetchable after a product
--     is hidden. Revisit with a private bucket + signed URLs if that matters.
--   * No storage.objects write policies here: client uploads are denied by
--     default until the merchant upload phase adds them.

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  storage_path text not null,
  alt_text text,
  position integer not null default 0 check (position >= 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_images_storage_path_unique unique (storage_path),
  constraint product_images_path_matches_product
    check (storage_path like product_id::text || '/%'),
  -- Deferrable so a later reorder can swap positions inside one transaction.
  constraint product_images_product_position_unique
    unique (product_id, position) deferrable initially deferred
);

comment on table public.product_images is
  'Images for a product. storage_path is the object key inside the product-images bucket ({product_id}/{image_id}.{ext}). At most one primary image per product (partial unique index); "exactly one primary" is not enforced — readers use the primary, else the lowest position. A product with no rows is valid.';

-- At most one primary image per product.
create unique index product_images_one_primary_idx
  on public.product_images (product_id)
  where is_primary;

create trigger set_product_images_updated_at
  before update on public.product_images
  for each row execute procedure public.set_updated_at();

-- RLS: same visibility rules as the parent product (mirrors variants_*).
alter table public.product_images enable row level security;

create policy "product_images_select_public"
  on public.product_images for select
  using (
    exists (
      select 1 from public.products p
      where p.id = product_images.product_id
        and p.deleted_at is null
        and exists (
          select 1 from public.shops s
          where s.id = p.shop_id
            and s.is_active and s.deleted_at is null
            and public.merchant_is_verified(s.merchant_id)
        )
    )
  );

create policy "product_images_manage_own"
  on public.product_images for all
  using (public.owns_product(product_id))
  with check (public.owns_product(product_id));

create policy "product_images_all_admin"
  on public.product_images for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- Storage: public bucket for product images. Created here so local and cloud
-- stay reproducible. Size and type limits are enforced by Storage itself.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

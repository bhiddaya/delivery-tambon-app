
-- Add photo support to menu_items
alter table public.menu_items add column if not exists photo_url text;

-- Staging table for "product name/price sent, waiting for photo" flow from LINE chat
create table if not exists public.pending_menu_items (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null,
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  name text not null,
  price numeric not null check (price >= 0),
  created_at timestamptz not null default now()
);

alter table public.pending_menu_items enable row level security;
-- No public policies: only the service role (used by n8n) can read/write this table.
-- This matches the pattern used elsewhere in this project for internal/staging data.

comment on table public.pending_menu_items is 'Temporary staging row created when a merchant sends product name+price via LINE chat, before they send the product photo. Deleted once the photo arrives and the real menu_items row is created.';

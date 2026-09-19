-- Shopify offline token: service-role only; no authenticated/anon policies.
create table if not exists public.shopify_credentials (
  id text primary key default 'primary' check (id = 'primary'),
  access_token text not null,
  scopes text,
  updated_at timestamptz not null default now()
);
alter table public.shopify_credentials enable row level security;
revoke all on public.shopify_credentials from anon, authenticated;

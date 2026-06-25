-- Sla het Shopify access token op per shop. Eén rij per shop URL.
create table if not exists public.shopify_tokens (
  shop text primary key,
  access_token text not null,
  scope text,
  installed_at timestamptz not null default now(),
  last_synced_to timestamptz
);

-- Voor bestaande tabel: kolom toevoegen als deze nog niet bestaat
alter table public.shopify_tokens
  add column if not exists last_synced_to timestamptz;

-- Geen RLS, alleen service role mag lezen/schrijven (vanuit Netlify Functions).
alter table public.shopify_tokens enable row level security;
-- Geen policies = anon/authenticated krijgt geen toegang, alleen service_role kan het lezen.

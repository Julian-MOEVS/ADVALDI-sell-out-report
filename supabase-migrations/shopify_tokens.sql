-- Sla het Shopify access token op per shop. Eén rij per shop URL.
create table if not exists public.shopify_tokens (
  shop text primary key,
  access_token text not null,
  scope text,
  installed_at timestamptz not null default now()
);

-- Geen RLS, alleen service role mag lezen/schrijven (vanuit Netlify Functions).
alter table public.shopify_tokens enable row level security;
-- Geen policies = anon/authenticated krijgt geen toegang, alleen service_role kan het lezen.

-- Sluit publieke (anon) toegang tot deze tabellen volledig af.
-- Achtergrond: deze tabellen hadden permissieve policies (USING/WITH CHECK true)
-- die de anon-rol volledige lees/schrijftoegang gaven, ongeacht het dashboard-wachtwoord.
-- Na de code-migratie (netlify/functions/data-rows.mts, catalog.mts, product-links.mts,
-- catalog-aliases.mts, imports.mts) lopen alle lees/schrijfacties server-side via de
-- service-role key, dus anon heeft hier niets meer te zoeken.
--
-- BELANGRIJK: pas draaien nadat de nieuwe Netlify Functions live staan en getest zijn.
-- Hiervoor breekt de site direct (anon verliest alle toegang tot deze tabellen).

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('sell_out_data', 'catalog_aliases', 'imports', 'product_catalog', 'product_links')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- RLS moet aanstaan (was het al, dit is voor de zekerheid, zelfde patroon als shopify_tokens)
ALTER TABLE public.sell_out_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_links ENABLE ROW LEVEL SECURITY;

-- Verificatie: dit moet leeg zijn na het draaien van bovenstaande.
SELECT tablename, policyname FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('sell_out_data', 'catalog_aliases', 'imports', 'product_catalog', 'product_links');

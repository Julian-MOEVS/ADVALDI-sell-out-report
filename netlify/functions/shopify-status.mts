import type { Context } from '@netlify/functions';
import { isAuthorized, unauthorized } from '../shared/auth.mts';
import { serviceClient, SHOPIFY_API_VERSION as API_VERSION } from '../shared/shopify.mts';

type ProbeResult = { tokenValid: boolean | null; tokenError?: string };

/**
 * Controleert of het opgeslagen access token bij Shopify nog geldig is.
 * Een rij in `shopify_tokens` zegt namelijk NIETS over of het token nog leeft:
 * bij het verwijderen van de app uit de winkel trekt Shopify het token in,
 * terwijl de rij blijft staan. Zonder deze probe meldde het dashboard
 * "verbonden" tot de eerste sync mislukte.
 *
 * `{ shop { name } }` is de goedkoopste query en vereist geen extra scope.
 * `tokenValid: null` = niet vast te stellen (netwerkfout aan onze kant),
 * bewust onderscheiden van een hard `false` zodat de UI niet onterecht
 * "opnieuw installeren" roept bij een tijdelijke storing.
 */
async function probeToken(shop: string, token: string): Promise<ProbeResult> {
  let res: Response;
  try {
    res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-shopify-access-token': token },
      body: JSON.stringify({ query: '{ shop { name } }' }),
    });
  } catch (e) {
    return {
      tokenValid: null,
      tokenError: `Shopify was niet bereikbaar: ${e instanceof Error ? e.message : 'netwerkfout'}.`,
    };
  }

  if (res.status === 401 || res.status === 403) {
    return {
      tokenValid: false,
      tokenError:
        'Shopify weigert het opgeslagen token. Dit gebeurt vrijwel altijd doordat de app uit de winkel is verwijderd, waardoor Shopify het token intrekt. De app moet opnieuw geïnstalleerd worden via de Partners install-link.',
    };
  }
  if (res.status === 402 || res.status === 423) {
    return {
      tokenValid: false,
      tokenError: `De Shopify-winkel is niet actief (HTTP ${res.status}: bevroren of vergrendeld). Synchroniseren lukt pas als de winkel weer open is.`,
    };
  }
  if (res.status === 404) {
    return {
      tokenValid: false,
      tokenError: `De winkel ${shop} bestaat niet meer of is van domein gewisseld (HTTP 404).`,
    };
  }
  if (!res.ok) {
    return { tokenValid: null, tokenError: `Onverwachte reactie van Shopify (HTTP ${res.status}).` };
  }

  // 200 met een `errors`-body betekent dat het token wel leeft maar de query
  // is geweigerd, bijvoorbeeld bij een scope-probleem. Dan is de koppeling
  // technisch in orde, dus geen alarm.
  const body = (await res.json().catch(() => null)) as { data?: { shop?: { name?: string } }; errors?: unknown } | null;
  if (body?.errors) {
    return { tokenValid: true, tokenError: 'Token werkt, maar Shopify gaf een GraphQL-waarschuwing terug.' };
  }
  return { tokenValid: true };
}

/**
 * GET /api/shopify-status
 * Returnt per gekoppelde winkel: shop URL, scopes, moment van laatste sync en
 * of het token bij Shopify nog echt geldig is (`{ shops: [...] }`).
 * Wordt gebruikt door de Shopify-pagina om per winkel de "Auto Sync (sinds
 * laatste sync)" knop en de verbindingsstatus te tonen. Een winkel die niet in
 * de lijst staat is nooit gekoppeld (of de koppeling is verwijderd).
 */
export default async (req: Request, _ctx: Context) => {
  if (!isAuthorized(req)) return unauthorized();

  const supabase = serviceClient();
  if (!supabase) {
    return new Response(
      JSON.stringify({ error: 'Server is niet correct geconfigureerd (SUPABASE_SERVICE_ROLE_KEY ontbreekt).' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }

  const { data, error } = await supabase
    .from('shopify_tokens')
    .select('shop, scope, installed_at, last_synced_to, access_token')
    .order('shop');

  if (error) {
    return new Response(
      JSON.stringify({ error: 'Kon shop status niet ophalen', detail: error.message }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }

  // Het token zelf gaat NOOIT mee de browser in; alleen het oordeel erover.
  const shops = await Promise.all(
    (data ?? []).map(async (row) => {
      const probe = await probeToken(row.shop, row.access_token);
      return {
        connected: true,
        shop: row.shop,
        scope: row.scope,
        installedAt: row.installed_at,
        lastSyncedTo: row.last_synced_to,
        tokenValid: probe.tokenValid,
        tokenError: probe.tokenError,
      };
    })
  );

  return new Response(JSON.stringify({ shops }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

export const config = {
  path: '/api/shopify-status',
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] as const },
};

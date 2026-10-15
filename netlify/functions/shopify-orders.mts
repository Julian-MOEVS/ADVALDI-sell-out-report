import type { Context } from '@netlify/functions';
import { isAuthorized, unauthorized } from '../shared/auth.mts';
import { serviceClient, isShopDomain, getShopToken, SHOPIFY_API_VERSION } from '../shared/shopify.mts';

interface LineItem {
  order_id: string;
  order_number: string;
  created_at: string;
  sku: string;
  name: string;
  vendor: string;
  barcode: string;
  quantity: number;
}

interface ShopifyOrderEdge {
  node: {
    id: string;
    name: string;
    createdAt: string;
    lineItems: {
      pageInfo: { hasNextPage: boolean; endCursor: string };
      edges: { node: ShopifyLineItem }[];
    };
  };
}

interface ShopifyLineItem {
  sku: string | null;
  name: string | null;
  quantity: number;
  vendor: string | null;
  variant: { barcode: string | null } | null;
}

export default async (req: Request, _ctx: Context) => {
  if (!isAuthorized(req)) return unauthorized();

  const supabase = serviceClient();
  if (!supabase) {
    return new Response(
      JSON.stringify({ error: 'Server is niet correct geconfigureerd (SUPABASE_SERVICE_ROLE_KEY ontbreekt).' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }

  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const shopParam = url.searchParams.get('shop');

  if (shopParam && !isShopDomain(shopParam)) {
    return new Response(
      JSON.stringify({ error: 'Ongeldige shop-parameter.' }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    );
  }

  // Welke winkel: expliciet via `shop`, of de enige gekoppelde winkel. Met
  // meerdere winkels (Pure, NAVEE) is `shop` verplicht: zonder sortering gaf
  // `.limit(1)` een willekeurige winkel terug, en die orders zouden onder het
  // verkeerde kanaal belanden.
  let shop = shopParam;
  if (!shop) {
    const { data: rows, error: rowsErr } = await supabase.from('shopify_tokens').select('shop').order('shop');
    if (rowsErr) {
      return new Response(
        JSON.stringify({ error: 'Kon Shopify token niet ophalen', detail: rowsErr.message }),
        { status: 500, headers: { 'content-type': 'application/json' } }
      );
    }
    if (!rows || rows.length !== 1) {
      return new Response(
        JSON.stringify({ error: 'Geef met de parameter "shop" aan welke winkel gesynchroniseerd moet worden.' }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      );
    }
    shop = rows[0].shop as string;
  }

  // Opgeslagen token (OAuth) of, als dat ontbreekt, een client-credentials-token.
  const initial = await getShopToken(supabase, shop);
  if (!initial.token) {
    return new Response(
      JSON.stringify({
        error: `Geen Shopify-koppeling voor ${shop}. Installeer de app in die winkel.${initial.error ? ` ${initial.error}` : ''}`,
      }),
      { status: 404, headers: { 'content-type': 'application/json' } }
    );
  }
  let token: string = initial.token;
  let refreshed = false;

  if (!from) {
    return new Response(
      JSON.stringify({ error: 'Query parameter "from" (YYYY-MM-DD) is verplicht' }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    );
  }

  const filterParts = [`created_at:>=${from}`];
  if (to) filterParts.push(`created_at:<=${to}`);
  const queryFilter = filterParts.join(' ');

  const apiUrl = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  const items: LineItem[] = [];
  let cursor: string | null = null;

  const graphqlQuery = `
    query($cursor: String, $query: String!) {
      orders(first: 100, after: $cursor, query: $query, sortKey: CREATED_AT) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            name
            createdAt
            lineItems(first: 250) {
              pageInfo { hasNextPage endCursor }
              edges {
                node {
                  sku
                  name
                  quantity
                  vendor
                  variant { barcode }
                }
              }
            }
          }
        }
      }
    }
  `;

  // Voor orders met >250 regels: secondaire query om de rest op te halen
  const lineItemsQuery = `
    query($orderId: ID!, $cursor: String!) {
      order(id: $orderId) {
        lineItems(first: 250, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              sku
              name
              quantity
              vendor
              variant { barcode }
            }
          }
        }
      }
    }
  `;

  async function fetchRemainingLineItems(orderId: string, startCursor: string): Promise<ShopifyLineItem[]> {
    const extra: ShopifyLineItem[] = [];
    let liCursor: string | null = startCursor;
    while (liCursor) {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-shopify-access-token': token },
        body: JSON.stringify({ query: lineItemsQuery, variables: { orderId, cursor: liCursor } }),
      });
      if (!res.ok) break;
      const data = (await res.json()) as {
        data?: {
          order?: {
            lineItems: {
              pageInfo: { hasNextPage: boolean; endCursor: string };
              edges: { node: ShopifyLineItem }[];
            };
          };
        };
      };
      const li = data.data?.order?.lineItems;
      if (!li) break;
      for (const e of li.edges) extra.push(e.node);
      if (!li.pageInfo.hasNextPage) break;
      liCursor = li.pageInfo.endCursor;
    }
    return extra;
  }

  // Paginate
  let pageCount = 0;
  const maxPages = 200; // safety cap = 20k orders

  while (pageCount < maxPages) {
    pageCount++;
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shopify-access-token': token,
      },
      body: JSON.stringify({ query: graphqlQuery, variables: { cursor, query: queryFilter } }),
    });

    // Client-credentials-tokens verlopen na 24 uur: bij een 401 eenmalig een
    // nieuw token halen en dezelfde pagina opnieuw opvragen.
    if (res.status === 401 && !refreshed) {
      refreshed = true;
      const fresh = await getShopToken(supabase, shop, { refresh: true });
      if (fresh.token) {
        token = fresh.token;
        pageCount--;
        continue;
      }
    }

    if (!res.ok) {
      const text = await res.text();
      // 401 van Shopify zelf (niet onze eigen auth) betekent vrijwel altijd dat
      // de shop de app heeft verwijderd, waardoor Shopify het token introk.
      const friendlyError =
        res.status === 401
          ? 'De Shopify-koppeling is niet meer geldig. Dit gebeurt meestal doordat de app uit de Shopify-winkel is verwijderd, waardoor het token automatisch is ingetrokken. Installeer de app opnieuw via de Partners install-link om te kunnen synchroniseren.'
          : `Shopify API fout ${res.status}`;
      return new Response(
        JSON.stringify({ error: friendlyError, detail: text }),
        { status: 502, headers: { 'content-type': 'application/json' } }
      );
    }

    const data = (await res.json()) as {
      data?: { orders: { pageInfo: { hasNextPage: boolean; endCursor: string }; edges: ShopifyOrderEdge[] } };
      errors?: unknown;
    };

    if (data.errors) {
      return new Response(
        JSON.stringify({ error: 'GraphQL fout', detail: data.errors }),
        { status: 502, headers: { 'content-type': 'application/json' } }
      );
    }

    const orders = data.data?.orders;
    if (!orders) break;

    for (const edge of orders.edges) {
      const o = edge.node;
      const lineNodes: ShopifyLineItem[] = o.lineItems.edges.map((e) => e.node);
      // Haal eventuele extra line items op als order er meer dan 250 heeft
      if (o.lineItems.pageInfo.hasNextPage) {
        const extra = await fetchRemainingLineItems(o.id, o.lineItems.pageInfo.endCursor);
        lineNodes.push(...extra);
      }
      for (const li of lineNodes) {
        items.push({
          order_id: o.id,
          order_number: o.name,
          created_at: o.createdAt,
          sku: li.sku || '',
          name: li.name || '',
          vendor: li.vendor || '',
          barcode: li.variant?.barcode || '',
          quantity: li.quantity || 0,
        });
      }
    }

    if (!orders.pageInfo.hasNextPage) break;
    cursor = orders.pageInfo.endCursor;
  }

  return new Response(JSON.stringify({ shop, items, count: items.length, pages: pageCount }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

export const config = {
  path: '/api/shopify-orders',
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] as const },
};

import type { Context } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

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
    lineItems: { edges: { node: ShopifyLineItem }[] };
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
  const supabaseUrl = Netlify.env.get('SUPABASE_URL') || 'https://comqpyhbdsqifheoegjk.supabase.co';
  const supabaseServiceKey = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: 'Server is niet correct geconfigureerd (SUPABASE_SERVICE_ROLE_KEY ontbreekt).' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }

  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const shopParam = url.searchParams.get('shop');

  // Haal opgeslagen token op
  const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
  let query = supabase.from('shopify_tokens').select('shop, access_token').limit(1);
  if (shopParam) query = query.eq('shop', shopParam);
  const { data: tokenRows, error: tokenErr } = await query;

  if (tokenErr) {
    return new Response(
      JSON.stringify({ error: 'Kon Shopify token niet ophalen', detail: tokenErr.message }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }

  if (!tokenRows || tokenRows.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Geen Shopify-koppeling gevonden. Installeer eerst de Sell-out-report app via de install link.' }),
      { status: 404, headers: { 'content-type': 'application/json' } }
    );
  }

  const shop = tokenRows[0].shop;
  const token = tokenRows[0].access_token;

  if (!from) {
    return new Response(
      JSON.stringify({ error: 'Query parameter "from" (YYYY-MM-DD) is verplicht' }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    );
  }

  const filterParts = [`created_at:>=${from}`];
  if (to) filterParts.push(`created_at:<=${to}`);
  const queryFilter = filterParts.join(' ');

  const apiUrl = `https://${shop}/admin/api/2026-04/graphql.json`;
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
            lineItems(first: 100) {
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

    if (!res.ok) {
      const text = await res.text();
      return new Response(
        JSON.stringify({ error: `Shopify API fout ${res.status}`, detail: text }),
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
      for (const liEdge of o.lineItems.edges) {
        const li = liEdge.node;
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

  return new Response(JSON.stringify({ items, count: items.length, pages: pageCount }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

export const config = { path: '/api/shopify-orders' };

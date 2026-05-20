import type { Context } from '@netlify/functions';

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
  const shop = Netlify.env.get('SHOPIFY_SHOP');
  const token = Netlify.env.get('SHOPIFY_ADMIN_TOKEN');

  if (!shop || !token) {
    return new Response(
      JSON.stringify({ error: 'Shopify credentials niet geconfigureerd. Stel SHOPIFY_SHOP en SHOPIFY_ADMIN_TOKEN in als Netlify environment variables.' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }

  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  if (!from) {
    return new Response(
      JSON.stringify({ error: 'Query parameter "from" (YYYY-MM-DD) is verplicht' }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    );
  }

  const filterParts = [`created_at:>=${from}`];
  if (to) filterParts.push(`created_at:<=${to}`);
  const queryFilter = filterParts.join(' ');

  const apiUrl = `https://${shop}/admin/api/2024-10/graphql.json`;
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

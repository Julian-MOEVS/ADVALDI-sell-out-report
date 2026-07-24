import type { Context } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { isAuthorized, unauthorized } from '../shared/auth.mts';

/**
 * /api/imports — vervangt rechtstreekse anon-key toegang tot imports.
 * GET: alle imports. POST: import aanmaken. DELETE (?id=...): import verwijderen.
 */

interface ImportCreateBody {
  filename: string;
  channel: string | null;
  rg: string | null;
  weeks: string[];
  row_count: number;
}

const IMPORTS_TABLE = 'imports';

export default async (req: Request, _ctx: Context) => {
  if (!isAuthorized(req)) return unauthorized();

  const supabaseUrl = process.env.SUPABASE_URL || 'https://comqpyhbdsqifheoegjk.supabase.co';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: 'Server is niet correct geconfigureerd (SUPABASE_SERVICE_ROLE_KEY ontbreekt).' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from(IMPORTS_TABLE)
      .select('id, filename, channel, rg, weeks, row_count, imported_at')
      .order('imported_at', { ascending: false });
    if (error) return new Response(JSON.stringify({ imports: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ imports: data || [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  if (req.method === 'POST') {
    let body: ImportCreateBody;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
    const { data, error } = await supabase.from(IMPORTS_TABLE).insert(body).select('id').single();
    if (error || !data) return new Response(JSON.stringify({ id: null }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ id: (data as { id: string }).id }), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  if (req.method === 'DELETE') {
    const url = new URL(req.url);
    const id = url.searchParams.get('id') || '';
    const { error } = await supabase.from(IMPORTS_TABLE).delete().eq('id', id);
    return new Response(JSON.stringify({ success: !error }), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  return new Response('Method not allowed', { status: 405 });
};

export const config = {
  path: '/api/imports',
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] as const },
};

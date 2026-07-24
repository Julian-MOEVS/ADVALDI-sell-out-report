import type { Context } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { isAuthorized, unauthorized } from '../shared/auth.mts';

/**
 * /api/data-rows — vervangt rechtstreekse anon-key toegang tot sell_out_data.
 * GET: alle rijen. POST: rijen invoegen. DELETE (?mode=combo|channel|channel-weeks|invalid-week): rijen verwijderen.
 * PATCH: merknaam normaliseren binnen een kanaal.
 */

interface DataRow {
  w: string;
  rg: 'NL' | 'BE';
  mfr: string;
  pg: string;
  an: string;
  ean: string;
  sku: string;
  ch: string;
  st: string;
  sl: string;
  p: number;
  s: number;
  k: number;
}

const TABLE = 'sell_out_data';

function serverMisconfigured() {
  return new Response(
    JSON.stringify({ error: 'Server is niet correct geconfigureerd (SUPABASE_SERVICE_ROLE_KEY ontbreekt).' }),
    { status: 500, headers: { 'content-type': 'application/json' } }
  );
}

export default async (req: Request, _ctx: Context) => {
  if (!isAuthorized(req)) return unauthorized();

  const supabaseUrl = process.env.SUPABASE_URL || 'https://comqpyhbdsqifheoegjk.supabase.co';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseServiceKey) return serverMisconfigured();

  const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

  if (req.method === 'GET') {
    const rows: DataRow[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from(TABLE)
        .select('w, rg, mfr, pg, an, ean, sku, ch, st, sl, p, s, k')
        .order('w', { ascending: true })
        .order('ch', { ascending: true })
        .order('an', { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) {
        return new Response(
          JSON.stringify({ error: `Supabase fetch faalde: ${error.message}` }),
          { status: 500, headers: { 'content-type': 'application/json' } }
        );
      }
      if (!data || data.length === 0) break;
      rows.push(...(data as DataRow[]));
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return new Response(JSON.stringify({ rows }), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  if (req.method === 'POST') {
    let body: { rows?: DataRow[]; importId?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }
    const rows = body.rows || [];
    if (rows.length === 0) return new Response(JSON.stringify({ success: true, count: 0 }), { status: 200, headers: { 'content-type': 'application/json' } });

    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH).map((r) => ({
        w: r.w || '',
        rg: r.rg,
        mfr: r.mfr || '',
        pg: r.pg || '',
        an: r.an || '',
        ean: r.ean || '',
        sku: r.sku || '',
        ch: r.ch || '',
        st: r.st || '',
        sl: r.sl || '',
        p: Number.isFinite(r.p) ? r.p : 0,
        s: Number.isFinite(r.s) ? r.s : 0,
        k: Number.isFinite(r.k) ? r.k : 0,
        ...(body.importId ? { import_id: body.importId } : {}),
      }));
      const { error } = await supabase.from(TABLE).insert(batch);
      if (error) {
        return new Response(
          JSON.stringify({ success: false, count: inserted, error: error.message }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      inserted += batch.length;
    }
    return new Response(JSON.stringify({ success: true, count: inserted }), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  if (req.method === 'DELETE') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('mode');

    if (mode === 'combo') {
      const week = url.searchParams.get('week') || '';
      const market = url.searchParams.get('market') || '';
      const { error } = await supabase.from(TABLE).delete().eq('w', week).eq('rg', market);
      if (error) return new Response(JSON.stringify({ success: false }), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    if (mode === 'channel') {
      const channel = url.searchParams.get('channel') || '';
      const { error } = await supabase.from(TABLE).delete().eq('ch', channel);
      if (error) return new Response(JSON.stringify({ success: false }), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    if (mode === 'channel-weeks') {
      const channel = url.searchParams.get('channel') || '';
      const weeksParam = url.searchParams.get('weeks') || '';
      const weeks = weeksParam.split(',').filter((w) => /^\d{6}$/.test(w));
      if (weeks.length === 0) return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } });
      const BATCH = 500;
      for (let i = 0; i < weeks.length; i += BATCH) {
        const slice = weeks.slice(i, i + BATCH);
        const { error } = await supabase.from(TABLE).delete().eq('ch', channel).in('w', slice);
        if (error) return new Response(JSON.stringify({ success: false }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    if (mode === 'invalid-week') {
      const { count, error } = await supabase.from(TABLE).delete({ count: 'exact' }).not('w', '~', '^[0-9]{6}$');
      if (error) return new Response(JSON.stringify({ deleted: 0, success: false }), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ deleted: count || 0, success: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Onbekende of ontbrekende mode' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  if (req.method === 'PATCH') {
    let body: { channel?: string; fromPattern?: string; toBrand?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
    const { channel, fromPattern, toBrand } = body;
    if (!channel || !fromPattern || !toBrand) {
      return new Response(JSON.stringify({ error: 'channel, fromPattern en toBrand zijn verplicht' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }

    const { data: candidates, error: selErr } = await supabase
      .from(TABLE)
      .select('w, ch, an, mfr')
      .eq('ch', channel)
      .ilike('mfr', fromPattern);
    if (selErr) return new Response(JSON.stringify({ updated: 0, success: false }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (!candidates || candidates.length === 0) return new Response(JSON.stringify({ updated: 0, success: true }), { status: 200, headers: { 'content-type': 'application/json' } });

    const { error: updErr, count } = await supabase
      .from(TABLE)
      .update({ mfr: toBrand }, { count: 'exact' })
      .eq('ch', channel)
      .ilike('mfr', fromPattern);
    if (updErr) return new Response(JSON.stringify({ updated: 0, success: false }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ updated: count || candidates.length, success: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  return new Response('Method not allowed', { status: 405 });
};

export const config = {
  path: '/api/data-rows',
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] as const },
};

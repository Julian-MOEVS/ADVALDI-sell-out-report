import { createClient } from '@supabase/supabase-js';
import type { DataRow } from '../types';

const SUPABASE_URL = 'https://comqpyhbdsqifheoegjk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_pymddvM2q7pm47IkUimHpA_IupNnvvP';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TABLE = 'sell_out_data';

/** Fetch all rows from Supabase */
export async function fetchAllRows(): Promise<DataRow[]> {
  const rows: DataRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('w, rg, mfr, pg, an, ean, ch, st, sl, p, s, k')
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('Supabase fetch error:', error);
      break;
    }

    if (!data || data.length === 0) break;
    rows.push(...(data as DataRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

/** Insert rows into Supabase (batched in chunks of 500) */
export async function insertRows(rows: DataRow[]): Promise<{ success: boolean; count: number }> {
  const BATCH = 500;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map((r) => ({
      w: r.w,
      rg: r.rg,
      mfr: r.mfr,
      pg: r.pg,
      an: r.an,
      ean: r.ean,
      ch: r.ch,
      st: r.st,
      sl: r.sl,
      p: r.p,
      s: r.s,
      k: r.k,
    }));

    const { error } = await supabase.from(TABLE).insert(batch);
    if (error) {
      console.error('Supabase insert error:', error);
      return { success: false, count: inserted };
    }
    inserted += batch.length;
  }

  return { success: true, count: inserted };
}

/** Delete rows matching a week + market combo */
export async function deleteCombo(week: string, market: 'NL' | 'BE'): Promise<boolean> {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('w', week)
    .eq('rg', market);

  if (error) {
    console.error('Supabase delete error:', error);
    return false;
  }
  return true;
}

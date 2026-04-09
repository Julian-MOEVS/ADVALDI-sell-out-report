import type { DataRow } from '../types';

export function filtered(
  data: DataRow[],
  week: 'all' | string,
  market: 'all' | 'NL' | 'BE'
): DataRow[] {
  return data.filter(
    (r) =>
      (week === 'all' || r.w === week) &&
      (market === 'all' || r.rg === market)
  );
}

export function weeks(data: DataRow[]): string[] {
  return [...new Set(data.map((r) => r.w))].sort();
}

export function sum(rows: DataRow[], key: 's' | 'p' | 'k'): number {
  return rows.reduce((a, r) => a + r[key], 0);
}

export function stockForData(rows: DataRow[], selectedWeek: 'all' | string): number {
  if (selectedWeek !== 'all') return rows.reduce((s, r) => s + r.k, 0);
  const wks = [...new Set(rows.map((r) => r.w))].sort();
  const last = wks[wks.length - 1];
  return last ? rows.filter((r) => r.w === last).reduce((s, r) => s + r.k, 0) : 0;
}

export function stockForArticle(rows: DataRow[]): number {
  const wks = [...new Set(rows.map((r) => r.w))].sort();
  const last = wks[wks.length - 1];
  return last ? rows.filter((r) => r.w === last).reduce((s, r) => s + r.k, 0) : 0;
}

export function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of arr) {
    const key = keyFn(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { deleteChannelWeeks, insertRows, fetchAllRows } from '../lib/supabase';
import type { DataRow } from '../types';
import { ShoppingBag, Info, RefreshCw, CheckCircle, AlertTriangle, Zap } from 'lucide-react';

interface ShopifyLineItem {
  order_id: string;
  order_number: string;
  created_at: string;
  sku: string;
  name: string;
  vendor: string;
  barcode: string;
  quantity: number;
}

function normalizeVendor(raw: string): string {
  const v = (raw || '').trim();
  if (!v) return 'Pure Electric';
  // Alle Pure-varianten samenvoegen (Pure, Pure Electric, Pure Electric Benelux, etc.)
  if (v.toLowerCase().includes('pure')) return 'Pure Electric';
  return v;
}

function dateToISOWeek(d: Date): string | null {
  if (!(d instanceof Date) || isNaN(d.getTime())) return null;
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}${String(weekNo).padStart(2, '0')}`;
}

function toYMD(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateNL(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface ShopifyStatus {
  connected: boolean;
  shop?: string;
  scope?: string;
  installedAt?: string;
  lastSyncedTo?: string | null;
}

export default function Shopify() {
  const [from, setFrom] = useState('2026-01-01');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [stats, setStats] = useState<{ orders: number; lineItems: number; sales: number; weeks: number } | null>(null);
  const [shopifyStatus, setShopifyStatus] = useState<ShopifyStatus | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/shopify-status');
      if (res.ok) {
        const data = (await res.json()) as ShopifyStatus;
        setShopifyStatus(data);
      }
    } catch {
      // Status is informational, geen hard error
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  /**
   * Run een sync voor een specifieke datumrange. Heeft replace-mode (delete bestaande weken eerst).
   * Bij succes wordt last_synced_to bijgewerkt op de server.
   */
  const runSync = async (fromDate: string, toDate: string | undefined, label: string) => {
    setStatus('loading');
    setMessage(`${label}: orders ophalen van Shopify...`);
    setStats(null);

    try {
      const params = new URLSearchParams({ from: fromDate });
      if (toDate) params.set('to', toDate);

      const res = await fetch(`/api/shopify-orders?${params.toString()}`);
      let payload: { error?: string; items?: ShopifyLineItem[] };
      try {
        payload = await res.json();
      } catch {
        setStatus('error');
        setMessage(`Server returned non-JSON (HTTP ${res.status}). Mogelijk timeout of crash in Netlify Function.`);
        return;
      }

      if (!res.ok) {
        setStatus('error');
        setMessage(payload.error || `HTTP ${res.status}`);
        return;
      }

      const items: ShopifyLineItem[] = payload.items || [];
      if (items.length === 0) {
        setStatus('success');
        setMessage('Geen orders gevonden in deze periode.');
        return;
      }

      setMessage(`${items.length} regels ontvangen, omzetten en opslaan...`);

      // Map items met validatie. Skipped items worden geteld zodat de gebruiker weet dat er iets weggevallen is.
      const skipped: { reason: string; sample: string }[] = [];
      const rows: DataRow[] = [];
      for (const item of items) {
        const week = dateToISOWeek(new Date(item.created_at));
        if (!week) {
          skipped.push({ reason: 'ongeldige Orderdatum', sample: `${item.order_number} ${item.created_at}` });
          continue;
        }
        const name = (item.name || '').trim();
        if (!name) {
          skipped.push({ reason: 'lege productnaam', sample: `${item.order_number} sku=${item.sku}` });
          continue;
        }
        const qty = Number(item.quantity);
        if (!Number.isFinite(qty) || qty <= 0) {
          skipped.push({ reason: 'ongeldige hoeveelheid', sample: `${item.order_number} qty=${item.quantity}` });
          continue;
        }
        rows.push({
          w: week,
          rg: 'NL',
          mfr: normalizeVendor(item.vendor),
          pg: '',
          an: name,
          ean: item.barcode || '',
          sku: item.sku || '',
          ch: 'Shopify - D2C',
          st: 'Shopify - D2C',
          sl: 'Shopify - D2C',
          p: 0,
          s: qty,
          k: 0,
        });
      }

      if (rows.length === 0) {
        setStatus('error');
        setMessage(`Alle ${items.length} regels zijn afgekeurd: ${skipped.slice(0, 3).map((s) => s.reason).join(', ')}`);
        return;
      }

      const uniqueWeeks = [...new Set(rows.map((r) => r.w))].sort();
      const uniqueOrders = new Set(items.map((i) => i.order_id)).size;
      const totalSales = rows.reduce((a, r) => a + r.s, 0);

      // Replace-mode: verwijder eerst bestaande Shopify - D2C rijen voor deze weken.
      // ABORT als delete faalt, anders krijgen we dubbele data.
      const deleteOk = await deleteChannelWeeks('Shopify - D2C', uniqueWeeks);
      if (!deleteOk) {
        setStatus('error');
        setMessage('Verwijderen van bestaande rijen mislukt. Sync afgebroken om dubbele data te voorkomen. Check je internet/Supabase status en probeer opnieuw.');
        return;
      }

      const result = await insertRows(rows);
      if (!result.success) {
        setStatus('error');
        setMessage(
          `Opslaan mislukt: ${result.count} van ${rows.length} rijen zijn ingevoegd voordat het stuk ging. ` +
          `De DB is nu in inconsistente staat — run nogmaals (replace-mode pakt het in één keer op).`
        );
        return;
      }

      // Vernieuw store met verse data uit DB
      try {
        const fresh = await fetchAllRows();
        useAppStore.setState({ userData: fresh });
      } catch (e) {
        // Sync was OK, alleen UI-refresh faalde: melden maar niet als hard error
        setStatus('success');
        setMessage(`Sync voltooid (${rows.length} rijen). UI-refresh faalde, refresh de pagina handmatig. (${e instanceof Error ? e.message : 'fout'})`);
        return;
      }

      const skippedMsg = skipped.length > 0
        ? ` ${skipped.length} regel(s) overgeslagen (${[...new Set(skipped.map((s) => s.reason))].join(', ')}).`
        : '';

      // Mark sync timestamp (server-side update van last_synced_to)
      const syncedTo = toDate ? new Date(toDate + 'T23:59:59Z').toISOString() : new Date().toISOString();
      try {
        await fetch('/api/shopify-mark-synced', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ syncedTo }),
        });
        refreshStatus();
      } catch {
        // Mark-synced is best-effort, niet kritiek
      }

      setStats({
        orders: uniqueOrders,
        lineItems: items.length,
        sales: totalSales,
        weeks: uniqueWeeks.length,
      });
      setStatus('success');
      setMessage(`Sync voltooid!${skippedMsg}`);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Onbekende fout');
    }
  };

  const handleSync = () => runSync(from, to || undefined, 'Sync');

  const handleAutoSync = () => {
    if (!shopifyStatus?.lastSyncedTo) {
      setStatus('error');
      setMessage('Nog geen eerdere sync gevonden. Doe eerst een normale sync.');
      return;
    }
    // Buffer van 1 dag terug om late orders mee te pakken
    const last = new Date(shopifyStatus.lastSyncedTo);
    last.setUTCDate(last.getUTCDate() - 1);
    const autoFrom = toYMD(last);
    const autoTo = toYMD(new Date());
    runSync(autoFrom, autoTo, `Auto Sync (${autoFrom} → ${autoTo})`);
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <ShoppingBag size={24} className="text-success" />
        <h2 className="text-lg font-semibold">Shopify koppeling</h2>
      </div>

      <div className="bg-info/10 border border-info/20 rounded-xl p-4 flex gap-3">
        <Info size={18} className="text-info shrink-0 mt-0.5" />
        <div className="text-sm text-dark/70 space-y-2">
          <p>
            Sync haalt orders direct op uit Shopify via OAuth. Credentials (Client ID/Secret + access token) staan veilig in Netlify env vars en Supabase, niet in de browser.
          </p>
          <p>
            <strong>Replace-mode:</strong> bestaande "Shopify - D2C" rijen voor de gesynchroniseerde weken worden eerst verwijderd, daarna opnieuw ingeladen. Orders krijgen de ISO-week van hun <code className="text-xs bg-bg px-1 rounded">created_at</code>.
          </p>
          <p>
            <strong>Beperking zonder <code className="text-xs bg-bg px-1 rounded">read_all_orders</code> scope:</strong> Shopify levert alleen orders van de laatste 60 dagen. Vraag die scope aan in Partners voor volledige historie.
          </p>
        </div>
      </div>

      {/* Auto Sync (primary action) */}
      <div className="bg-gradient-to-br from-accent/10 to-accent-light/5 border border-accent/30 rounded-3xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-accent" />
          <h3 className="text-sm font-medium">Auto Sync (sinds laatste sync)</h3>
        </div>
        <p className="text-xs text-dark/60">
          {shopifyStatus?.lastSyncedTo ? (
            <>Laatste sync: <strong className="text-dark">{formatDateNL(shopifyStatus.lastSyncedTo)}</strong>. Bij klik wordt vanaf 1 dag vóór die datum tot vandaag opnieuw opgehaald (replace-mode, dubbele orders kunnen niet ontstaan).</>
          ) : (
            <>Nog geen eerdere sync. Doe eerst hieronder een volledige sync met expliciete datums.</>
          )}
        </p>
        <button
          onClick={handleAutoSync}
          disabled={status === 'loading' || !shopifyStatus?.lastSyncedTo}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-accent-light to-accent text-white rounded-lg hover:opacity-90 transition disabled:opacity-50 text-sm"
        >
          <Zap size={14} />
          {status === 'loading' ? 'Synchroniseren...' : 'Auto Sync'}
        </button>
      </div>

      <div className="bg-white border border-bg4 rounded-3xl shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-medium text-dark/60">Handmatige sync over specifieke periode</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-dark/50 mb-1 uppercase tracking-wide">Vanaf *</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full bg-bg border border-bg4 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs text-dark/50 mb-1 uppercase tracking-wide">Tot (optioneel)</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full bg-bg border border-bg4 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        <button
          onClick={handleSync}
          disabled={status === 'loading' || !from}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-accent-light to-accent text-white rounded-lg hover:opacity-90 transition disabled:opacity-50 text-sm"
        >
          <RefreshCw size={14} className={status === 'loading' ? 'animate-spin' : ''} />
          {status === 'loading' ? 'Synchroniseren...' : 'Synchroniseer orders'}
        </button>

        {message && (
          <div className={`flex items-start gap-2 text-sm p-3 rounded-lg ${
            status === 'success' ? 'bg-success/10 text-success'
            : status === 'error' ? 'bg-danger/10 text-danger'
            : 'bg-bg text-dark/60'
          }`}>
            {status === 'success' && <CheckCircle size={16} className="shrink-0 mt-0.5" />}
            {status === 'error' && <AlertTriangle size={16} className="shrink-0 mt-0.5" />}
            <span>{message}</span>
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
            <Stat label="Orders" value={stats.orders} />
            <Stat label="Order regels" value={stats.lineItems} />
            <Stat label="Verkochte units" value={stats.sales} />
            <Stat label="Weken" value={stats.weeks} />
          </div>
        )}
      </div>

      <details className="bg-white border border-bg4 rounded-3xl shadow-sm p-5">
        <summary className="cursor-pointer text-sm font-medium text-dark/60">
          Setup-instructies (Partner App OAuth, eenmalig)
        </summary>
        <ol className="text-sm text-dark/70 space-y-2 mt-3 list-decimal list-inside">
          <li>Maak een Shopify Partners account op <code className="text-xs bg-bg px-1 rounded">partners.shopify.com</code>.</li>
          <li>Apps → Create app → naam <code className="text-xs bg-bg px-1 rounded">Sell-out-report</code>. Scopes: <code className="text-xs bg-bg px-1 rounded">read_orders</code>, <code className="text-xs bg-bg px-1 rounded">read_all_orders</code>, <code className="text-xs bg-bg px-1 rounded">read_products</code>, <code className="text-xs bg-bg px-1 rounded">read_inventory</code>.</li>
          <li>App URL: <code className="text-xs bg-bg px-1 rounded">https://advaldi-sell-out.netlify.app</code>. Redirect URL: <code className="text-xs bg-bg px-1 rounded">https://advaldi-sell-out.netlify.app/api/shopify-oauth-callback</code>. Embedded: off.</li>
          <li>Distribution → Custom distribution → target shop URL = jouw <code>.myshopify.com</code>.</li>
          <li>Netlify env vars: <code className="text-xs bg-bg px-1 rounded">SHOPIFY_CLIENT_ID</code>, <code className="text-xs bg-bg px-1 rounded">SHOPIFY_CLIENT_SECRET</code>, <code className="text-xs bg-bg px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code>. Trigger redeploy.</li>
          <li>Klik de install-link van Partners → goedkeuren → token wordt automatisch opgeslagen in Supabase tabel <code>shopify_tokens</code>.</li>
        </ol>
      </details>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-bg rounded-lg px-3 py-2">
      <div className="text-xs text-dark/50">{label}</div>
      <div className="text-lg font-mono text-dark">{value.toLocaleString('nl-NL')}</div>
    </div>
  );
}

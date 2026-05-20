import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { deleteChannelWeeks, insertRows } from '../lib/supabase';
import { fetchAllRows } from '../lib/supabase';
import type { DataRow } from '../types';
import { ShoppingBag, Info, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';

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

function dateToISOWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}${String(weekNo).padStart(2, '0')}`;
}

export default function Shopify() {
  const [from, setFrom] = useState('2026-01-01');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [stats, setStats] = useState<{ orders: number; lineItems: number; sales: number; weeks: number } | null>(null);

  const handleSync = async () => {
    setStatus('loading');
    setMessage('Orders ophalen van Shopify...');
    setStats(null);

    try {
      const params = new URLSearchParams({ from });
      if (to) params.set('to', to);

      const res = await fetch(`/api/shopify-orders?${params.toString()}`);
      const payload = await res.json();

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

      const rows: DataRow[] = items.map((item) => ({
        w: dateToISOWeek(new Date(item.created_at)),
        rg: 'NL',
        mfr: item.vendor || 'Pure Electric',
        pg: '',
        an: item.name,
        ean: item.barcode || '',
        sku: item.sku || '',
        ch: 'Shopify - D2C',
        st: 'Shopify - D2C',
        sl: 'Shopify - D2C',
        p: 0,
        s: item.quantity,
        k: 0,
      }));

      const uniqueWeeks = [...new Set(rows.map((r) => r.w))].sort();
      const uniqueOrders = new Set(items.map((i) => i.order_id)).size;
      const totalSales = rows.reduce((a, r) => a + r.s, 0);

      // Replace mode: verwijder bestaande Shopify - D2C rijen voor deze weken
      await deleteChannelWeeks('Shopify - D2C', uniqueWeeks);

      const result = await insertRows(rows);
      if (!result.success) {
        setStatus('error');
        setMessage('Opslaan in database is mislukt.');
        return;
      }

      // Vernieuw store
      const fresh = await fetchAllRows();
      useAppStore.setState({ userData: fresh });

      setStats({
        orders: uniqueOrders,
        lineItems: items.length,
        sales: totalSales,
        weeks: uniqueWeeks.length,
      });
      setStatus('success');
      setMessage('Sync voltooid!');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Onbekende fout');
    }
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
            Deze sync haalt orders rechtstreeks op uit de Shopify Admin API via een Netlify Function.
            Credentials staan veilig server-side als environment variables (<code className="text-xs bg-bg px-1 rounded">SHOPIFY_SHOP</code> + <code className="text-xs bg-bg px-1 rounded">SHOPIFY_ADMIN_TOKEN</code>).
          </p>
          <p>
            <strong>Replace-mode:</strong> bestaande "Shopify - D2C" rijen voor de gesynchroniseerde weken worden eerst verwijderd, daarna opnieuw ingeladen. Orders worden geplaatst in de ISO-week van hun <code className="text-xs bg-bg px-1 rounded">created_at</code>.
          </p>
        </div>
      </div>

      <div className="bg-white border border-bg4 rounded-3xl shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-medium text-dark/60">Periode</h3>
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
          Setup-instructies (eenmalig per environment)
        </summary>
        <ol className="text-sm text-dark/70 space-y-2 mt-3 list-decimal list-inside">
          <li>In Shopify Admin: <strong>Settings → Apps and sales channels → Develop apps</strong> → maak een Custom App aan.</li>
          <li>Configuration → <strong>Admin API integration</strong> → scopes: <code className="text-xs bg-bg px-1 rounded">read_orders</code>, <code className="text-xs bg-bg px-1 rounded">read_products</code> → Save.</li>
          <li>Tabblad API credentials → <strong>Install app</strong> → kopieer het <strong>Admin API access token</strong> (begint met <code>shpat_</code>).</li>
          <li>In Netlify dashboard → Site settings → Environment variables: voeg toe:
            <ul className="list-disc list-inside ml-4 mt-1">
              <li><code className="text-xs bg-bg px-1 rounded">SHOPIFY_SHOP</code> = <code>jouw-shop.myshopify.com</code></li>
              <li><code className="text-xs bg-bg px-1 rounded">SHOPIFY_ADMIN_TOKEN</code> = <code>shpat_...</code></li>
            </ul>
          </li>
          <li>Trigger een nieuwe deploy zodat de env vars geladen worden.</li>
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

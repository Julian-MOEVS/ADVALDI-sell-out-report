import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { ShoppingBag, AlertTriangle } from 'lucide-react';

export default function Shopify() {
  const { platformConfig, setPlatformConfig } = useAppStore();
  const config = platformConfig.shopify || { url: '', apiKey: '', accessToken: '' };

  const [url, setUrl] = useState(config.url);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [accessToken, setAccessToken] = useState(config.accessToken);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSave = () => {
    setPlatformConfig({ shopify: { url, apiKey, accessToken } });
    setMessage('Instellingen opgeslagen');
    setStatus('success');
  };

  const handleTest = async () => {
    setStatus('loading');
    setMessage('Verbinding testen...');
    try {
      const res = await fetch(`${url}/admin/api/2024-01/shop.json`, {
        headers: { 'X-Shopify-Access-Token': accessToken },
      });
      if (res.ok) {
        setStatus('success');
        setMessage('Verbinding geslaagd!');
      } else {
        setStatus('error');
        setMessage(`Fout: ${res.status} ${res.statusText}`);
      }
    } catch {
      setStatus('error');
      setMessage('CORS-fout: de browser blokkeert dit verzoek. Gebruik een proxy of server-side oplossing.');
    }
  };

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <ShoppingBag size={24} className="text-success" />
        <h2 className="text-lg font-semibold">Shopify</h2>
      </div>

      <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 flex gap-3">
        <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" />
        <p className="text-sm text-dark/60">
          Direct vanuit de browser verbinden met Shopify kan CORS-fouten geven.
          Overweeg een backend proxy voor productiegebruik.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-dark/50 mb-1">Shop URL</label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://jouwshop.myshopify.com"
            className="w-full bg-bg2 border border-bg4 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
        </div>
        <div>
          <label className="block text-xs text-dark/50 mb-1">API Key</label>
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            className="w-full bg-bg2 border border-bg4 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
        </div>
        <div>
          <label className="block text-xs text-dark/50 mb-1">Access Token</label>
          <input value={accessToken} onChange={(e) => setAccessToken(e.target.value)} type="password"
            className="w-full bg-bg2 border border-bg4 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={handleSave} className="px-4 py-2 bg-gradient-to-r from-accent-light to-accent text-white rounded-lg hover:opacity-90 transition text-sm">Opslaan</button>
        <button onClick={handleTest} className="px-4 py-2 bg-bg text-dark/60 rounded-lg hover:bg-bg4 transition text-sm">Test verbinding</button>
      </div>

      {message && (
        <p className={`text-sm ${status === 'success' ? 'text-success' : status === 'error' ? 'text-danger' : 'text-dark/50'}`}>
          {message}
        </p>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Globe } from 'lucide-react';

export default function WooCommerce() {
  const { platformConfig, setPlatformConfig } = useAppStore();
  const config = platformConfig.woocommerce || { url: '', consumerKey: '', consumerSecret: '' };

  const [url, setUrl] = useState(config.url);
  const [ck, setCk] = useState(config.consumerKey);
  const [cs, setCs] = useState(config.consumerSecret);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSave = () => {
    setPlatformConfig({ woocommerce: { url, consumerKey: ck, consumerSecret: cs } });
    setMessage('Instellingen opgeslagen');
    setStatus('success');
  };

  const handleTest = async () => {
    setStatus('loading');
    setMessage('Verbinding testen...');
    try {
      const res = await fetch(`${url}/wp-json/wc/v3/system_status`, {
        headers: { Authorization: 'Basic ' + btoa(`${ck}:${cs}`) },
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
      setMessage('Verbindingsfout. Controleer de URL en CORS-instellingen.');
    }
  };

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <Globe size={24} className="text-accent" />
        <h2 className="text-lg font-semibold">WooCommerce</h2>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-dark/50 mb-1">Website URL</label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://jouwsite.nl"
            className="w-full bg-bg2 border border-bg4 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
        </div>
        <div>
          <label className="block text-xs text-dark/50 mb-1">Consumer Key</label>
          <input value={ck} onChange={(e) => setCk(e.target.value)}
            className="w-full bg-bg2 border border-bg4 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
        </div>
        <div>
          <label className="block text-xs text-dark/50 mb-1">Consumer Secret</label>
          <input value={cs} onChange={(e) => setCs(e.target.value)} type="password"
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

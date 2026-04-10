import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Package, AlertTriangle } from 'lucide-react';

export default function Bol() {
  const { platformConfig, setPlatformConfig, setActivePage } = useAppStore();
  const config = platformConfig.bol || { clientId: '', clientSecret: '' };

  const [clientId, setClientId] = useState(config.clientId);
  const [clientSecret, setClientSecret] = useState(config.clientSecret);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setPlatformConfig({ bol: { clientId, clientSecret } });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <Package size={24} className="text-be-amber" />
        <h2 className="text-lg font-semibold">Bol.com</h2>
      </div>

      <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 flex gap-3">
        <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" />
        <p className="text-sm text-dark/60">
          De Bol.com API ondersteunt geen directe browser-verzoeken vanwege CORS-beperkingen.
          Gebruik de Excel-import functie om Bol.com data te verwerken.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-dark/50 mb-1">Client ID</label>
          <input value={clientId} onChange={(e) => setClientId(e.target.value)}
            className="w-full bg-bg2 border border-bg4 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
        </div>
        <div>
          <label className="block text-xs text-dark/50 mb-1">Client Secret</label>
          <input value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} type="password"
            className="w-full bg-bg2 border border-bg4 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={handleSave} className="px-4 py-2 bg-gradient-to-r from-accent-light to-accent text-white rounded-lg hover:opacity-90 transition text-sm">Opslaan</button>
        <button onClick={() => setActivePage('import')} className="px-4 py-2 bg-bg text-dark/60 rounded-lg hover:bg-bg4 transition text-sm">Naar Excel import</button>
      </div>

      {saved && <p className="text-sm text-success">Instellingen opgeslagen</p>}
    </div>
  );
}

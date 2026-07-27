import { useState } from 'react';
import { Lock } from 'lucide-react';

interface Props {
  onLogin: () => void;
}

export default function LoginScreen({ onLogin }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (checking) return;
    setChecking(true);
    setError(false);
    try {
      // Valideer wachtwoord server-side: dit is tevens het API-geheim (bearer)
      // voor de beveiligde Netlify Functions. 200 = correct, anders fout.
      const res = await fetch('/api/shopify-status', {
        headers: { Authorization: `Bearer ${password}` },
      });
      if (res.ok) {
        sessionStorage.setItem('moevs-auth', '1');
        sessionStorage.setItem('moevs-secret', password);
        onLogin();
      } else {
        setError(true);
        setPassword('');
      }
    } catch {
      setError(true);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-accent-light via-accent to-accent-dark flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-10 w-full max-w-sm shadow-2xl">
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-accent-light to-accent flex items-center justify-center shadow-lg">
            <Lock size={24} className="text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-dark tracking-wide">ADVALDI</h1>
            <p className="text-sm text-dark/40 mt-1 font-light">Sell-out Dashboard</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <input
              type="password"
              placeholder="Wachtwoord"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(false); }}
              autoFocus
              className="w-full bg-bg border border-bg4 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:border-accent font-light"
            />
            {error && (
              <p className="text-danger text-xs mt-2 font-light">Onjuist wachtwoord</p>
            )}
          </div>
          <button
            type="submit"
            disabled={checking || !password}
            className="w-full py-3 bg-gradient-to-r from-accent-light to-accent text-white rounded-2xl hover:opacity-90 transition text-sm font-semibold shadow-lg disabled:opacity-50"
          >
            {checking ? 'Controleren...' : 'Inloggen'}
          </button>
        </form>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Lock } from 'lucide-react';

interface Props {
  onLogin: () => void;
}

const PASSWORD_HASH = 'Kasheeftau';

export default function LoginScreen({ onLogin }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === PASSWORD_HASH) {
      sessionStorage.setItem('moevs-auth', '1');
      onLogin();
    } else {
      setError(true);
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="bg-bg2 border border-white/5 rounded-2xl p-8 w-full max-w-sm">
        <div className="flex flex-col items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center">
            <Lock size={22} className="text-accent" />
          </div>
          <div className="text-center">
            <h1 className="text-lg font-bold text-accent tracking-wide">MOEVS</h1>
            <p className="text-sm text-gray-400 mt-1">Sell-out Dashboard</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              placeholder="Wachtwoord"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(false); }}
              autoFocus
              className="w-full bg-bg3 border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-accent"
            />
            {error && (
              <p className="text-danger text-xs mt-2">Onjuist wachtwoord</p>
            )}
          </div>
          <button
            type="submit"
            className="w-full py-2.5 bg-accent text-white rounded-lg hover:bg-accent/80 transition text-sm font-medium"
          >
            Inloggen
          </button>
        </form>
      </div>
    </div>
  );
}

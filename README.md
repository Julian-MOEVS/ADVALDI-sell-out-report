# MOEVS Agency — Sell-out Dashboard

Dashboard voor MOEVS Agency B.V. om wekelijkse Excel-rapportages van Media Markt te verwerken en te analyseren.

## Lokaal draaien

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## Deployen naar Netlify

1. Push naar een Git repository
2. Koppel de repo aan Netlify
3. Netlify detecteert automatisch de build-instellingen via `netlify.toml`

Of handmatig:

```bash
npm run build
# Upload de `dist/` map naar Netlify
```

## Technologie

- React + TypeScript (Vite)
- Tailwind CSS
- Recharts (grafieken)
- SheetJS (Excel import/export)
- Zustand (state management)
- Lucide React (iconen)

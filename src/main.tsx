import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// Shopify stuurt na een app-installatie naar de app-URL met ?shop=&hmac=. Die
// moet de OAuth-stap starten (zie netlify/functions/shopify-oauth-start.mts);
// anders belandt de installatie op het dashboard zonder dat er een token komt.
const launch = new URLSearchParams(window.location.search);
if (launch.has('shop') && launch.has('hmac') && !launch.has('code')) {
  window.location.replace(`/api/shopify-oauth-start${window.location.search}`);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

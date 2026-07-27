import { useEffect, useState } from 'react';
import { useAppStore, loadRemoteData } from './store/useAppStore';
import Sidebar from './components/layout/Sidebar';
import Topbar from './components/layout/Topbar';
import LoginScreen from './components/layout/LoginScreen';
import Dashboard from './pages/Dashboard';
import WeekView from './pages/WeekView';
import MonthView from './pages/MonthView';
import Products from './pages/Products';
import Stores from './pages/Stores';
import Brands from './pages/Brands';
import Import from './pages/Import';
import Databeheer from './pages/Databeheer';
import Shopify from './pages/Shopify';
import WooCommerce from './pages/WooCommerce';
import Bol from './pages/Bol';
import ProductDetail from './pages/ProductDetail';
import StoreDetail from './pages/StoreDetail';

const pages: Record<string, { title: string; component: React.FC }> = {
  dashboard: { title: 'Dashboard', component: Dashboard },
  weekview: { title: 'Per week', component: WeekView },
  monthview: { title: 'Per maand (SOA)', component: MonthView },
  products: { title: 'Producten', component: Products },
  stores: { title: 'Winkels', component: Stores },
  brands: { title: 'Merken', component: Brands },
  import: { title: 'Excel import', component: Import },
  databeheer: { title: 'Databeheer', component: Databeheer },
  shopify: { title: 'Shopify', component: Shopify },
  woocommerce: { title: 'WooCommerce', component: WooCommerce },
  bol: { title: 'Bol.com', component: Bol },
  productdetail: { title: 'Product', component: ProductDetail },
  storedetail: { title: 'Winkel', component: StoreDetail },
};

export default function App() {
  const { activePage } = useAppStore();
  const [authed, setAuthed] = useState(() => sessionStorage.getItem('moevs-auth') === '1');

  // Data laden zodra we geauthenticeerd zijn (de API-endpoints vereisen de
  // secret die pas bij login beschikbaar is). Bij een 401 (bv. na wachtwoord-
  // rotatie: oude secret nog in sessionStorage) sessie wissen en terug naar login.
  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    loadRemoteData().then((r) => {
      if (cancelled) return;
      if (r.unauthorized) {
        sessionStorage.removeItem('moevs-auth');
        sessionStorage.removeItem('moevs-secret');
        setAuthed(false);
      }
    });
    return () => { cancelled = true; };
  }, [authed]);

  if (!authed) {
    return <LoginScreen onLogin={() => setAuthed(true)} />;
  }

  const page = pages[activePage] || pages.dashboard;
  const PageComponent = page.component;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 md:ml-[240px] flex flex-col">
        <Topbar />
        <main className="flex-1 p-4 md:p-6">
          <h1 className="text-lg font-semibold mb-4">{page.title}</h1>
          <PageComponent />
        </main>
      </div>
    </div>
  );
}

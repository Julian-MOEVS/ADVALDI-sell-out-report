import { useAppStore } from './store/useAppStore';
import Sidebar from './components/layout/Sidebar';
import Topbar from './components/layout/Topbar';
import Dashboard from './pages/Dashboard';
import WeekView from './pages/WeekView';
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
  const page = pages[activePage] || pages.dashboard;
  const PageComponent = page.component;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 md:ml-[216px] flex flex-col">
        <Topbar />
        <main className="flex-1 p-4 md:p-6">
          <h1 className="text-lg font-semibold mb-4">{page.title}</h1>
          <PageComponent />
        </main>
      </div>
    </div>
  );
}

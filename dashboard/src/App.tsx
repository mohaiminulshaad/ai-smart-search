import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import '@shopify/polaris/build/esm/styles.css';

import AdminLayout      from './layouts/AdminLayout';
import Dashboard        from './pages/Dashboard';
import KnowledgeBase    from './pages/KnowledgeBase';
import GuestUsers       from './pages/GuestUsers';
import RegisteredUsers  from './pages/RegisteredUsers';
import ApiKeys          from './pages/ApiKeys';
import SearchSettings   from './pages/SearchSettings';
import DisplaySettings  from './pages/DisplaySettings';
import Analytics        from './pages/Analytics';
import Billing          from './pages/Billing';
import Support          from './pages/Support';

// Preserve ?shop=&host= query params when redirecting to dashboard
function RootRedirect() {
  const location = useLocation();
  return <Navigate to={`/dashboard${location.search}`} replace />;
}

const App = () => (
  <AppProvider i18n={enTranslations}>
    <BrowserRouter>
      <AdminLayout>
        <Routes>
          <Route path="/"                  element={<RootRedirect />} />
          <Route path="/app"               element={<RootRedirect />} />
          <Route path="/dashboard"         element={<Dashboard />} />
          <Route path="/search-settings"   element={<SearchSettings />} />
          <Route path="/analytics"         element={<Analytics />} />
          <Route path="/billing"           element={<Billing />} />
          <Route path="/support"           element={<Support />} />
          <Route path="/knowledge-base"    element={<KnowledgeBase />} />
          <Route path="/users/guests"      element={<GuestUsers />} />
          <Route path="/users/registered"  element={<RegisteredUsers />} />
          <Route path="/api-keys"          element={<ApiKeys />} />
          <Route path="/display-settings"  element={<DisplaySettings />} />
          <Route path="*"                  element={<RootRedirect />} />
        </Routes>
      </AdminLayout>
    </BrowserRouter>
  </AppProvider>
);

export default App;

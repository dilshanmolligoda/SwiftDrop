import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import HealthPage from './features/health/HealthPage.tsx'
import { CustomerProfileProvider } from './features/customer/context/CustomerProfileProvider.tsx'
import { CustomerDeliveryProvider } from './features/customer/context/CustomerDeliveryProvider.tsx'
import { CustomerLayout } from './features/customer/components/CustomerLayout.tsx'
import { SettingsPage } from './features/customer/pages/SettingsPage.tsx'
import { AddressBookPage } from './features/customer/pages/AddressBookPage.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CustomerProfileProvider>
      <CustomerDeliveryProvider>
        <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <CustomerLayout>
                <SettingsPage />
              </CustomerLayout>
            }
          />
          <Route
            path="/settings"
            element={
              <CustomerLayout>
                <SettingsPage />
              </CustomerLayout>
            }
          />
          <Route
            path="/customer/settings"
            element={
              <CustomerLayout>
                <SettingsPage />
              </CustomerLayout>
            }
          />
          <Route
            path="/customer/addresses"
            element={
              <CustomerLayout>
                <AddressBookPage />
              </CustomerLayout>
            }
          />
          <Route
            path="/addresses"
            element={
              <CustomerLayout>
                <AddressBookPage />
              </CustomerLayout>
            }
          />
          <Route path="/health" element={<HealthPage />} />
          <Route path="/welcome" element={<App />} />
        </Routes>
      </BrowserRouter>
    </CustomerDeliveryProvider>
  </CustomerProfileProvider>
</StrictMode>,
)


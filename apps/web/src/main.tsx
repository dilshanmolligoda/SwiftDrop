import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import HealthPage from './features/health/HealthPage.tsx'
import LoginPage from './features/auth/LoginPage.tsx'
import { CustomerProfileProvider } from './features/customer/context/CustomerProfileProvider.tsx'
import { CustomerDeliveryProvider } from './features/customer/context/CustomerDeliveryProvider.tsx'
import { CustomerLayout } from './features/customer/components/CustomerLayout.tsx'
import { SettingsPage } from './features/customer/pages/SettingsPage.tsx'
import { AddressBookPage } from './features/customer/pages/AddressBookPage.tsx'
import { RequireRole } from './app/auth/RequireRole.tsx'
import { CourierLayout } from './features/courier/components/CourierLayout.tsx'
import { CourierDashboardPage } from './features/courier/pages/CourierDashboardPage.tsx'
import { MyDeliveriesPage } from './features/courier/pages/MyDeliveriesPage.tsx'
import { DeliveryDetailsPage } from './features/courier/pages/DeliveryDetailsPage.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CustomerProfileProvider>
      <CustomerDeliveryProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route path="/login" element={<LoginPage />} />
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
            <Route
              path="/courier"
              element={
                <RequireRole roles={['COURIER']}>
                  <CourierLayout />
                </RequireRole>
              }
            >
              <Route index element={<Navigate to="/courier/dashboard" replace />} />
              <Route path="dashboard" element={<CourierDashboardPage />} />
              <Route path="deliveries" element={<MyDeliveriesPage />} />
              <Route path="deliveries/:parcelId" element={<DeliveryDetailsPage />} />
              <Route path="*" element={<Navigate to="/courier/dashboard" replace />} />
            </Route>
            <Route path="/health" element={<HealthPage />} />
            <Route path="/welcome" element={<App />} />
            <Route path="/vite-demo" element={<App />} />
          </Routes>
        </BrowserRouter>
      </CustomerDeliveryProvider>
    </CustomerProfileProvider>
  </StrictMode>,
)

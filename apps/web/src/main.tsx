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
import { AdminLayout } from './components/layout/AdminLayout.tsx'
import { AdminPlaceholderPage } from './features/admin/pages/AdminPlaceholderPage.tsx'
import { AdminSettingsPage } from './features/admin/pages/AdminSettingsPage.tsx'

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
            <Route path="/health" element={<HealthPage />} />
            <Route path="/welcome" element={<App />} />
            <Route path="/vite-demo" element={<App />} />

            {/* Member 7 Admin & Dispatcher Routes */}
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<AdminPlaceholderPage title="Dashboard" description="Overview of platform performance, daily dispatch metrics, and quick actions." />} />
              <Route path="deliveries" element={<AdminPlaceholderPage title="Deliveries" description="Unassigned parcels, real-time status updates, and courier assignment." />} />
              <Route path="couriers" element={<AdminPlaceholderPage title="Couriers" description="Active courier list, current workloads, and assignment capacity." />} />
              <Route path="users" element={<AdminPlaceholderPage title="Users & Approvals" description="Manage system users and review pending merchant registrations." />} />
              <Route path="pricing" element={<AdminPlaceholderPage title="Zones & Pricing" description="Configure delivery zones and set per-zone pricing rules." />} />
              <Route path="reports" element={<AdminPlaceholderPage title="Reports" description="Daily delivery summaries, success rates, and failure analysis." />} />
              <Route path="settings" element={<AdminSettingsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </CustomerDeliveryProvider>
    </CustomerProfileProvider>
  </StrictMode>,
)

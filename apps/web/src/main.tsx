import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import HealthPage from './features/health/HealthPage.tsx'
import LoginPage from './features/auth/LoginPage.tsx'
import RegisterRoleSelectPage from './features/auth/RegisterRoleSelectPage.tsx'
import RegisterCustomerPage from './features/auth/RegisterCustomerPage.tsx'
import RegisterMerchantPage from './features/auth/RegisterMerchantPage.tsx'
import RegisterCourierPage from './features/auth/RegisterCourierPage.tsx'
import ApplicationStatusPage from './features/auth/ApplicationStatusPage.tsx'
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
import { HelpSupportPage } from './features/customer/pages/HelpSupportPage.tsx'
import { NotificationsPage } from './features/customer/pages/NotificationsPage.tsx'
import CustomerDashboard from './features/customer/pages/CustomerDashboard.tsx'
import MyDeliveriesPage from './features/customer/pages/MyDeliveriesPage.tsx'
import { AdminLayout } from './components/layout/AdminLayout.tsx'
import { AdminPlaceholderPage } from './features/admin/pages/AdminPlaceholderPage.tsx'
import { AdminSettingsPage } from './features/admin/pages/AdminSettingsPage.tsx'
import { AdminDashboardPage } from './features/admin/pages/AdminDashboardPage.tsx'
import MerchantDashboard from './features/merchant/pages/MerchantDashboard';
import MerchantOrdersPage from './features/merchant/pages/MerchantOrdersPage';
import { MerchantLayout } from './features/merchant/components/MerchantLayout';
import AdminLandingPage from './features/admin/pages/AdminLandingPage';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CustomerProfileProvider>
      <CustomerDeliveryProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterRoleSelectPage />} />
            <Route path="/register/customer" element={<RegisterCustomerPage />} />
            <Route path="/register/merchant" element={<RegisterMerchantPage />} />
            <Route path="/register/courier" element={<RegisterCourierPage />} />
            <Route path="/application-status" element={<ApplicationStatusPage />} />
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
              path="/customer/support"
              element={
                <CustomerLayout>
                  <HelpSupportPage />
                </CustomerLayout>
              }
            />
            <Route
              path="/customer/help"
              element={
                <CustomerLayout>
                  <HelpSupportPage />
                </CustomerLayout>
              }
            />
            <Route
              path="/support"
              element={
                <CustomerLayout>
                  <HelpSupportPage />
                </CustomerLayout>
              }
            />
            <Route
              path="/customer/notifications"
              element={
                <CustomerLayout>
                  <NotificationsPage />
                </CustomerLayout>
              }
            />
            <Route
              path="/notifications"
              element={
                <CustomerLayout>
                  <NotificationsPage />
                </CustomerLayout>
              }
            />
            <Route path="/health" element={<HealthPage />} />
            <Route path="/welcome" element={<App />} />
            <Route path="/vite-demo" element={<App />} />
            {/* Customer portal routes */}
            <Route path="/customer" element={<Navigate to="/customer/dashboard" replace />} />
            <Route
              path="/customer/dashboard"
              element={
                <CustomerLayout>
                  <CustomerDashboard />
                </CustomerLayout>
              }
            />
            <Route
              path="/customer/deliveries"
              element={
                <CustomerLayout>
                  <MyDeliveriesPage />
                </CustomerLayout>
              }
            />
            <Route
              path="/deliveries"
              element={
                <CustomerLayout>
                  <MyDeliveriesPage />
                </CustomerLayout>
              }
            />
            <Route
              path="/customer/create-delivery"
              element={<Navigate to="/customer/dashboard?create=true" replace />}
            />
            <Route path="/merchant/dashboard" element={<MerchantDashboard />} />
            <Route path="/merchant" element={<MerchantLayout />}>
              <Route index element={<Navigate to="orders" replace />} />
              <Route path="orders" element={<MerchantOrdersPage />} />
            </Route>
            {/* /courier/* is served by the Courier Portal routes above. */}
            <Route path="/admin-landing" element={<AdminLandingPage />} />

            {/* Member 7 Admin & Dispatcher Routes */}
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<AdminDashboardPage />} />
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

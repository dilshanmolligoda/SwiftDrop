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
import { PublicTrackingPage } from './features/customer/pages/PublicTrackingPage.tsx'
import { CustomerTrackingPage } from './features/customer/pages/CustomerTrackingPage.tsx'
import { DeliveryHistoryPage } from './features/customer/pages/DeliveryHistoryPage.tsx'
import { RequireRole } from './app/auth/RequireRole.tsx'
import { CourierLayout } from './features/courier/components/CourierLayout.tsx'
import { CourierDashboardPage } from './features/courier/pages/CourierDashboardPage.tsx'
import { MyDeliveriesPage as CourierMyDeliveriesPage } from './features/courier/pages/MyDeliveriesPage.tsx'
import { DeliveryDetailsPage } from './features/courier/pages/DeliveryDetailsPage.tsx'
import { HelpSupportPage } from './features/customer/pages/HelpSupportPage.tsx'
import { NotificationsPage } from './features/customer/pages/NotificationsPage.tsx'
import CustomerDashboard from './features/customer/pages/CustomerDashboard.tsx'
import CustomerMyDeliveriesPage from './features/customer/pages/MyDeliveriesPage.tsx'
import { AdminLayout } from './components/layout/AdminLayout.tsx'
import { AdminSettingsPage } from './features/admin/pages/AdminSettingsPage.tsx'
import { AdminDashboardPage } from './features/admin/pages/AdminDashboardPage.tsx'
import { AdminDeliveriesPage } from './features/admin/pages/AdminDeliveriesPage.tsx'
import { AdminCouriersPage } from './features/admin/pages/AdminCouriersPage.tsx'
import { AdminUsersApprovalsPage } from './features/admin/pages/AdminUsersApprovalsPage.tsx'
import { AdminReviewApplicationPage } from './features/admin/pages/AdminReviewApplicationPage.tsx'
import { AdminPricingPage } from './features/admin/pages/AdminPricingPage.tsx'
import { AdminReportsPage } from './features/admin/pages/AdminReportsPage.tsx'
import MerchantDashboard from './features/merchant/pages/MerchantDashboard';
import MerchantOrdersPage from './features/merchant/pages/MerchantOrdersPage';
import { MerchantLayout } from './features/merchant/components/MerchantLayout';
import AdminLandingPage from './features/admin/pages/AdminLandingPage';
import MerchantTrackParcelPage from './features/merchant/pages/MerchantTrackParcelPage';
import MerchantPricingPage from './features/merchant/pages/MerchantPricingPage';
import MerchantSettingsPage from './features/merchant/pages/MerchantSettingsPage';
import './features/merchant/components/MerchantTypography.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CustomerProfileProvider>
      <CustomerDeliveryProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/track" element={<PublicTrackingPage />} />
            <Route
              path="/customer/deliveries"
              element={
                <CustomerLayout>
                  <DeliveryHistoryPage />
                </CustomerLayout>
              }
            />
            <Route
              path="/customer/tracking"
              element={
                <CustomerLayout>
                  <CustomerTrackingPage />
                </CustomerLayout>
              }
            />
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
              <Route path="deliveries" element={<CourierMyDeliveriesPage />} />
              <Route path="deliveries/:parcelId" element={<DeliveryDetailsPage />} />
              <Route path="*" element={<Navigate to="/courier/dashboard" replace />} />
            </Route>
            <Route
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
              path="/deliveries"
              element={
                <CustomerLayout>
                  <CustomerMyDeliveriesPage />
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
              <Route path="track" element={<MerchantTrackParcelPage />} />
              <Route path="track/:trackingNumber" element={<MerchantTrackParcelPage />} />
              <Route path="pricing" element={<MerchantPricingPage />} />
              <Route path="pricing/:date" element={<MerchantPricingPage />} />
              <Route path="settings" element={<MerchantSettingsPage />} />
            </Route>
            {/* /courier/* is served by the Courier Portal routes above. */}
            <Route path="/admin-landing" element={<AdminLandingPage />} />

            {/* Member 7 Admin & Dispatcher Routes */}
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<AdminDashboardPage />} />
              <Route path="deliveries" element={<AdminDeliveriesPage />} />
              <Route path="couriers" element={<AdminCouriersPage />} />
              <Route path="users" element={<AdminUsersApprovalsPage />} />
              <Route path="users/review/:id" element={<AdminReviewApplicationPage />} />
              <Route path="users/review" element={<AdminReviewApplicationPage />} />
              <Route path="pricing" element={<AdminPricingPage />} />
              <Route path="reports" element={<AdminReportsPage />} />
              <Route path="settings" element={<AdminSettingsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </CustomerDeliveryProvider>
    </CustomerProfileProvider>
  </StrictMode>,
)

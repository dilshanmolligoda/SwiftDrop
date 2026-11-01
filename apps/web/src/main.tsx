import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import HealthPage from './features/health/HealthPage.tsx'
import { CustomerProfileProvider } from './features/customer/context/CustomerProfileProvider.tsx'
import { CustomerLayout } from './features/customer/components/CustomerLayout.tsx'
import { SettingsPage } from './features/customer/pages/SettingsPage.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CustomerProfileProvider>
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
          <Route path="/health" element={<HealthPage />} />
          <Route path="/welcome" element={<App />} />
        </Routes>
      </BrowserRouter>
    </CustomerProfileProvider>
  </StrictMode>,
)


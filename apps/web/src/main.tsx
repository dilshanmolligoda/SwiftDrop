import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import HealthPage from './features/health/HealthPage.tsx'
import LoginPage from './features/auth/LoginPage.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/health" element={<HealthPage />} />
        <Route path="/vite-demo" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)

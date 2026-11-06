import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SwiftDropLogo } from './components/SwiftDropLogo';
import { AuthBackground } from './components/AuthBackground';
import './LoginPage.css';
import './RegisterPage.css';

type SelectedRole = 'CUSTOMER' | 'MERCHANT' | 'COURIER';

export default function RegisterRoleSelectPage() {
  const [selectedRole, setSelectedRole] = useState<SelectedRole>('CUSTOMER');
  const navigate = useNavigate();

  const handleContinue = () => {
    switch (selectedRole) {
      case 'CUSTOMER':
        navigate('/register/customer');
        break;
      case 'MERCHANT':
        navigate('/register/merchant');
        break;
      case 'COURIER':
        navigate('/register/courier');
        break;
    }
  };

  const getRoleLabel = () => {
    switch (selectedRole) {
      case 'CUSTOMER':
        return 'Continue as Customer';
      case 'MERCHANT':
        return 'Continue as Merchant';
      case 'COURIER':
        return 'Continue as Courier';
    }
  };

  return (
    <div className="login-page">
      <AuthBackground />

      <main className="login-card register-card" role="main">
        <header className="login-card__header">
          <SwiftDropLogo size={28} />
          <h1 className="login-card__title">Create an account</h1>
          <p className="login-card__subtitle">Choose how you would like to use SwiftDrop.</p>
        </header>

        <div className="role-select-list" role="radiogroup" aria-label="Select account type">
          {/* Customer Card */}
          <div
            className={`role-card ${selectedRole === 'CUSTOMER' ? 'role-card--selected' : ''}`}
            onClick={() => setSelectedRole('CUSTOMER')}
            role="radio"
            aria-checked={selectedRole === 'CUSTOMER'}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                setSelectedRole('CUSTOMER');
              }
            }}
          >
            <div className="role-card__icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div className="role-card__content">
              <h2 className="role-card__title">Customer</h2>
              <p className="role-card__desc">Send personal parcels and track deliveries.</p>
            </div>
            <div className="role-card__radio" aria-hidden="true">
              {selectedRole === 'CUSTOMER' && <div className="role-card__radio-inner" />}
            </div>
          </div>

          {/* Merchant Card */}
          <div
            className={`role-card ${selectedRole === 'MERCHANT' ? 'role-card--selected' : ''}`}
            onClick={() => setSelectedRole('MERCHANT')}
            role="radio"
            aria-checked={selectedRole === 'MERCHANT'}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                setSelectedRole('MERCHANT');
              }
            }}
          >
            <div className="role-card__icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <div className="role-card__content">
              <h2 className="role-card__title">Merchant</h2>
              <p className="role-card__desc">Manage delivery orders for your business.</p>
            </div>
            <div className="role-card__radio" aria-hidden="true">
              {selectedRole === 'MERCHANT' && <div className="role-card__radio-inner" />}
            </div>
          </div>

          {/* Courier Card */}
          <div
            className={`role-card ${selectedRole === 'COURIER' ? 'role-card--selected' : ''}`}
            onClick={() => setSelectedRole('COURIER')}
            role="radio"
            aria-checked={selectedRole === 'COURIER'}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                setSelectedRole('COURIER');
              }
            }}
          >
            <div className="role-card__icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18.5" cy="17.5" r="3.5" />
                <circle cx="5.5" cy="17.5" r="3.5" />
                <circle cx="15" cy="5" r="1" />
                <path d="M12 17.5V14l-3-3 4-3 2 3h2" />
              </svg>
            </div>
            <div className="role-card__content">
              <h2 className="role-card__title">Courier</h2>
              <p className="role-card__desc">Pick up and deliver parcels as a courier.</p>
            </div>
            <div className="role-card__radio" aria-hidden="true">
              {selectedRole === 'COURIER' && <div className="role-card__radio-inner" />}
            </div>
          </div>
        </div>

        <button type="button" className="login-submit-btn" onClick={handleContinue}>
          {getRoleLabel()}
        </button>

        <footer className="login-card__footer">
          <span>Already have an account?</span>
          <Link to="/login" className="login-register-btn" style={{ textDecoration: 'none' }}>
            Log in
          </Link>
        </footer>
      </main>
    </div>
  );
}


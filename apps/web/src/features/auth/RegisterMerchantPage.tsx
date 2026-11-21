import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { env } from '../../lib/env';
import { SwiftDropLogo } from './components/SwiftDropLogo';
import { AuthBackground } from './components/AuthBackground';
import './LoginPage.css';
import './RegisterPage.css';

export default function RegisterMerchantPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [businessType, setBusinessType] = useState('Retail');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const navigate = useNavigate();

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!fullName.trim() || fullName.trim().length < 2) {
      errors.fullName = 'Please enter your full name (applicant name)';
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      errors.email = 'Business contact email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = 'Please enter a valid business email address';
    }

    const cleanedPhone = phoneNumber.replace(/[\s\-()]/g, '');
    if (!cleanedPhone) {
      errors.phoneNumber = 'Phone number is required';
    } else if (!/^(\+?[0-9]{9,15}|0[0-9]{9})$/.test(cleanedPhone)) {
      errors.phoneNumber = 'Please enter a valid phone number (e.g. 077 123 4567)';
    }

    if (!businessName.trim() || businessName.trim().length < 2) {
      errors.businessName = 'Business or store name is required';
    }

    if (!businessAddress.trim() || businessAddress.trim().length < 5) {
      errors.businessAddress = 'Please enter a complete business address';
    }

    if (!businessType.trim()) {
      errors.businessType = 'Please select a business category';
    }

    if (!password) {
      errors.password = 'Password is required';
    } else if (password.length < 12) {
      errors.password = 'Password must be at least 12 characters long';
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!validateForm() || isLoading) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${env.apiBaseUrl}/auth/register/merchant`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          phoneNumber: phoneNumber.trim(),
          businessName: businessName.trim(),
          businessAddress: businessAddress.trim(),
          businessType: businessType.trim(),
          password,
        }),
      });

      if (!response.ok) {
        if (response.status === 409) {
          setErrorMessage('An account with this email address already exists. Please log in.');
          return;
        }

        if (response.status === 400) {
          const badRequest = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
          const msg = Array.isArray(badRequest?.message) ? badRequest?.message.join(', ') : badRequest?.message;
          setErrorMessage(msg || 'Please verify the submitted information.');
          return;
        }

        setErrorMessage(`Registration failed (HTTP ${response.status}). Please try again later.`);
        return;
      }

      // Successful registration sets HTTP-only cookie and redirects to application status
      navigate('/application-status', { replace: true });
    } catch {
      setErrorMessage('Unable to connect to SwiftDrop server. Please ensure the backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <AuthBackground />

      <main className="login-card register-card register-card--wide" role="main">
        <header className="login-card__header">
          <SwiftDropLogo size={28} />
          <h1 className="login-card__title">Register as Merchant</h1>
          <p className="login-card__subtitle">Manage delivery orders for your business.</p>
        </header>

        {/* Notice of Approval Requirement */}
        <div className="register-notice" role="status">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
          <div>
            <strong>Approval Required:</strong> Merchant accounts are reviewed by dispatch administrators before dispatch and billing features are activated.
          </div>
        </div>

        {errorMessage && (
          <div className="login-alert login-alert--error" role="alert">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" style={{ flexShrink: 0 }}>
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          {/* Two-column: Applicant Name & Contact Email */}
          <div className="form-grid-two">
            <div className="login-field">
              <label className="login-field__label" htmlFor="fullName">
                Applicant Name
              </label>
              <input
                id="fullName"
                type="text"
                className={`login-field__input ${fieldErrors.fullName ? 'login-field__input--error' : ''}`}
                placeholder="Full name of owner"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (fieldErrors.fullName) setFieldErrors((prev) => ({ ...prev, fullName: undefined! }));
                }}
                disabled={isLoading}
                autoComplete="name"
              />
              {fieldErrors.fullName && <span className="login-field__error">{fieldErrors.fullName}</span>}
            </div>

            <div className="login-field">
              <label className="login-field__label" htmlFor="email">
                Business Email
              </label>
              <input
                id="email"
                type="email"
                className={`login-field__input ${fieldErrors.email ? 'login-field__input--error' : ''}`}
                placeholder="store@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined! }));
                }}
                disabled={isLoading}
                autoComplete="email"
              />
              {fieldErrors.email && <span className="login-field__error">{fieldErrors.email}</span>}
            </div>
          </div>

          {/* Two-column: Business Name & Category */}
          <div className="form-grid-two">
            <div className="login-field">
              <label className="login-field__label" htmlFor="businessName">
                Business / Store Name
              </label>
              <input
                id="businessName"
                type="text"
                className={`login-field__input ${fieldErrors.businessName ? 'login-field__input--error' : ''}`}
                placeholder="e.g. Silva Supermarket"
                value={businessName}
                onChange={(e) => {
                  setBusinessName(e.target.value);
                  if (fieldErrors.businessName) setFieldErrors((prev) => ({ ...prev, businessName: undefined! }));
                }}
                disabled={isLoading}
              />
              {fieldErrors.businessName && <span className="login-field__error">{fieldErrors.businessName}</span>}
            </div>

            <div className="login-field">
              <label className="login-field__label" htmlFor="businessType">
                Business Category
              </label>
              <select
                id="businessType"
                className={`login-field__select ${fieldErrors.businessType ? 'login-field__input--error' : ''}`}
                value={businessType}
                onChange={(e) => {
                  setBusinessType(e.target.value);
                  if (fieldErrors.businessType) setFieldErrors((prev) => ({ ...prev, businessType: undefined! }));
                }}
                disabled={isLoading}
              >
                <option value="Retail">Retail & Fashion</option>
                <option value="Grocery">Supermarket & Grocery</option>
                <option value="Electronics">Electronics & Hardware</option>
                <option value="Food & Beverage">Food & Beverage</option>
                <option value="Pharmacy">Health & Pharmacy</option>
                <option value="Other">Other Business</option>
              </select>
              {fieldErrors.businessType && <span className="login-field__error">{fieldErrors.businessType}</span>}
            </div>
          </div>

          {/* Business Address */}
          <div className="login-field">
            <label className="login-field__label" htmlFor="businessAddress">
              Business Address (Dispatch / Pickup Location)
            </label>
            <input
              id="businessAddress"
              type="text"
              className={`login-field__input ${fieldErrors.businessAddress ? 'login-field__input--error' : ''}`}
              placeholder="e.g. 142 Galle Road, Colombo 03"
              value={businessAddress}
              onChange={(e) => {
                setBusinessAddress(e.target.value);
                if (fieldErrors.businessAddress) setFieldErrors((prev) => ({ ...prev, businessAddress: undefined! }));
              }}
              disabled={isLoading}
              autoComplete="street-address"
            />
            {fieldErrors.businessAddress && <span className="login-field__error">{fieldErrors.businessAddress}</span>}
          </div>

          {/* Phone Number */}
          <div className="login-field">
            <label className="login-field__label" htmlFor="phoneNumber">
              Business Phone Number
            </label>
            <div className="phone-input-group">
              <span className="phone-prefix" aria-hidden="true">+94</span>
              <input
                id="phoneNumber"
                type="tel"
                className={`login-field__input ${fieldErrors.phoneNumber ? 'login-field__input--error' : ''}`}
                placeholder="77 123 4567"
                value={phoneNumber}
                onChange={(e) => {
                  setPhoneNumber(e.target.value);
                  if (fieldErrors.phoneNumber) setFieldErrors((prev) => ({ ...prev, phoneNumber: undefined! }));
                }}
                disabled={isLoading}
                autoComplete="tel"
              />
            </div>
            {fieldErrors.phoneNumber && <span className="login-field__error">{fieldErrors.phoneNumber}</span>}
          </div>

          {/* Passwords */}
          <div className="form-grid-two">
            <div className="login-field">
              <label className="login-field__label" htmlFor="password">
                Password <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: 'normal' }}>(Min. 12)</span>
              </label>
              <div className="login-input-wrapper">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className={`login-field__input login-field__input--has-icon ${fieldErrors.password ? 'login-field__input--error' : ''}`}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined! }));
                  }}
                  disabled={isLoading}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {fieldErrors.password && <span className="login-field__error">{fieldErrors.password}</span>}
            </div>

            <div className="login-field">
              <label className="login-field__label" htmlFor="confirmPassword">
                Confirm Password
              </label>
              <div className="login-input-wrapper">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  className={`login-field__input login-field__input--has-icon ${fieldErrors.confirmPassword ? 'login-field__input--error' : ''}`}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (fieldErrors.confirmPassword) setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined! }));
                  }}
                  disabled={isLoading}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                >
                  {showConfirmPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {fieldErrors.confirmPassword && <span className="login-field__error">{fieldErrors.confirmPassword}</span>}
            </div>
          </div>

          <button type="submit" className="login-submit-btn" disabled={isLoading} style={{ marginTop: '12px' }}>
            {isLoading ? (
              <>
                <div className="spinner" aria-hidden="true" />
                <span>Submitting application...</span>
              </>
            ) : (
              <span>Submit Merchant Application</span>
            )}
          </button>
        </form>

        <footer className="login-card__footer">
          <Link to="/register" className="login-forgot-btn" style={{ textDecoration: 'none' }}>
            ← Change account type
          </Link>
          <span style={{ margin: '0 8px', color: '#d1d5db' }}>|</span>
          <Link to="/login" className="login-register-btn" style={{ textDecoration: 'none' }}>
            Log in
          </Link>
        </footer>
      </main>
    </div>
  );
}


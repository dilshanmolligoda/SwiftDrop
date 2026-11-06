import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { env } from '../../lib/env';
import { SwiftDropLogo } from './components/SwiftDropLogo';
import { GoogleIcon } from './components/GoogleIcon';
import './LoginPage.css';

interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: 'CUSTOMER' | 'MERCHANT' | 'COURIER' | 'DISPATCHER' | 'ADMIN';
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
}

function getInitialOAuthError(): string | null {
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const oauthError = searchParams.get('error');
    if (oauthError) {
      switch (oauthError) {
        case 'account_exists_link_required':
          return 'An account with this email already exists. Please sign in with your email and password first, then connect your Google account from your dashboard.';
        case 'google_not_configured':
          return 'Google Sign-In is not currently configured on the server. Please sign in with your email and password.';
        case 'access_denied':
          return 'Google Sign-In was cancelled or access was denied.';
        case 'account_deactivated':
          return 'This account has been deactivated. Please contact support.';
        case 'email_unverified':
          return 'Your Google email address is not verified. Please verify it with Google and try again.';
        case 'oauth_invalid_state':
        case 'oauth_missing_state':
          return 'Google authentication session expired or invalid. Please try again.';
        default:
          return 'Google Sign-In could not be completed. Please try again.';
      }
    }
  } catch {
    // fallback
  }
  return null;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(getInitialOAuthError);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [authenticatedUser, setAuthenticatedUser] = useState<AuthenticatedUser | null>(null);

  const [featureNotice, setFeatureNotice] = useState<string | null>(null);

  // Application initialization: verify if an active session exists via HTTP-only cookie
  useEffect(() => {
    let isMounted = true;

    // Purge any legacy tokens from previous browser-storage versions
    try {
      localStorage.removeItem('swiftdrop_access_token');
      localStorage.removeItem('swiftdrop_user');
      sessionStorage.removeItem('swiftdrop_access_token');
      sessionStorage.removeItem('swiftdrop_user');
    } catch {
      // Storage access may be restricted in some iframe or privacy contexts
    }

    const checkSession = async () => {
      try {
        const response = await fetch(`${env.apiBaseUrl}/auth/me`, {
          method: 'GET',
          credentials: 'include',
        });

        if (!isMounted) return;

        if (response.ok) {
          const userProfile = (await response.json()) as AuthenticatedUser;
          setAuthenticatedUser(userProfile);
        } else if (response.status === 401) {
          // No active session or cookie expired: cleanly display login form
          setAuthenticatedUser(null);
        } else {
          setSessionNotice(`Session check failed (HTTP ${response.status}). Please try logging in.`);
        }
      } catch {
        // Network error: do not silently assume the user is unauthenticated
        if (isMounted) {
          setSessionNotice('Unable to connect to SwiftDrop server. Please ensure the backend is running.');
        }
      } finally {
        if (isMounted) {
          setIsCheckingSession(false);
        }
      }
    };

    void checkSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const validateForm = (): boolean => {
    const errors: { email?: string; password?: string } = {};

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      errors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = 'Please enter a valid email address';
    }

    if (!password) {
      errors.password = 'Password is required';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSessionNotice(null);
    setFeatureNotice(null);

    if (!validateForm() || isLoading) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${env.apiBaseUrl}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          setErrorMessage('Invalid email or password. Please try again.');
          return;
        }

        if (response.status === 403) {
          setErrorMessage('Request rejected: unauthorized origin or CSRF check failed.');
          return;
        }

        if (response.status === 400) {
          const badRequest = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
          const msg = Array.isArray(badRequest?.message) ? badRequest?.message.join(', ') : badRequest?.message;
          setErrorMessage(msg || 'Invalid credentials format.');
          return;
        }

        setErrorMessage(`Server error (HTTP ${response.status}). Please try again later.`);
        return;
      }

      // Successful login sets HTTP-only cookie in browser.
      // Now fetch the authoritative user profile using the established session cookie.
      const profileResponse = await fetch(`${env.apiBaseUrl}/auth/me`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!profileResponse.ok) {
        setErrorMessage('Authentication succeeded but failed to load user profile. Please try again.');
        return;
      }

      const userProfile = (await profileResponse.json()) as AuthenticatedUser;
      setAuthenticatedUser(userProfile);
      setPassword('');
      setFieldErrors({});

      if (userProfile.approvalStatus === 'PENDING' || userProfile.approvalStatus === 'REJECTED') {
        navigate('/application-status', { replace: true });
        return;
      }

      if (userProfile.role === 'CUSTOMER') {
        navigate('/customer/dashboard', { replace: true });
        return;
      }

      if (userProfile.role === 'MERCHANT') {
        navigate('/merchant/dashboard', { replace: true });
        return;
      }

      if (userProfile.role === 'COURIER') {
        navigate('/courier/dashboard', { replace: true });
        return;
      }

      if (userProfile.role === 'ADMIN' || userProfile.role === 'DISPATCHER') {
        navigate('/admin-landing', { replace: true });
        return;
      }
    } catch {
      setErrorMessage('Unable to connect to SwiftDrop server. Please ensure the backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${env.apiBaseUrl}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Proceed to reset frontend state even if network fails
    } finally {
      setAuthenticatedUser(null);
      setEmail('');
      setPassword('');
      setErrorMessage(null);
      setSessionNotice(null);
      setFeatureNotice(null);
      setFieldErrors({});
    }
  };

  const showUnderDevelopmentNotice = (feature: string) => {
    setFeatureNotice(`${feature} is planned for a later phase.`);
  };

  return (
    <div className="login-page">
      {/* Background with fluid organic curves mirroring Figma */}
      <div className="login-page__bg" aria-hidden="true">
        <svg
          viewBox="0 0 1440 900"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
        >
          {/* Base gradient */}
          <rect width="1440" height="900" fill="url(#bg-gradient)" />

          {/* Deep back wave */}
          <path
            d="M-100 450C250 320 480 620 900 480C1220 370 1380 490 1540 420V900H-100V450Z"
            fill="#062817"
            fillOpacity="0.45"
          />

          {/* Upper left organic ribbon wave */}
          <path
            d="M-50 180C160 90 320 280 580 240C780 210 920 80 1100 120C1300 160 1420 80 1500 40V-50H-50V180Z"
            fill="#0f5231"
            fillOpacity="0.38"
          />

          {/* Mid prominent curve passing behind card */}
          <path
            d="M-80 320C180 210 380 430 750 340C1080 260 1280 390 1520 310V520C1320 600 1100 480 750 560C380 650 160 480 -80 570V320Z"
            fill="#125f39"
            fillOpacity="0.28"
          />

          {/* Sweeping bottom wave */}
          <path
            d="M-50 680C280 580 520 820 960 700C1240 620 1400 710 1520 680V950H-50V680Z"
            fill="#0d4a2c"
            fillOpacity="0.4"
          />

          <defs>
            <linearGradient id="bg-gradient" x1="0" y1="0" x2="1440" y2="900" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#083820" />
              <stop offset="50%" stopColor="#0a4025" />
              <stop offset="100%" stopColor="#062716" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Main Login Card */}
      <main className="login-card" role="main">
        {/* Header: Logo, Title, Subtitle */}
        <header className="login-card__header">
          <SwiftDropLogo size={28} />
          <h1 className="login-card__title">Welcome back</h1>
          <p className="login-card__subtitle">Log in to manage your deliveries.</p>
        </header>

        {isCheckingSession ? (
          /* Initial Session Verification State */
          <div className="login-init-spinner">
            <div className="spinner spinner--dark" aria-hidden="true" />
          </div>
        ) : authenticatedUser ? (
          /* Logged In View */
          <div className="login-success-state">
            <div className="login-alert login-alert--success">
              You are currently logged in to SwiftDrop.
            </div>

            <div className="user-profile-badge">
              <span className="user-profile-badge__role">{authenticatedUser.role}</span>
              <h2 className="user-profile-badge__name">{authenticatedUser.fullName}</h2>
              <p className="user-profile-badge__email">{authenticatedUser.email}</p>
            </div>

            <button type="button" className="login-logout-btn" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        ) : (
          /* Form View */
          <>
            {/* Google OAuth Button */}
            <button
              type="button"
              className="login-google-btn"
              onClick={() => {
                window.location.href = `${env.apiBaseUrl}/auth/google`;
              }}
              aria-label="Continue with Google"
            >
              <GoogleIcon size={18} />
              <span>Continue with Google</span>
            </button>

            {featureNotice && <div className="feature-notice">{featureNotice}</div>}

            {/* Divider */}
            <div className="login-divider">
              <span className="login-divider__text">or log in with email</span>
            </div>

            {/* Session / Connection Notice */}
            {sessionNotice && (
              <div className="login-alert login-alert--warning" role="alert">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" style={{ flexShrink: 0 }}>
                  <path
                    fillRule="evenodd"
                    d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>{sessionNotice}</span>
              </div>
            )}

            {/* Error Banner */}
            {errorMessage && (
              <div className="login-alert login-alert--error" role="alert">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" style={{ flexShrink: 0 }}>
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Login Form */}
            <form className="login-form" onSubmit={handleLoginSubmit} noValidate>
              {/* Email Address */}
              <div className="login-field">
                <label className="login-field__label" htmlFor="email-input">
                  Email address
                </label>
                <div className="login-input-wrapper">
                  <input
                    id="email-input"
                    type="email"
                    className={`login-field__input ${fieldErrors.email ? 'login-field__input--error' : ''}`}
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldErrors.email) {
                        setFieldErrors((prev) => ({ ...prev, email: undefined }));
                      }
                    }}
                    autoComplete="email"
                    disabled={isLoading}
                  />
                </div>
                {fieldErrors.email && <span className="login-field__error">{fieldErrors.email}</span>}
              </div>

              {/* Password */}
              <div className="login-field">
                <label className="login-field__label" htmlFor="password-input">
                  Password
                </label>
                <div className="login-input-wrapper">
                  <input
                    id="password-input"
                    type={showPassword ? 'text' : 'password'}
                    className={`login-field__input login-field__input--has-icon ${
                      fieldErrors.password ? 'login-field__input--error' : ''
                    }`}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldErrors.password) {
                        setFieldErrors((prev) => ({ ...prev, password: undefined }));
                      }
                    }}
                    autoComplete="current-password"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    className="login-password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={0}
                  >
                    {showPassword ? (
                      /* Eye-off icon */
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      /* Eye icon */
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
                {fieldErrors.password && <span className="login-field__error">{fieldErrors.password}</span>}
              </div>

              {/* Forgot Password Link (Remember Me checkbox removed) */}
              <div className="login-options login-options--forgot-only">
                <button
                  type="button"
                  className="login-forgot-btn"
                  onClick={() => showUnderDevelopmentNotice('Password reset')}
                >
                  Forgot password?
                </button>
              </div>

              {/* Log In Button */}
              <button type="submit" className="login-submit-btn" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <div className="spinner" aria-hidden="true" />
                    <span>Logging in...</span>
                  </>
                ) : (
                  <span>Log in</span>
                )}
              </button>
            </form>

            {/* Register Link */}
            <footer className="login-card__footer">
              <span>Don't have an account?</span>
              <Link to="/register" className="login-register-btn" style={{ textDecoration: 'none' }}>
                Register
              </Link>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

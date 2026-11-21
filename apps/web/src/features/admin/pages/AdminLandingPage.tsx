import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { env } from '../../../lib/env';
import { SwiftDropLogo } from '../../auth/components/SwiftDropLogo';
import { AuthBackground } from '../../auth/components/AuthBackground';
import '../../auth/LoginPage.css';

interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: 'CUSTOMER' | 'MERCHANT' | 'COURIER' | 'DISPATCHER' | 'ADMIN';
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export default function AdminLandingPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchSession = async () => {
    try {
      const response = await fetch(`${env.apiBaseUrl}/auth/me`, {
        method: 'GET',
        credentials: 'include',
      });

      if (response.status === 401) {
        navigate('/login', { replace: true });
        return;
      }

      if (!response.ok) {
        setErrorMessage(`Session verification failed (HTTP ${response.status}).`);
        return;
      }

      const userProfile = (await response.json()) as AuthenticatedUser;

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
        setUser(userProfile);
        navigate('/admin/dashboard', { replace: true });
        return;
      }

      navigate('/login', { replace: true });
    } catch {
      setErrorMessage('Unable to connect to SwiftDrop server. Please ensure the backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetry = () => {
    setIsLoading(true);
    setErrorMessage(null);
    void fetchSession();
  };

  const handleLogout = async () => {
    try {
      await fetch(`${env.apiBaseUrl}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Proceed even on network error
    } finally {
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="login-page">
      <AuthBackground />
      <main className="login-card" role="main">
        <header className="login-card__header">
          <SwiftDropLogo size={28} />
          <h1 className="login-card__title">
            {user ? `Welcome, ${user.fullName}` : 'Welcome back'}
          </h1>
          <p className="login-card__subtitle">
            The full admin/dispatcher dashboard is under development.
          </p>
        </header>

        {isLoading ? (
          <div className="login-init-spinner">
            <div className="spinner spinner--dark" aria-hidden="true" />
          </div>
        ) : errorMessage ? (
          <div>
            <div className="login-alert login-alert--error" role="alert">
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              className="login-submit-btn"
              onClick={handleRetry}
              style={{ marginTop: '16px' }}
            >
              Retry
            </button>
            <button
              type="button"
              className="login-logout-btn"
              onClick={handleLogout}
              style={{ marginTop: '12px' }}
            >
              Sign out
            </button>
          </div>
        ) : user ? (
          <div className="login-success-state">
            <div className="user-profile-badge">
              <span className="user-profile-badge__role">{user.role}</span>
              <h2 className="user-profile-badge__name">{user.fullName}</h2>
              {user.email && <p className="user-profile-badge__email">{user.email}</p>}
            </div>

            <button type="button" className="login-logout-btn" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        ) : null}
      </main>
    </div>
  );
}

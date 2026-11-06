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

export default function MerchantDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const checkSession = async () => {
      try {
        const response = await fetch(`${env.apiBaseUrl}/auth/me`, {
          method: 'GET',
          credentials: 'include',
        });

        if (!isMounted) return;

        if (response.status === 401) {
          navigate('/login', { replace: true });
          return;
        }

        if (response.ok) {
          const userProfile = (await response.json()) as AuthenticatedUser;
          if (!isMounted) return;

          if (userProfile.approvalStatus === 'PENDING' || userProfile.approvalStatus === 'REJECTED') {
            navigate('/application-status', { replace: true });
            return;
          }

          setUser(userProfile);
        }
      } catch {
        // Network error handled gracefully
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void checkSession();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

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
            {user?.fullName ? `Welcome, ${user.fullName}` : 'Merchant Dashboard'}
          </h1>
          <p className="login-card__subtitle">
            The full merchant dashboard is under development.
          </p>
        </header>

        {isLoading ? (
          <div className="login-init-spinner">
            <div className="spinner spinner--dark" aria-hidden="true" />
          </div>
        ) : (
          <div className="login-success-state">
            <div className="user-profile-badge">
              <span className="user-profile-badge__role">{user?.role ?? 'MERCHANT'}</span>
              <h2 className="user-profile-badge__name">{user?.fullName ?? 'Authenticated Merchant'}</h2>
              {user?.email && <p className="user-profile-badge__email">{user.email}</p>}
            </div>

            <button type="button" className="login-logout-btn" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { env } from '../../../lib/env';
import { SwiftDropLogo } from '../../auth/components/SwiftDropLogo';
import { AuthBackground } from '../../auth/components/AuthBackground';
import { GoogleIcon } from '../../auth/components/GoogleIcon';
import '../../auth/LoginPage.css';

interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: 'CUSTOMER' | 'MERCHANT' | 'COURIER' | 'DISPATCHER' | 'ADMIN';
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  isGoogleLinked?: boolean;
}

function getInitialLinkNotice(): { type: 'success' | 'error'; message: string } | null {
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const linkSuccess = searchParams.get('link_success');
    const linkError = searchParams.get('link_error');

    if (linkSuccess === 'google_connected') {
      return {
        type: 'success',
        message: 'Google account successfully connected!',
      };
    }
    if (linkError) {
      switch (linkError) {
        case 'email_mismatch':
          return {
            type: 'error',
            message: 'Cannot link Google account: the Google email does not match your SwiftDrop account email.',
          };
        case 'google_already_linked':
          return {
            type: 'error',
            message: 'This Google identity is already connected to another SwiftDrop account.',
          };
        case 'already_has_google':
          return {
            type: 'error',
            message: 'Your account is already linked to a Google account.',
          };
        case 'access_denied':
          return {
            type: 'error',
            message: 'Google account linking was cancelled.',
          };
        default:
          return {
            type: 'error',
            message: 'Failed to connect Google account. Please try again.',
          };
      }
    }
  } catch {
    // URL parsing fallback
  }
  return null;
}

export default function CustomerDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [linkNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(getInitialLinkNotice);

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
            {user?.fullName ? `Welcome, ${user.fullName}` : 'Customer Dashboard'}
          </h1>
          <p className="login-card__subtitle">
            The full customer dashboard is under development.
          </p>
        </header>

        {linkNotice && (
          <div
            className={`login-alert ${linkNotice.type === 'success' ? 'login-alert--success' : 'login-alert--error'}`}
            role="alert"
          >
            <span>{linkNotice.message}</span>
          </div>
        )}

        {isLoading ? (
          <div className="login-init-spinner">
            <div className="spinner spinner--dark" aria-hidden="true" />
          </div>
        ) : (
          <div className="login-success-state">
            <div className="user-profile-badge">
              <span className="user-profile-badge__role">{user?.role ?? 'CUSTOMER'}</span>
              <h2 className="user-profile-badge__name">{user?.fullName ?? 'Authenticated Customer'}</h2>
              {user?.email && <p className="user-profile-badge__email">{user.email}</p>}
            </div>

            <div style={{ marginTop: '16px', marginBottom: '16px' }}>
              {user?.isGoogleLinked ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 14px',
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: '8px',
                    color: '#15803d',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                >
                  <GoogleIcon size={16} />
                  <span>Google Account Connected</span>
                </div>
              ) : (
                <button
                  type="button"
                  className="login-google-btn"
                  onClick={() => {
                    window.location.href = `${env.apiBaseUrl}/auth/google/link`;
                  }}
                  style={{ width: '100%' }}
                >
                  <GoogleIcon size={18} />
                  <span>Connect Google Account</span>
                </button>
              )}
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

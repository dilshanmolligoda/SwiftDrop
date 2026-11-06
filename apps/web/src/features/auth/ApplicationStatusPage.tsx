import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { env } from '../../lib/env';
import { SwiftDropLogo } from './components/SwiftDropLogo';
import { AuthBackground } from './components/AuthBackground';
import './LoginPage.css';
import './RegisterPage.css';

interface ApplicationStatusData {
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  role: 'CUSTOMER' | 'MERCHANT' | 'COURIER' | 'DISPATCHER' | 'ADMIN';
  submittedAt: string;
  createdAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
}

export default function ApplicationStatusPage() {
  const [statusData, setStatusData] = useState<ApplicationStatusData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const navigate = useNavigate();

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`${env.apiBaseUrl}/auth/application-status`, {
        method: 'GET',
        credentials: 'include',
      });

      if (response.status === 401) {
        navigate('/login', { replace: true });
        return;
      }

      if (!response.ok) {
        setErrorMessage(`Failed to fetch application status (HTTP ${response.status}).`);
        return;
      }

      const data = (await response.json()) as ApplicationStatusData;
      setStatusData(data);

      if (data.approvalStatus === 'APPROVED') {
        if (data.role === 'CUSTOMER') {
          navigate('/customer/dashboard', { replace: true });
        } else if (data.role === 'MERCHANT') {
          navigate('/merchant/dashboard', { replace: true });
        } else if (data.role === 'COURIER') {
          navigate('/courier/dashboard', { replace: true });
        } else if (data.role === 'ADMIN' || data.role === 'DISPATCHER') {
          navigate('/admin-landing', { replace: true });
        }
      }
    } catch {
      setErrorMessage('Unable to communicate with the server. Please check your network connection.');
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    let isMounted = true;

    const initialFetch = async () => {
      try {
        const response = await fetch(`${env.apiBaseUrl}/auth/application-status`, {
          method: 'GET',
          credentials: 'include',
        });

        if (!isMounted) return;

        if (response.status === 401) {
          navigate('/login', { replace: true });
          return;
        }

        if (!response.ok) {
          setErrorMessage(`Failed to fetch application status (HTTP ${response.status}).`);
          return;
        }

        const data = (await response.json()) as ApplicationStatusData;
        setStatusData(data);

        if (data.approvalStatus === 'APPROVED') {
          if (data.role === 'CUSTOMER') {
            navigate('/customer/dashboard', { replace: true });
          } else if (data.role === 'MERCHANT') {
            navigate('/merchant/dashboard', { replace: true });
          } else if (data.role === 'COURIER') {
            navigate('/courier/dashboard', { replace: true });
          } else if (data.role === 'ADMIN' || data.role === 'DISPATCHER') {
            navigate('/admin-landing', { replace: true });
          }
        }
      } catch {
        if (isMounted) {
          setErrorMessage('Unable to communicate with the server. Please check your network connection.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void initialFetch();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const handleManualRefresh = () => {
    void fetchStatus();
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch(`${env.apiBaseUrl}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Proceed to login even on network error
    } finally {
      navigate('/login', { replace: true });
    }
  };

  const formatDate = (isoString?: string | null): string => {
    if (!isoString) return '—';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="login-page">
      <AuthBackground />

      <main className="login-card register-card" role="main">
        <header className="login-card__header">
          <SwiftDropLogo size={28} />
          <h1 className="login-card__title">Application Status</h1>
          <p className="login-card__subtitle">SwiftDrop Account Verification</p>
        </header>

        {isLoading ? (
          <div className="login-init-spinner" style={{ padding: '40px 0' }}>
            <div className="spinner spinner--dark" aria-hidden="true" />
            <p style={{ marginTop: '14px', fontSize: '13px', color: '#6b7280' }}>
              Checking application status...
            </p>
          </div>
        ) : errorMessage ? (
          <div>
            <div className="login-alert login-alert--error" role="alert">
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              className="login-submit-btn"
              onClick={handleManualRefresh}
              style={{ marginTop: '16px' }}
            >
              Retry
            </button>
            <button
              type="button"
              className="login-logout-btn"
              onClick={handleLogout}
              style={{ marginTop: '12px' }}
              disabled={isLoggingOut}
            >
              Sign out
            </button>
          </div>
        ) : statusData?.approvalStatus === 'PENDING' ? (
          /* =========================================================================
             PENDING STATUS STATE
             ========================================================================= */
          <div>
            <div style={{ textAlign: 'center' }}>
              <span className="status-badge status-badge--pending">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                Under Review
              </span>
            </div>

            <div className="status-stepper" aria-label="Application Progress">
              {/* Step 1: Submitted */}
              <div className="status-step status-step--completed">
                <div className="status-step__circle" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <span className="status-step__label">Submitted</span>
              </div>

              {/* Step 2: Under Review */}
              <div className="status-step status-step--active">
                <div className="status-step__circle" aria-hidden="true">
                  2
                </div>
                <span className="status-step__label">Under Review</span>
              </div>

              {/* Step 3: Decision */}
              <div className="status-step">
                <div className="status-step__circle" aria-hidden="true">
                  3
                </div>
                <span className="status-step__label">Decision</span>
              </div>
            </div>

            <div className="status-meta-card">
              <div className="status-meta-row">
                <span className="status-meta-label">Account Type</span>
                <span className="status-meta-value">{statusData.role}</span>
              </div>
              <div className="status-meta-row">
                <span className="status-meta-label">Submitted On</span>
                <span className="status-meta-value">{formatDate(statusData.submittedAt || statusData.createdAt)}</span>
              </div>
              <div className="status-meta-row">
                <span className="status-meta-label">Current Status</span>
                <span className="status-meta-value" style={{ color: '#b45309' }}>
                  Awaiting review
                </span>
              </div>
            </div>

            <p style={{ fontSize: '13px', color: '#6b7280', textAlign: 'center', lineHeight: 1.5, margin: '0 0 20px' }}>
              Your application has been received and is currently being reviewed by our dispatch administrators.
            </p>

            <div className="status-action-row">
              <button
                type="button"
                className="login-submit-btn"
                style={{ flex: 1, backgroundColor: '#059669' }}
                onClick={handleManualRefresh}
              >
                Refresh Status
              </button>
              <button
                type="button"
                className="login-logout-btn"
                style={{ flex: 1, margin: 0 }}
                onClick={handleLogout}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? 'Signing out...' : 'Sign out'}
              </button>
            </div>
          </div>
        ) : statusData?.approvalStatus === 'REJECTED' ? (
          /* =========================================================================
             REJECTED STATUS STATE
             ========================================================================= */
          <div>
            <div style={{ textAlign: 'center' }}>
              <span className="status-badge status-badge--rejected">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                Application Rejected
              </span>
            </div>

            {statusData.rejectionReason && (
              <div className="rejection-box" role="alert">
                <h3 className="rejection-box__title">Reviewer Feedback</h3>
                <p className="rejection-box__reason">{statusData.rejectionReason}</p>
              </div>
            )}

            <div className="status-meta-card">
              <div className="status-meta-row">
                <span className="status-meta-label">Account Type</span>
                <span className="status-meta-value">{statusData.role}</span>
              </div>
              <div className="status-meta-row">
                <span className="status-meta-label">Submitted On</span>
                <span className="status-meta-value">{formatDate(statusData.submittedAt || statusData.createdAt)}</span>
              </div>
              {statusData.reviewedAt && (
                <div className="status-meta-row">
                  <span className="status-meta-label">Reviewed On</span>
                  <span className="status-meta-value">{formatDate(statusData.reviewedAt)}</span>
                </div>
              )}
            </div>

            <p style={{ fontSize: '13px', color: '#6b7280', textAlign: 'center', lineHeight: 1.5, margin: '0 0 20px' }}>
              Unfortunately, your application could not be approved at this time based on the review criteria above.
            </p>

            <button
              type="button"
              className="login-logout-btn"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        ) : (
          /* =========================================================================
             APPROVED STATUS STATE
             ========================================================================= */
          <div>
            <div style={{ textAlign: 'center' }}>
              <span className="status-badge status-badge--approved">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Approved
              </span>
            </div>

            <p style={{ textAlign: 'center', fontSize: '14px', color: '#374151', margin: '16px 0 24px' }}>
              Your account has been approved and is fully active.
            </p>

            <button
              type="button"
              className="login-submit-btn"
              onClick={() => {
                if (statusData?.role === 'CUSTOMER') {
                  navigate('/customer/settings');
                } else if (statusData?.role === 'ADMIN' || statusData?.role === 'DISPATCHER') {
                  navigate('/admin/dashboard');
                } else {
                  navigate('/');
                }
              }}
            >
              Proceed to Dashboard
            </button>

            <button
              type="button"
              className="login-logout-btn"
              onClick={handleLogout}
              style={{ marginTop: '12px' }}
              disabled={isLoggingOut}
            >
              Sign out
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

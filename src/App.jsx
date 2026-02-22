import { useState, useEffect } from 'react'
import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser'
import { MsalProvider, useMsal, useIsAuthenticated } from '@azure/msal-react'
import { initAuthConfig } from './authConfig'
import TaskDashboard from './TaskDashboard'

// ── Login screen (only shown in SharePoint mode when not authenticated) ──
function LoginScreen({ inTeams }) {
  const { instance, inProgress } = useMsal();
  const [error, setError] = useState(null);
  const [logging, setLogging] = useState(false);

  const handleLogin = async () => {
    if (inProgress !== 'none') return; // MSAL is busy
    setError(null);
    setLogging(true);

    const request = { scopes: ['User.Read'] };

    if (inTeams) {
      // Teams iframe: popup is blocked, use redirect
      try {
        await instance.loginRedirect(request);
      } catch (err) {
        setError(err.message);
        setLogging(false);
      }
    } else {
      // Normal browser: try popup, fallback to redirect
      try {
        await instance.loginPopup(request);
      } catch (err) {
        if (err.errorCode === 'popup_window_error' || err.errorCode === 'empty_window_error' ||
            err.errorCode === 'block_nested_popups' || err.message?.includes('popup')) {
          // Popup blocked → fallback to redirect
          try {
            await instance.loginRedirect(request);
          } catch (err2) {
            setError(err2.message);
            setLogging(false);
          }
        } else {
          setError(err.message);
          setLogging(false);
        }
      }
    }
  };

  return (
    <div style={{
      fontFamily: "'Segoe UI',system-ui,sans-serif",
      background: '#0f172a', minHeight: '100vh', color: '#e2e8f0',
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        background: '#1e293b', borderRadius: 16, border: '1px solid #334155',
        padding: '48px 40px', textAlign: 'center', maxWidth: 420
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16, margin: '0 auto 20px',
          background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, fontWeight: 700
        }}>T</div>
        <h1 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 700, color: '#f8fafc' }}>
          Task Manager K2
        </h1>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: '#64748b' }}>
          Zaloguj się kontem Microsoft 365, aby uzyskać dostęp do systemu zarządzania zadaniami.
        </p>
        <button onClick={handleLogin} disabled={logging || inProgress !== 'none'} style={{
          padding: '12px 32px', borderRadius: 8, border: 'none',
          background: logging ? '#475569' : 'linear-gradient(135deg,#3b82f6,#2563eb)',
          color: '#fff', fontSize: 14, fontWeight: 600,
          cursor: logging ? 'wait' : 'pointer',
          display: 'flex', alignItems: 'center', gap: 10, margin: '0 auto',
          transition: 'transform .1s', boxShadow: '0 4px 12px #3b82f640',
          opacity: logging ? 0.7 : 1,
        }}>
          {logging ? (
            <>Logowanie...</>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 21 21" fill="none">
                <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
              </svg>
              Zaloguj przez Microsoft
            </>
          )}
        </button>
        {error && (
          <div style={{
            marginTop: 16, padding: '8px 12px', borderRadius: 8,
            background: '#ef444420', border: '1px solid #ef444440',
            color: '#ef4444', fontSize: 12
          }}>{error}</div>
        )}
      </div>
    </div>
  );
}

// ── Authenticated wrapper (MSAL production mode) ──
function AuthenticatedApp({ inTeams }) {
  const isAuthenticated = useIsAuthenticated();
  const { accounts } = useMsal();

  if (!isAuthenticated) {
    return <LoginScreen inTeams={inTeams} />;
  }

  const userName = accounts[0]?.name || accounts[0]?.username || '';
  return <TaskDashboard msalUser={userName} />;
}

// ── Main App with dynamic auth detection ──
function App() {
  const [authState, setAuthState] = useState({ loading: true, mode: 'local', msalInstance: null, inTeams: false });

  useEffect(() => {
    async function loadAuth() {
      const config = await initAuthConfig();

      if (config.mode === 'sharepoint' && config.msalConfig) {
        try {
          const msalInstance = new PublicClientApplication(config.msalConfig);
          await msalInstance.initialize();

          // Handle redirect response (after loginRedirect returns from Azure)
          try {
            const response = await msalInstance.handleRedirectPromise();
            if (response) {
              console.log('[Auth] Redirect login successful:', response.account?.name);
            }
          } catch (err) {
            console.error('[Auth] Redirect handling error:', err);
          }

          setAuthState({ loading: false, mode: 'sharepoint', msalInstance, inTeams: config.inTeams });
        } catch (err) {
          console.error('[Auth] MSAL init failed:', err);
          setAuthState({ loading: false, mode: 'local', msalInstance: null, inTeams: false });
        }
      } else if (config.mode === 'sharepoint-dev') {
        setAuthState({ loading: false, mode: 'sharepoint-dev', msalInstance: null, inTeams: false });
      } else {
        setAuthState({ loading: false, mode: 'local', msalInstance: null, inTeams: false });
      }
    }
    loadAuth();
  }, []);

  if (authState.loading) {
    return (
      <div style={{
        fontFamily: "'Segoe UI',system-ui,sans-serif",
        background: '#0f172a', minHeight: '100vh', color: '#e2e8f0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 12
      }}>
        <div style={{
          width: 40, height: 40, border: '3px solid #334155', borderTopColor: '#3b82f6',
          borderRadius: '50%', animation: 'spin 0.8s linear infinite'
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <span style={{ fontSize: 14, color: '#94a3b8' }}>Łączenie z Microsoft 365...</span>
      </div>
    );
  }

  // SharePoint production mode — wrap in MSAL provider
  if (authState.mode === 'sharepoint' && authState.msalInstance) {
    return (
      <MsalProvider instance={authState.msalInstance}>
        <AuthenticatedApp inTeams={authState.inTeams} />
      </MsalProvider>
    );
  }

  // SharePoint dev mode — no auth, show dev indicator
  if (authState.mode === 'sharepoint-dev') {
    return <TaskDashboard msalUser="Dev (SharePoint)" />;
  }

  // Local mode — no auth
  return <TaskDashboard msalUser={null} />;
}

export default App

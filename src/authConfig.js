/**
 * MSAL configuration for Azure AD authentication.
 * Values are loaded from backend /api/config at runtime.
 *
 * Three modes:
 *   1. "local"          — no auth, data.json backend
 *   2. "sharepoint"     — MSAL login required (production with clientId)
 *   3. "sharepoint-dev" — no auth, SharePoint backend via GRAPH_TOKEN
 *
 * Teams support: uses loginRedirect (popup blocked in iframe).
 */

let msalConfig = null;
let loginRequest = null;

// Detect if running inside Microsoft Teams iframe
function isInTeams() {
  try {
    if (window.self !== window.top) return true; // iframe
    if (window.navigator.userAgent.includes('Teams')) return true;
    if (window.location.ancestorOrigins?.length > 0) return true;
  } catch { return true; } // cross-origin iframe → blocked access = iframe
  return false;
}

export async function initAuthConfig() {
  try {
    const res = await fetch('/api/config');
    const config = await res.json();

    if (config.mode === 'sharepoint') {
      if (config.clientId && config.tenant) {
        const inTeams = isInTeams();

        msalConfig = {
          auth: {
            clientId: config.clientId,
            authority: `https://login.microsoftonline.com/${config.tenant}`,
            redirectUri: window.location.origin,
            postLogoutRedirectUri: window.location.origin,
            navigateToLoginRequestUrl: true,
          },
          cache: {
            cacheLocation: inTeams ? 'localStorage' : 'sessionStorage',
            storeAuthStateInCookie: inTeams, // needed for IE/Edge in iframe
          },
        };

        loginRequest = {
          scopes: ['User.Read'],
        };

        return { mode: 'sharepoint', msalConfig, loginRequest, inTeams };
      }

      return { mode: 'sharepoint-dev', msalConfig: null, loginRequest: null, inTeams: false };
    }
  } catch (err) {
    console.log('[Auth] Backend not available or not configured, using local mode');
  }

  return { mode: 'local', msalConfig: null, loginRequest: null, inTeams: false };
}

export function getMsalConfig() {
  return msalConfig;
}

export function getLoginRequest() {
  return loginRequest;
}

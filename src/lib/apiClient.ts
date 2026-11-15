import { Capacitor } from '@capacitor/core';
import firebaseConfig from '../../firebase-applet-config.json';

export interface FirebaseProviderStatus {
  configValid: boolean;
  projectId: string;
  projectNumber?: string;
  firestoreDatabaseId: string;
  authInitialized: boolean;
  emailPasswordEnabled: boolean;
  statusCode: string;
  detailMessage: string;
  providersConsoleUrl?: string;
}

const RAW_API_BASE = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');

export function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function hasConfiguredApiBase(): boolean {
  return Boolean(RAW_API_BASE);
}

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return RAW_API_BASE ? `${RAW_API_BASE}${normalizedPath}` : normalizedPath;
}

export function normalizePhoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function adminPhoneToAuthEmail(phoneNormalized: string): string {
  return `admin_${phoneNormalized}@sagar-mgmt.local`;
}

export function memberPhoneToAuthEmail(phoneNormalized: string): string {
  return `m_${phoneNormalized}@sagar-mgmt.local`;
}

export async function fetchFirebaseProviderStatus(): Promise<FirebaseProviderStatus> {
  // When running on web or with a configured backend URL, query /api/auth/provider-status first
  if (!isNativePlatform() || hasConfiguredApiBase()) {
    try {
      const resp = await fetch(apiUrl('/api/auth/provider-status'));
      const contentType = resp.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return (await resp.json()) as FirebaseProviderStatus;
      }
    } catch {
      // Fall through to direct Firebase Auth REST probe when offline from Express backend
    }
  }

  const missingFields: string[] = [];
  if (!firebaseConfig.projectId || firebaseConfig.projectId === 'remixed-project-id') {
    missingFields.push('projectId');
  }
  if (!firebaseConfig.apiKey) missingFields.push('apiKey');
  if (!firebaseConfig.authDomain) missingFields.push('authDomain');
  if (!firebaseConfig.appId) missingFields.push('appId');

  if (missingFields.length > 0) {
    return {
      configValid: false,
      projectId: firebaseConfig.projectId || '',
      firestoreDatabaseId: firebaseConfig.firestoreDatabaseId || '(default)',
      authInitialized: false,
      emailPasswordEnabled: false,
      statusCode: 'MISSING_FIREBASE_CONFIG',
      detailMessage: `Missing Firebase configuration fields: ${missingFields.join(', ')}`,
    };
  }

  let projectNumber = firebaseConfig.messagingSenderId || '';
  let authInitialized = true;
  let emailPasswordEnabled = false;
  let statusCode = 'UNKNOWN';
  let detailMessage = '';

  try {
    const probeResp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: '__provider_probe_nonexistent__@sagar-mgmt.local',
          password: 'ProbeCheckPassword!99',
          returnSecureToken: true,
        }),
      }
    );
    const probeData = (await probeResp.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    const probeCode = probeData.error?.message || (probeResp.ok ? 'OK' : `HTTP_${probeResp.status}`);

    if (
      probeCode === 'EMAIL_NOT_FOUND' ||
      probeCode === 'INVALID_LOGIN_CREDENTIALS' ||
      probeCode === 'INVALID_PASSWORD' ||
      probeCode === 'TOO_MANY_ATTEMPTS_TRY_LATER' ||
      probeCode === 'OK'
    ) {
      emailPasswordEnabled = true;
      statusCode = 'ENABLED';
      detailMessage = `Email/Password Authentication is active on Firebase project ${firebaseConfig.projectId}.`;
    } else if (probeCode.includes('CONFIGURATION_NOT_FOUND')) {
      authInitialized = false;
      emailPasswordEnabled = false;
      statusCode = probeCode;
      detailMessage = `Firebase Authentication is not initialized on project ${firebaseConfig.projectId}.`;
    } else if (
      probeCode.includes('PASSWORD_LOGIN_DISABLED') ||
      probeCode.includes('OPERATION_NOT_ALLOWED')
    ) {
      emailPasswordEnabled = false;
      statusCode = probeCode;
      detailMessage = `Email/Password sign-in is disabled on Firebase project ${firebaseConfig.projectId}${projectNumber ? ` (#${projectNumber})` : ''} (${probeCode}).`;
    } else {
      statusCode = probeCode;
      detailMessage = `Firebase Auth returned status: ${probeCode}`;
    }
  } catch (err) {
    statusCode = 'NETWORK_ERROR';
    detailMessage = err instanceof Error ? err.message : 'Unable to reach Firebase Auth API.';
  }

  return {
    configValid: true,
    projectId: firebaseConfig.projectId,
    projectNumber,
    firestoreDatabaseId: firebaseConfig.firestoreDatabaseId || '(default)',
    authInitialized,
    emailPasswordEnabled,
    statusCode,
    detailMessage,
    providersConsoleUrl: `https://console.firebase.google.com/project/${encodeURIComponent(firebaseConfig.projectId)}/authentication/providers`,
  };
}

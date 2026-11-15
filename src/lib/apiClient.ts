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

export function shouldUseBackendApi(): boolean {
  return !isNativePlatform() || hasConfiguredApiBase();
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

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generates a salted PBKDF2-SHA512 hash in the browser/WebView without any external server.
 * Salt is prefixed with "pbkdf2:" so server.ts can verify both scrypt and pbkdf2 hashes.
 * Lengths match firestore.rules constraints (hash: 32..256 chars, salt: 16..128 chars).
 */
export async function hashPasswordClient(
  password: string,
  existingSalt?: string
): Promise<{ hash: string; salt: string }> {
  const saltBytes = new Uint8Array(16);
  if (!existingSalt) {
    crypto.getRandomValues(saltBytes);
  }
  const rawSaltHex = existingSalt?.startsWith('pbkdf2:')
    ? existingSalt.slice(7)
    : existingSalt || bytesToHex(saltBytes);
  const fullSalt = `pbkdf2:${rawSaltHex}`;

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(rawSaltHex),
      iterations: 100000,
      hash: 'SHA-512',
    },
    keyMaterial,
    512
  );
  return {
    hash: bytesToHex(new Uint8Array(derived)),
    salt: fullSalt,
  };
}

export function mapFirebaseAuthRestError(errCode: string): string {
  const projectId = firebaseConfig.projectId || 'configured project';
  if (
    errCode.includes('OPERATION_NOT_ALLOWED') ||
    errCode.includes('PASSWORD_LOGIN_DISABLED')
  ) {
    return `Email/Password sign-in is disabled on Firebase project "${projectId}" (${errCode}). Open Firebase Console → Authentication → Sign-in method → Email/Password → Enable → Save.`;
  }
  if (
    errCode.includes('ADMIN_ONLY_OPERATION') ||
    errCode.includes('EMAIL_SIGNUP_DISABLED')
  ) {
    return `User sign-up is disabled on Firebase project "${projectId}" (${errCode}). Open Firebase Console → Authentication → Settings → User actions → Enable create (sign-up).`;
  }
  if (errCode.includes('CONFIGURATION_NOT_FOUND')) {
    return `Firebase Authentication is not initialized on project "${projectId}" (${errCode}).`;
  }
  if (errCode.includes('WEAK_PASSWORD')) {
    return 'Password is too weak. Use at least 6 characters.';
  }
  if (
    errCode.includes('INVALID_PASSWORD') ||
    errCode.includes('INVALID_LOGIN_CREDENTIALS')
  ) {
    return 'Incorrect password.';
  }
  if (errCode.includes('TOO_MANY_ATTEMPTS_TRY_LATER')) {
    return 'Too many attempts. Please wait a few minutes and try again.';
  }
  return `Firebase Authentication error (${projectId}): ${errCode}`;
}

/**
 * Provisions or reuses a Firebase Auth Email/Password account directly via Firebase
 * Identity Toolkit REST API without disturbing the currently signed-in Admin session.
 */
export async function provisionFirebaseAuthUserDirect(params: {
  email: string;
  password: string;
  currentPassword?: string;
  displayName: string;
  conflictMessage?: string;
}): Promise<{ uid: string; email: string }> {
  const apiKey = encodeURIComponent(firebaseConfig.apiKey);

  const signUpResp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: params.email,
        password: params.password,
        displayName: params.displayName,
        returnSecureToken: true,
      }),
    }
  );
  const signUpData = (await signUpResp.json().catch(() => ({}))) as {
    localId?: string;
    error?: { message?: string };
  };

  if (signUpResp.ok && signUpData.localId) {
    return { uid: signUpData.localId, email: params.email };
  }

  const errCode = signUpData.error?.message || `HTTP_${signUpResp.status}`;
  if (errCode === 'EMAIL_EXISTS') {
    const checkPassword = params.currentPassword || params.password;
    const signInResp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: params.email,
          password: checkPassword,
          returnSecureToken: true,
        }),
      }
    );
    const signInData = (await signInResp.json().catch(() => ({}))) as {
      localId?: string;
      idToken?: string;
      error?: { message?: string };
    };

    if (signInResp.ok && signInData.localId && signInData.idToken) {
      if (params.currentPassword && params.currentPassword !== params.password) {
        const updateResp = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              idToken: signInData.idToken,
              password: params.password,
              displayName: params.displayName,
              returnSecureToken: true,
            }),
          }
        );
        if (!updateResp.ok) {
          const updErr = (await updateResp.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          throw new Error(
            mapFirebaseAuthRestError(updErr.error?.message || 'PASSWORD_UPDATE_FAILED')
          );
        }
      }
      return { uid: signInData.localId, email: params.email };
    }

    throw new Error(
      params.conflictMessage ||
        'An account for this mobile number already exists in Firebase Authentication with a different password.'
    );
  }

  throw new Error(mapFirebaseAuthRestError(errCode));
}

export async function updateFirebaseAuthPasswordDirect(params: {
  email: string;
  currentPassword: string;
  newPassword: string;
}): Promise<boolean> {
  const apiKey = encodeURIComponent(firebaseConfig.apiKey);
  const signInResp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: params.email,
        password: params.currentPassword,
        returnSecureToken: true,
      }),
    }
  );
  const signInData = (await signInResp.json().catch(() => ({}))) as {
    idToken?: string;
    error?: { message?: string };
  };

  if (!signInResp.ok || !signInData.idToken) {
    const code = signInData.error?.message || '';
    if (code.includes('INVALID_PASSWORD') || code.includes('INVALID_LOGIN_CREDENTIALS')) {
      throw new Error('Current password did not match this member account.');
    }
    throw new Error(mapFirebaseAuthRestError(code || `HTTP_${signInResp.status}`));
  }

  if (params.currentPassword === params.newPassword) {
    return true;
  }

  const updateResp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken: signInData.idToken,
        password: params.newPassword,
        returnSecureToken: true,
      }),
    }
  );
  if (!updateResp.ok) {
    const updData = (await updateResp.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(mapFirebaseAuthRestError(updData.error?.message || 'UPDATE_FAILED'));
  }
  return true;
}

export async function verifyPasswordMatchesAuthDirect(
  email: string,
  password: string
): Promise<boolean> {
  const apiKey = encodeURIComponent(firebaseConfig.apiKey);
  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: false,
        }),
      }
    );
    return resp.ok;
  } catch {
    return false;
  }
}

export async function fetchFirebaseProviderStatus(): Promise<FirebaseProviderStatus> {
  // When running on web or with a configured backend URL, query /api/auth/provider-status first
  if (shouldUseBackendApi()) {
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

  const projectNumber = firebaseConfig.messagingSenderId || '';
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

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { createServer as createViteServer } from 'vite';

dotenv.config();

interface FirebaseAppletConfig {
  projectId: string;
  appId?: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
}

const rootDir = process.cwd();
const configPath = path.join(rootDir, 'firebase-applet-config.json');
const firebaseConfig: FirebaseAppletConfig = JSON.parse(
  fs.readFileSync(configPath, 'utf-8')
);

const BOOTSTRAPPED_ADMIN_EMAIL = 'talukdarsagar07@gmail.com';
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto
    .createHash('sha256')
    .update(`${firebaseConfig.projectId}:${firebaseConfig.apiKey}:sagar-mgmt`)
    .digest('hex');

// Initialize Firebase Admin gracefully
let adminInitialized = false;
let adminApp: App | null = null;
let adminDb: ReturnType<typeof getAdminFirestore> | null = null;

try {
  const existingApps = getApps();
  if (existingApps.length > 0) {
    adminApp = existingApps[0];
  } else {
    const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (serviceAccountRaw) {
      const parsed = JSON.parse(serviceAccountRaw);
      adminApp = initializeApp({
        credential: cert(parsed),
        projectId: firebaseConfig.projectId,
      });
    } else {
      adminApp = initializeApp({
        projectId: firebaseConfig.projectId,
      });
    }
  }
  adminDb = firebaseConfig.firestoreDatabaseId
    ? getAdminFirestore(adminApp, firebaseConfig.firestoreDatabaseId)
    : getAdminFirestore(adminApp);
  adminInitialized = true;
} catch (err) {
  console.warn('Firebase Admin init warning:', err instanceof Error ? err.message : String(err));
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function phoneToAuthEmail(phoneNormalized: string): string {
  return `m_${phoneNormalized}@sagar-mgmt.local`;
}

function adminPhoneToAuthEmail(phoneNormalized: string): string {
  return `admin_${phoneNormalized}@sagar-mgmt.local`;
}

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  if (actualSalt.startsWith('pbkdf2:')) {
    const rawSalt = actualSalt.slice(7);
    const hash = crypto.pbkdf2Sync(password, rawSalt, 100000, 64, 'sha512').toString('hex');
    return { hash, salt: actualSalt };
  }
  const hash = crypto.scryptSync(password, actualSalt, 64).toString('hex');
  return { hash, salt: actualSalt };
}

function verifyPassword(password: string, storedHash: string, storedSalt: string): boolean {
  const { hash } = hashPassword(password, storedSalt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

interface MemberSessionPayload {
  memberId: string;
  memberUid: string;
  phone: string;
  role: 'member';
  exp: number;
}

function signMemberSession(payload: MemberSessionPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyMemberSession(token: string): MemberSessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as MemberSessionPayload;
    if (!parsed.memberId || !parsed.exp || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

interface VerifiedUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  isOwner: boolean;
  idToken: string;
}

function getFirestoreRestBase(): string {
  const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/${encodeURIComponent(dbId)}/documents`;
}

async function checkAdminDocViaRest(uid: string, idToken: string): Promise<boolean> {
  try {
    const resp = await fetch(`${getFirestoreRestBase()}/admins/${encodeURIComponent(uid)}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!resp.ok) return false;
    const doc = (await resp.json()) as {
      fields?: { role?: { stringValue?: string } };
    };
    return doc.fields?.role?.stringValue === 'admin';
  } catch {
    return false;
  }
}

async function checkAnyAdminCredentialExistsViaRest(idToken: string): Promise<boolean> {
  try {
    const resp = await fetch(`${getFirestoreRestBase()}/adminCredentials?pageSize=1`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!resp.ok) return false;
    const data = (await resp.json()) as { documents?: unknown[] };
    return Array.isArray(data.documents) && data.documents.length > 0;
  } catch {
    return false;
  }
}

async function verifyAdminBearerToken(authHeader: string | undefined): Promise<VerifiedUser | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const idToken = authHeader.slice(7).trim();
  if (!idToken) return null;

  // Verify token via Firebase Auth REST API (works without IAM private key)
  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      users?: Array<{ localId: string; email?: string; emailVerified?: boolean }>;
    };
    const user = data.users?.[0];
    if (!user?.localId) return null;

    const isBootstrapped =
      user.emailVerified === true && user.email === BOOTSTRAPPED_ADMIN_EMAIL;

    if (isBootstrapped) {
      return {
        uid: user.localId,
        email: user.email || '',
        emailVerified: Boolean(user.emailVerified),
        isOwner: true,
        idToken,
      };
    }

    if (adminDb) {
      try {
        const adminSnap = await adminDb.collection('admins').doc(user.localId).get();
        if (adminSnap.exists) {
          return {
            uid: user.localId,
            email: user.email || '',
            emailVerified: Boolean(user.emailVerified),
            isOwner: false,
            idToken,
          };
        }
      } catch {
        // Fallback to Firestore REST verification with caller's ID token when container lacks IAM creds
      }
    }

    const existsViaRest = await checkAdminDocViaRest(user.localId, idToken);
    if (existsViaRest) {
      return {
        uid: user.localId,
        email: user.email || '',
        emailVerified: Boolean(user.emailVerified),
        isOwner: false,
        idToken,
      };
    }

    return null;
  } catch {
    return null;
  }
}

async function startServer() {
  const app = express();
  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', async (_req, res) => {
    let adminFirestoreReady = false;
    if (adminDb) {
      try {
        await adminDb.collection('test').doc('connection').get();
        adminFirestoreReady = true;
      } catch {
        adminFirestoreReady = false;
      }
    }
    res.json({
      ok: true,
      projectId: firebaseConfig.projectId,
      firestoreDatabaseId: firebaseConfig.firestoreDatabaseId || '(default)',
      adminInitialized,
      adminFirestoreReady,
    });
  });

  app.get('/api/auth/provider-status', async (_req, res) => {
    const missingFields: string[] = [];
    if (!firebaseConfig.projectId || firebaseConfig.projectId === 'remixed-project-id') {
      missingFields.push('projectId');
    }
    if (!firebaseConfig.apiKey) missingFields.push('apiKey');
    if (!firebaseConfig.authDomain) missingFields.push('authDomain');
    if (!firebaseConfig.appId) missingFields.push('appId');

    if (missingFields.length > 0) {
      res.status(500).json({
        ok: false,
        configValid: false,
        missingFields,
        projectId: firebaseConfig.projectId || '',
        firestoreDatabaseId: firebaseConfig.firestoreDatabaseId || '(default)',
        emailPasswordEnabled: false,
        authInitialized: false,
        statusCode: 'MISSING_FIREBASE_CONFIG',
        detailMessage: `Missing or invalid Firebase configuration fields: ${missingFields.join(', ')}`,
      });
      return;
    }

    let projectNumber = '';
    let authorizedDomains: string[] = [];
    let authInitialized = true;
    let emailPasswordEnabled = false;
    let statusCode = 'UNKNOWN';
    let detailMessage = '';

    try {
      const cfgResp = await fetch(
        `https://www.googleapis.com/identitytoolkit/v3/relyingparty/getProjectConfig?key=${encodeURIComponent(firebaseConfig.apiKey)}`
      );
      if (cfgResp.ok) {
        const cfgData = (await cfgResp.json()) as {
          projectId?: string;
          authorizedDomains?: string[];
        };
        projectNumber = cfgData.projectId || '';
        authorizedDomains = cfgData.authorizedDomains || [];
      } else {
        const errBody = (await cfgResp.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        const cfgErr = errBody.error?.message || `HTTP_${cfgResp.status}`;
        if (cfgErr.includes('CONFIGURATION_NOT_FOUND')) {
          authInitialized = false;
        }
      }

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
        detailMessage = `Email/Password Authentication is active on Firebase project ${firebaseConfig.projectId}${projectNumber ? ` (#${projectNumber})` : ''}.`;
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

    res.json({
      ok: true,
      configValid: true,
      projectId: firebaseConfig.projectId,
      projectNumber,
      authDomain: firebaseConfig.authDomain,
      firestoreDatabaseId: firebaseConfig.firestoreDatabaseId || '(default)',
      authorizedDomains,
      authInitialized,
      emailPasswordEnabled,
      statusCode,
      detailMessage,
      providersConsoleUrl: `https://console.firebase.google.com/project/${encodeURIComponent(firebaseConfig.projectId)}/authentication/providers`,
    });
  });

  // First-Admin Setup & Admin Mobile Credential Provisioning
  // Authorized ONLY for the bootstrapped owner or an already-verified Admin
  app.post('/api/admin/setup-first-admin', async (req, res) => {
    const adminUser = await verifyAdminBearerToken(req.headers.authorization);
    if (!adminUser) {
      res.status(401).json({
        error: 'Unauthorized: Verify ownership with the authorized Admin account first.',
      });
      return;
    }

    const { phone, password, currentPassword, displayName, allowUpdate } = req.body as {
      phone?: string;
      password?: string;
      currentPassword?: string;
      displayName?: string;
      allowUpdate?: boolean;
    };

    const phoneNorm = normalizePhone(String(phone || ''));
    if (phoneNorm.length < 10) {
      res.status(400).json({ error: 'Valid 10-digit Admin mobile number is required.' });
      return;
    }

    const rawPassword = String(password || '');
    const strongPassword =
      rawPassword.length >= 8 &&
      /[A-Z]/.test(rawPassword) &&
      /[a-z]/.test(rawPassword) &&
      /[0-9]/.test(rawPassword) &&
      /[^A-Za-z0-9]/.test(rawPassword);

    if (!strongPassword) {
      res.status(400).json({
        error:
          'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.',
      });
      return;
    }

    // Lock one-time first-admin setup unless an authenticated Admin explicitly updates credentials
    if (!allowUpdate) {
      let alreadyConfigured = false;
      if (adminDb) {
        try {
          const existingCreds = await adminDb.collection('adminCredentials').limit(1).get();
          alreadyConfigured = !existingCreds.empty;
        } catch {
          alreadyConfigured = await checkAnyAdminCredentialExistsViaRest(adminUser.idToken);
        }
      } else {
        alreadyConfigured = await checkAnyAdminCredentialExistsViaRest(adminUser.idToken);
      }

      if (alreadyConfigured) {
        res.status(409).json({
          error:
            'First Admin mobile login is already configured. Sign in as Admin and update credentials from Settings.',
        });
        return;
      }
    }

    const authEmail = adminPhoneToAuthEmail(phoneNorm);
    const cleanDisplayName = (displayName || 'SAGAR MANAGEMENT Admin').trim().slice(0, 120);
    const { hash, salt } = hashPassword(rawPassword);
    let adminUid = '';
    let firebaseAuthProvisioned = false;

    // 1. Try Firebase Admin SDK when IAM credentials are attached
    if (adminInitialized && adminApp) {
      try {
        const adminAuth = getAuth(adminApp);
        let userRecord: UserRecord;
        try {
          userRecord = await adminAuth.getUserByEmail(authEmail);
          await adminAuth.updateUser(userRecord.uid, {
            password: rawPassword,
            displayName: cleanDisplayName,
            disabled: false,
            emailVerified: true,
          });
        } catch {
          userRecord = await adminAuth.createUser({
            email: authEmail,
            password: rawPassword,
            displayName: cleanDisplayName,
            emailVerified: true,
          });
        }
        adminUid = userRecord.uid;
        await adminAuth.setCustomUserClaims(adminUid, {
          role: 'admin',
          phone: phoneNorm,
        });
        firebaseAuthProvisioned = true;
      } catch {
        firebaseAuthProvisioned = false;
      }
    }

    // 2. Try Firebase Auth Identity Toolkit REST API (works without IAM private key when Email/Password is enabled)
    if (!firebaseAuthProvisioned) {
      try {
        const signUpResp = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: authEmail,
              password: rawPassword,
              displayName: cleanDisplayName,
              returnSecureToken: true,
            }),
          }
        );
        const signUpData = (await signUpResp.json()) as {
          localId?: string;
          idToken?: string;
          error?: { message?: string };
        };

        if (signUpResp.ok && signUpData.localId) {
          adminUid = signUpData.localId;
          firebaseAuthProvisioned = true;
        } else if (signUpData.error?.message === 'EMAIL_EXISTS') {
          const passwordToCheck = currentPassword ? String(currentPassword) : rawPassword;
          const signInResp = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: authEmail,
                password: passwordToCheck,
                returnSecureToken: true,
              }),
            }
          );
          const signInData = (await signInResp.json()) as {
            localId?: string;
            idToken?: string;
            error?: { message?: string };
          };
          if (signInResp.ok && signInData.localId && signInData.idToken) {
            if (currentPassword && currentPassword !== rawPassword) {
              const updateResp = await fetch(
                `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    idToken: signInData.idToken,
                    password: rawPassword,
                    displayName: cleanDisplayName,
                    returnSecureToken: true,
                  }),
                }
              );
              if (!updateResp.ok) {
                res.status(400).json({ error: 'Failed to update Admin password in Firebase Auth.' });
                return;
              }
            }
            adminUid = signInData.localId;
            firebaseAuthProvisioned = true;
          } else {
            res.status(409).json({
              error: currentPassword
                ? 'Current Admin password did not match.'
                : 'An Admin Auth account for this mobile number already exists. Provide the current password or reset it in Firebase Console → Authentication → Users.',
            });
            return;
          }
        } else {
          const errCode = signUpData.error?.message || 'AUTH_PROVISION_FAILED';
          if (
            errCode.includes('OPERATION_NOT_ALLOWED') ||
            errCode.includes('PASSWORD_LOGIN_DISABLED')
          ) {
            res.status(412).json({
              code: errCode,
              projectId: firebaseConfig.projectId,
              error: `Email/Password sign-in is currently disabled on Firebase project "${firebaseConfig.projectId}" (${errCode}). Open Firebase Console for project "${firebaseConfig.projectId}" → Authentication → Sign-in method → Email/Password → Enable → Save, then retry.`,
            });
            return;
          }
          if (
            errCode.includes('ADMIN_ONLY_OPERATION') ||
            errCode.includes('EMAIL_SIGNUP_DISABLED')
          ) {
            res.status(412).json({
              code: errCode,
              projectId: firebaseConfig.projectId,
              error: `User sign-up is restricted on Firebase project "${firebaseConfig.projectId}" (${errCode}). In Firebase Console → Authentication → Settings → User actions, enable "Enable create (sign-up)", then retry.`,
            });
            return;
          }
          if (errCode.includes('CONFIGURATION_NOT_FOUND')) {
            res.status(412).json({
              code: errCode,
              projectId: firebaseConfig.projectId,
              error: `Firebase Authentication is not initialized on project "${firebaseConfig.projectId}" (${errCode}). Open Authentication → Get started in Firebase Console for "${firebaseConfig.projectId}".`,
            });
            return;
          }
          res.status(400).json({
            code: errCode,
            projectId: firebaseConfig.projectId,
            error: `Firebase Auth setup failed on project "${firebaseConfig.projectId}": ${errCode}`,
          });
          return;
        }
      } catch (err) {
        res.status(502).json({
          error:
            err instanceof Error
              ? err.message
              : 'Failed to connect to Firebase Authentication.',
        });
        return;
      }
    }

    if (!adminUid) {
      res.status(500).json({
        error: `Firebase Authentication did not return an Admin UID for project "${firebaseConfig.projectId}".`,
      });
      return;
    }

    // Never return raw password; return salted hash metadata for Firestore security-ruled persistence
    res.json({
      ok: true,
      phoneNormalized: phoneNorm,
      authEmail,
      adminUid,
      displayName: cleanDisplayName,
      passwordHash: hash,
      passwordSalt: salt,
      firebaseAuthProvisioned,
    });
  });

  // Admin Login: Mobile Number + Password
  app.post('/api/auth/admin-login', async (req, res) => {
    const { phone, password } = req.body as { phone?: string; password?: string };
    const phoneNorm = normalizePhone(String(phone || ''));
    const rawPassword = String(password || '');

    if (phoneNorm.length < 10 || !rawPassword) {
      res.status(400).json({ error: 'Valid 10-digit Admin mobile number and password are required.' });
      return;
    }

    const authEmail = adminPhoneToAuthEmail(phoneNorm);

    // 1. Verify against Firestore adminCredentials + scrypt hash when Admin DB is available
    if (adminDb) {
      try {
        const credDoc = await adminDb.collection('adminCredentials').doc(phoneNorm).get();
        if (credDoc.exists) {
          const cred = credDoc.data() as {
            adminUid: string;
            passwordHash: string;
            passwordSalt: string;
            authEmail: string;
          };
          const valid = verifyPassword(rawPassword, cred.passwordHash, cred.passwordSalt);
          if (!valid) {
            res.status(401).json({ error: 'Invalid Admin mobile number or password.' });
            return;
          }
          const adminSnap = await adminDb.collection('admins').doc(cred.adminUid).get();
          if (!adminSnap.exists) {
            res.status(403).json({ error: 'Account does not have Admin authorization.' });
            return;
          }
          if (adminInitialized && adminApp) {
            try {
              const customToken = await getAuth(adminApp).createCustomToken(cred.adminUid, {
                role: 'admin',
                phone: phoneNorm,
              });
              res.json({
                ok: true,
                mode: 'custom_token',
                customToken,
                authEmail: cred.authEmail || authEmail,
                adminUid: cred.adminUid,
              });
              return;
            } catch {
              // Fall through to Firebase Auth REST verification
            }
          }
        }
      } catch {
        // Admin DB lookup unavailable in local preview without IAM key; use Firebase Auth REST + Firestore REST
      }
    }

    // 2. Verify via Firebase Auth Identity Toolkit REST API + Firestore /admins/{uid} check
    try {
      const restResp = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: authEmail, password: rawPassword, returnSecureToken: true }),
        }
      );
      const restData = (await restResp.json()) as {
        localId?: string;
        idToken?: string;
        error?: { message?: string };
      };

      if (!restResp.ok || !restData.localId || !restData.idToken) {
        const errCode = restData.error?.message || '';
        if (
          errCode.includes('PASSWORD_LOGIN_DISABLED') ||
          errCode.includes('OPERATION_NOT_ALLOWED') ||
          errCode.includes('CONFIGURATION_NOT_FOUND')
        ) {
          res.status(412).json({
            code: errCode,
            projectId: firebaseConfig.projectId,
            error: `Email/Password sign-in is disabled on Firebase project "${firebaseConfig.projectId}" (${errCode}). Enable Authentication → Sign-in method → Email/Password in Firebase Console for "${firebaseConfig.projectId}".`,
          });
          return;
        }
        res.status(401).json({ error: 'Invalid Admin mobile number or password.' });
        return;
      }

      const isRegisteredAdmin = await checkAdminDocViaRest(restData.localId, restData.idToken);
      if (!isRegisteredAdmin) {
        res.status(403).json({
          error:
            'This account is not authorized as an Admin. Complete First-Time Admin Setup with the owner account first.',
        });
        return;
      }

      res.json({
        ok: true,
        mode: 'email_password',
        authEmail,
        adminUid: restData.localId,
      });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Admin authentication service unavailable.',
      });
    }
  });

  // Admin: Hash member password & optionally provision Firebase Auth user
  app.post('/api/admin/members/prepare', async (req, res) => {
    const adminUser = await verifyAdminBearerToken(req.headers.authorization);
    if (!adminUser) {
      res.status(401).json({ error: 'Unauthorized: Valid Admin authentication required.' });
      return;
    }

    const { phone, password, fullName, memberId } = req.body as {
      phone?: string;
      password?: string;
      fullName?: string;
      memberId?: string;
    };

    const phoneNorm = normalizePhone(String(phone || ''));
    if (phoneNorm.length < 6) {
      res.status(400).json({ error: 'Valid mobile number (at least 6 digits) is required.' });
      return;
    }
    if (!password || password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }

    const authEmail = phoneToAuthEmail(phoneNorm);
    const { hash, salt } = hashPassword(password);
    let memberUid = `member_${phoneNorm}`;
    let authUserCreated = false;

    if (adminInitialized && adminApp) {
      try {
        const adminAuth = getAuth(adminApp);
        let userRecord: UserRecord;
        try {
          userRecord = await adminAuth.getUserByEmail(authEmail);
          await adminAuth.updateUser(userRecord.uid, {
            password,
            displayName: fullName || `Worker ${phoneNorm}`,
            disabled: false,
          });
        } catch {
          userRecord = await adminAuth.createUser({
            email: authEmail,
            password,
            displayName: fullName || `Worker ${phoneNorm}`,
            emailVerified: true,
          });
        }
        memberUid = userRecord.uid;
        await adminAuth.setCustomUserClaims(memberUid, {
          role: 'member',
          memberId: memberId || `SM_${phoneNorm}`,
        });
        authUserCreated = true;
      } catch {
        // Fallback if Firebase Admin Auth doesn't have IAM credentials in local sandbox
        authUserCreated = false;
      }
    }

    // Fallback: provision member in Firebase Auth via Identity Toolkit REST when Email/Password is enabled
    if (!authUserCreated) {
      try {
        const signUpResp = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: authEmail,
              password,
              displayName: fullName || `Worker ${phoneNorm}`,
              returnSecureToken: true,
            }),
          }
        );
        const signUpData = (await signUpResp.json()) as { localId?: string };
        if (signUpResp.ok && signUpData.localId) {
          memberUid = signUpData.localId;
          authUserCreated = true;
        }
      } catch {
        // Keep scrypt member_ fallback
      }
    }

    res.json({
      ok: true,
      phoneNormalized: phoneNorm,
      authEmail,
      memberUid,
      passwordHash: hash,
      passwordSalt: salt,
      authUserCreated,
    });
  });

  // Admin: Reset member password
  app.post('/api/admin/members/reset-password', async (req, res) => {
    const adminUser = await verifyAdminBearerToken(req.headers.authorization);
    if (!adminUser) {
      res.status(401).json({ error: 'Unauthorized: Valid Admin authentication required.' });
      return;
    }

    const { phone, newPassword, memberUid } = req.body as {
      phone?: string;
      newPassword?: string;
      memberUid?: string;
    };

    const phoneNorm = normalizePhone(String(phone || ''));
    if (phoneNorm.length < 6 || !newPassword || newPassword.length < 6) {
      res.status(400).json({ error: 'Valid mobile number and new password (min 6 chars) are required.' });
      return;
    }

    const authEmail = phoneToAuthEmail(phoneNorm);
    const { hash, salt } = hashPassword(newPassword);
    let authUpdated = false;

    if (adminInitialized && adminApp && memberUid) {
      try {
        await getAuth(adminApp).updateUser(memberUid, { password: newPassword });
        authUpdated = true;
      } catch {
        authUpdated = false;
      }
    }

    res.json({
      ok: true,
      phoneNormalized: phoneNorm,
      authEmail,
      passwordHash: hash,
      passwordSalt: salt,
      authUpdated,
    });
  });

  // Admin: Delete member Auth account if present
  app.post('/api/admin/members/delete-auth', async (req, res) => {
    const adminUser = await verifyAdminBearerToken(req.headers.authorization);
    if (!adminUser) {
      res.status(401).json({ error: 'Unauthorized: Valid Admin authentication required.' });
      return;
    }

    const { memberUid } = req.body as { memberUid?: string };
    let deletedFromAuth = false;
    if (adminInitialized && adminApp && memberUid) {
      try {
        await getAuth(adminApp).deleteUser(memberUid);
        deletedFromAuth = true;
      } catch {
        deletedFromAuth = false;
      }
    }
    res.json({ ok: true, deletedFromAuth });
  });

  // Member Login: Mobile Number + Admin-created Password
  app.post('/api/auth/member-login', async (req, res) => {
    const { phone, password } = req.body as { phone?: string; password?: string };
    const phoneNorm = normalizePhone(String(phone || ''));
    if (phoneNorm.length < 6 || !password) {
      res.status(400).json({ error: 'Mobile number and password are required.' });
      return;
    }

    const authEmail = phoneToAuthEmail(phoneNorm);

    // 1. Try Firebase Auth Email/Password REST sign-in if enabled in Firebase Console
    try {
      const restResp = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: authEmail, password, returnSecureToken: true }),
        }
      );
      if (restResp.ok) {
        const restData = (await restResp.json()) as { localId: string; idToken: string };
        if (adminInitialized && adminApp) {
          try {
            const customToken = await getAuth(adminApp).createCustomToken(restData.localId, { role: 'member' });
            res.json({ ok: true, mode: 'custom_token', customToken, authEmail });
            return;
          } catch {
            // Fall through to password-based client signInWithEmailAndPassword instruction
          }
        }
        res.json({ ok: true, mode: 'email_password', authEmail });
        return;
      } else {
        const errBody = (await restResp.json().catch(() => ({}))) as { error?: { message?: string } };
        const errCode = errBody.error?.message || '';
        if (
          errCode.includes('PASSWORD_LOGIN_DISABLED') ||
          errCode.includes('OPERATION_NOT_ALLOWED') ||
          errCode.includes('CONFIGURATION_NOT_FOUND')
        ) {
          res.status(412).json({
            code: errCode,
            projectId: firebaseConfig.projectId,
            error: `Email/Password sign-in is disabled on Firebase project "${firebaseConfig.projectId}" (${errCode}). Enable Authentication → Sign-in method → Email/Password in Firebase Console for "${firebaseConfig.projectId}".`,
          });
          return;
        }
      }
    } catch {
      // Continue to Firestore scrypt verification
    }

    // 2. Verify against Firestore memberCredentials using scrypt
    if (adminDb) {
      try {
        const credDoc = await adminDb.collection('memberCredentials').doc(phoneNorm).get();
        if (!credDoc.exists) {
          res.status(401).json({ error: 'Invalid mobile number or password.' });
          return;
        }
        const cred = credDoc.data() as {
          memberId: string;
          memberUid: string;
          passwordHash: string;
          passwordSalt: string;
          authEmail: string;
        };

        const valid = verifyPassword(password, cred.passwordHash, cred.passwordSalt);
        if (!valid) {
          res.status(401).json({ error: 'Invalid mobile number or password.' });
          return;
        }

        const memberSnap = await adminDb.collection('members').doc(cred.memberId).get();
        if (!memberSnap.exists || memberSnap.data()?.status === 'inactive') {
          res.status(403).json({ error: 'Member account is inactive. Contact Admin.' });
          return;
        }

        // Try minting a Firebase Custom Token (gives real Firebase Auth session with Firestore rules!)
        try {
          if (!adminApp) throw new Error('No admin app');
          const customToken = await getAuth(adminApp).createCustomToken(cred.memberUid, {
            role: 'member',
            memberId: cred.memberId,
          });
          res.json({
            ok: true,
            mode: 'custom_token',
            customToken,
            memberId: cred.memberId,
            memberUid: cred.memberUid,
          });
          return;
        } catch {
          // Fallback: return signed HMAC member session token for strictly isolated /api/member-portal/me
          const sessionToken = signMemberSession({
            memberId: cred.memberId,
            memberUid: cred.memberUid,
            phone: phoneNorm,
            role: 'member',
            exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
          });
          res.json({
            ok: true,
            mode: 'server_session',
            sessionToken,
            memberId: cred.memberId,
            memberUid: cred.memberUid,
          });
          return;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(503).json({
          error:
            'Firebase Admin credentials are not configured on this server for member password lookup. Please enable Email/Password sign-in in Firebase Console or provide FIREBASE_SERVICE_ACCOUNT_JSON.',
          details: msg,
        });
        return;
      }
    }

    res.status(503).json({
      error:
        'Firebase Admin SDK is not initialized. Configure FIREBASE_SERVICE_ACCOUNT_JSON or enable Email/Password Authentication in Firebase Console.',
    });
  });

  // Strictly isolated Member Portal API (when using server_session mode)
  app.get('/api/member-portal/me', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing member session token.' });
      return;
    }
    const session = verifyMemberSession(authHeader.slice(7).trim());
    if (!session) {
      res.status(401).json({ error: 'Invalid or expired member session.' });
      return;
    }
    if (!adminDb) {
      res.status(503).json({ error: 'Firestore Admin connection unavailable.' });
      return;
    }

    try {
      const [memberSnap, attSnap, otSnap, advSnap, paySnap, slipSnap, notifSnap, settingsSnap] =
        await Promise.all([
          adminDb.collection('members').doc(session.memberId).get(),
          adminDb.collection('attendance').where('memberId', '==', session.memberId).get(),
          adminDb.collection('overtimeRecords').where('memberId', '==', session.memberId).get(),
          adminDb.collection('advances').where('memberId', '==', session.memberId).get(),
          adminDb.collection('payments').where('memberId', '==', session.memberId).get(),
          adminDb.collection('salarySlips').where('memberId', '==', session.memberId).get(),
          adminDb.collection('notifications').where('memberId', '==', session.memberId).get(),
          adminDb.collection('settings').doc('app').get(),
        ]);

      if (!memberSnap.exists) {
        res.status(404).json({ error: 'Member profile not found.' });
        return;
      }

      res.json({
        ok: true,
        member: memberSnap.data(),
        attendance: attSnap.docs.map((d) => d.data()),
        overtimeRecords: otSnap.docs.map((d) => d.data()),
        advances: advSnap.docs.map((d) => d.data()),
        payments: paySnap.docs.map((d) => d.data()),
        salarySlips: slipSnap.docs.map((d) => d.data()),
        notifications: notifSnap.docs.map((d) => d.data()),
        settings: settingsSnap.exists ? settingsSnap.data() : null,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to load member records.',
      });
    }
  });

  // Admin: Dispatch SMS via configured SMS provider webhook
  app.post('/api/notifications/sms', async (req, res) => {
    const adminUser = await verifyAdminBearerToken(req.headers.authorization);
    if (!adminUser) {
      res.status(401).json({ error: 'Unauthorized: Valid Admin authentication required.' });
      return;
    }

    const { phone, message, providerEndpoint, senderId } = req.body as {
      phone?: string;
      message?: string;
      providerEndpoint?: string;
      senderId?: string;
    };

    const targetPhone = normalizePhone(String(phone || ''));
    if (!targetPhone || !message) {
      res.status(400).json({ error: 'Phone number and message content are required.' });
      return;
    }

    const webhookUrl = providerEndpoint || process.env.SMS_PROVIDER_URL;
    if (!webhookUrl) {
      res.status(400).json({
        ok: false,
        fallback: 'device_sms',
        error:
          'No SMS Gateway Webhook URL configured. Add an SMS Provider Endpoint in Settings or SMS_PROVIDER_URL in environment secrets, or use the Device SMS / WhatsApp launcher.',
      });
      return;
    }

    try {
      const apiKey = process.env.SMS_API_KEY || '';
      const smsResp = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          to: targetPhone,
          message,
          senderId: senderId || 'SAGARM',
        }),
      });
      if (!smsResp.ok) {
        const text = await smsResp.text();
        res.status(502).json({ ok: false, error: `SMS Gateway error (${smsResp.status}): ${text.slice(0, 200)}` });
        return;
      }
      res.json({ ok: true, dispatched: true });
    } catch (err) {
      res.status(502).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to reach SMS provider webhook.',
      });
    }
  });

  // Vite middleware in dev, static dist in production
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });

    // Vite 8 client.mjs unconditionally executes transport.connect() -> new WebSocket()
    // even when hmr: false and ws: false. Serve a clean WebSocket-free client shim that
    // preserves CSS style injection and import.meta.hot compatibility without WebSockets.
    const noopViteClient = `
const sheetsMap = new Map();
const linkSheetsMap = new Map();
if ("document" in globalThis) {
  document.querySelectorAll("style[data-vite-dev-id]").forEach((el) => {
    sheetsMap.set(el.getAttribute("data-vite-dev-id"), el);
  });
  document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id]').forEach((el) => {
    linkSheetsMap.set(el.getAttribute("data-vite-dev-id"), el);
  });
}
let lastInsertedStyle;
function updateStyle(id, content) {
  if (linkSheetsMap.has(id)) return;
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement("style");
    style.setAttribute("type", "text/css");
    style.setAttribute("data-vite-dev-id", id);
    style.textContent = content;
    if (!lastInsertedStyle) {
      document.head.appendChild(style);
      setTimeout(() => {
        lastInsertedStyle = void 0;
      }, 0);
    } else {
      lastInsertedStyle.insertAdjacentElement("afterend", style);
    }
    lastInsertedStyle = style;
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
function removeStyle(id) {
  if (linkSheetsMap.has(id)) {
    document
      .querySelectorAll('link[rel="stylesheet"][data-vite-dev-id="' + CSS.escape(id) + '"]')
      .forEach((el) => el.remove());
    linkSheetsMap.delete(id);
  }
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
function createHotContext() {
  const noop = () => {};
  return {
    data: {},
    accept: noop,
    acceptExports: noop,
    dispose: noop,
    prune: noop,
    invalidate: noop,
    decline: noop,
    on: noop,
    off: noop,
    send: noop,
  };
}
function injectQuery(url, queryToInject) {
  if (url[0] !== "." && url[0] !== "/") return url;
  const pathname = url.replace(/[?#].*$/, "");
  const { search, hash } = new URL(url, "http://vite.dev");
  return pathname + "?" + queryToInject + (search ? "&" + search.slice(1) : "") + (hash || "");
}
class ErrorOverlay extends HTMLElement {
  close() {
    this.remove();
  }
}
export { ErrorOverlay, createHotContext, injectQuery, removeStyle, updateStyle };
`.trimStart();

    app.get('/@vite/client', (_req, res) => {
      res.type('application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(noopViteClient);
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.join(rootDir, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SAGAR MANAGEMENT server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

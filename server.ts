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

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
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
      };
    }

    if (adminDb) {
      const adminSnap = await adminDb.collection('admins').doc(user.localId).get();
      if (adminSnap.exists) {
        return {
          uid: user.localId,
          email: user.email || '',
          emailVerified: Boolean(user.emailVerified),
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function startServer() {
  const app = express();
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
      adminInitialized,
      adminFirestoreReady,
    });
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
        hmr: process.env.DISABLE_HMR === 'true' ? false : undefined,
      },
      appType: 'spa',
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

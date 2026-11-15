import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as crypto from 'crypto';

admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();

const BOOTSTRAPPED_ADMIN_EMAIL = 'talukdarsagar07@gmail.com';

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}

function phoneToAuthEmail(phoneNormalized: string): string {
  return `m_${phoneNormalized}@sagar-mgmt.local`;
}

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, actualSalt, 64).toString('hex');
  return { hash, salt: actualSalt };
}

async function assertAdmin(request: { auth?: { uid: string; token: Record<string, unknown> } }) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }
  const email = String(request.auth.token.email || '');
  const emailVerified = Boolean(request.auth.token.email_verified);
  if (emailVerified && email === BOOTSTRAPPED_ADMIN_EMAIL) {
    return;
  }
  const adminDoc = await db.collection('admins').doc(request.auth.uid).get();
  if (!adminDoc.exists) {
    throw new HttpsError('permission-denied', 'Admin privileges are required.');
  }
}

export const createMemberAccount = onCall(async (request) => {
  await assertAdmin(request);

  const {
    memberId,
    memberCode,
    fullName,
    phone,
    password,
    joiningDate,
    dailySalaryRate,
    otRate,
    previousBalance = 0,
    photoUrl = '',
    upiId = '',
  } = request.data as Record<string, unknown>;

  const phoneNorm = normalizePhone(String(phone || ''));
  if (phoneNorm.length < 6) {
    throw new HttpsError('invalid-argument', 'Valid mobile number is required.');
  }
  if (!password || String(password).length < 6) {
    throw new HttpsError('invalid-argument', 'Password must be at least 6 characters.');
  }

  const authEmail = phoneToAuthEmail(phoneNorm);
  let userRecord: admin.auth.UserRecord;
  try {
    userRecord = await auth.getUserByEmail(authEmail);
    await auth.updateUser(userRecord.uid, {
      password: String(password),
      displayName: String(fullName),
      disabled: false,
    });
  } catch {
    userRecord = await auth.createUser({
      email: authEmail,
      password: String(password),
      displayName: String(fullName),
      emailVerified: true,
    });
  }

  const resolvedMemberId = String(memberId || `SM_${phoneNorm}`);
  await auth.setCustomUserClaims(userRecord.uid, {
    role: 'member',
    memberId: resolvedMemberId,
  });

  const { hash, salt } = hashPassword(String(password));
  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();

  batch.set(db.collection('users').doc(userRecord.uid), {
    uid: userRecord.uid,
    role: 'member',
    memberId: resolvedMemberId,
    phone: phoneNorm,
    displayName: String(fullName),
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });

  batch.set(db.collection('members').doc(resolvedMemberId), {
    memberId: resolvedMemberId,
    memberCode: String(memberCode || resolvedMemberId),
    memberUid: userRecord.uid,
    fullName: String(fullName),
    phone: phoneNorm,
    joiningDate: String(joiningDate),
    dailySalaryRate: Number(dailySalaryRate) || 0,
    otRate: Number(otRate) || 0,
    previousBalance: Number(previousBalance) || 0,
    photoUrl: String(photoUrl || ''),
    qrData: `SAGAR_MEMBER:${resolvedMemberId}:${phoneNorm}`,
    upiId: String(upiId || ''),
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });

  batch.set(db.collection('memberCredentials').doc(phoneNorm), {
    phoneNormalized: phoneNorm,
    memberId: resolvedMemberId,
    memberUid: userRecord.uid,
    authEmail,
    passwordHash: hash,
    passwordSalt: salt,
    updatedBy: request.auth!.uid,
    updatedAt: now,
  });

  await batch.commit();
  return { ok: true, memberId: resolvedMemberId, memberUid: userRecord.uid };
});

export const resetMemberPassword = onCall(async (request) => {
  await assertAdmin(request);
  const { phone, newPassword, memberUid, memberId } = request.data as Record<string, string>;
  const phoneNorm = normalizePhone(String(phone || ''));
  if (!phoneNorm || !newPassword || newPassword.length < 6) {
    throw new HttpsError('invalid-argument', 'Valid phone and password (min 6 chars) are required.');
  }
  const authEmail = phoneToAuthEmail(phoneNorm);
  const { hash, salt } = hashPassword(newPassword);

  if (memberUid) {
    try {
      await auth.updateUser(memberUid, { password: newPassword });
    } catch {
      // Ignore if auth user was not provisioned in Firebase Auth yet
    }
  }

  await db.collection('memberCredentials').doc(phoneNorm).set({
    phoneNormalized: phoneNorm,
    memberId,
    memberUid,
    authEmail,
    passwordHash: hash,
    passwordSalt: salt,
    updatedBy: request.auth!.uid,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return { ok: true };
});

export const deleteMemberAccount = onCall(async (request) => {
  await assertAdmin(request);
  const { memberId, memberUid, phone } = request.data as Record<string, string>;
  if (memberUid) {
    try {
      await auth.deleteUser(memberUid);
    } catch {
      // Continue deleting Firestore records
    }
  }
  const batch = db.batch();
  if (memberId) batch.delete(db.collection('members').doc(memberId));
  if (memberUid) batch.delete(db.collection('users').doc(memberUid));
  const phoneNorm = normalizePhone(String(phone || ''));
  if (phoneNorm) batch.delete(db.collection('memberCredentials').doc(phoneNorm));
  await batch.commit();
  return { ok: true };
});

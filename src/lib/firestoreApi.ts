import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadString } from 'firebase/storage';
import { ensureValidDateISO, safeNumber } from './accounting';
import {
  adminPhoneToAuthEmail,
  apiUrl,
  hashPasswordClient,
  memberPhoneToAuthEmail,
  normalizePhoneDigits,
  provisionFirebaseAuthUserDirect,
  shouldUseBackendApi,
  updateFirebaseAuthPasswordDirect,
  verifyPasswordMatchesAuthDirect,
} from './apiClient';
import { auth, db, handleFirestoreError, OperationType, storage } from './firebase';
import type {
  AdvanceTransaction,
  AppSettings,
  AttendanceRecord,
  Member,
  NotificationItem,
  OvertimeRecord,
  PaymentTransaction,
  SalaryRecord,
  SalarySlip,
} from '../types';

export function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_\-]/g, '_');
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function nonNeg(val: unknown, fallback = 0): number {
  return Math.max(0, safeNumber(val, fallback));
}

export async function logActivity(
  action: string,
  entityType: string,
  entityId: string,
  details: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const logId = makeId('log');
  const path = `activityLogs/${logId}`;
  try {
    await setDoc(doc(db, 'activityLogs', logId), {
      logId,
      actorUid: user.uid,
      actorName: (user.displayName || user.email || 'Admin').slice(0, 120) || 'Admin',
      action: action.slice(0, 80) || 'ACTION',
      entityType: entityType.slice(0, 40) || 'system',
      entityId: (entityId.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'item').slice(0, 128),
      details: details.slice(0, 500),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function uploadImageAsset(
  folder: string,
  fileName: string,
  dataUrl: string
): Promise<string> {
  // Try Firebase Storage first; if Storage bucket isn't enabled/CORS blocked, fall back to compressed Data URL
  try {
    const storageRef = ref(storage, `${folder}/${fileName}`);
    await uploadString(storageRef, dataUrl, 'data_url');
    return await getDownloadURL(storageRef);
  } catch {
    return dataUrl.slice(0, 290000);
  }
}

export async function ensureAdminBootstrap(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const adminRef = doc(db, 'admins', user.uid);
  try {
    const snap = await getDoc(adminRef);
    if (!snap.exists()) {
      await setDoc(adminRef, {
        uid: user.uid,
        email: user.email || '',
        role: 'admin',
        createdAt: serverTimestamp(),
      });
    }
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        role: 'admin',
        displayName: (user.displayName || user.email || 'Admin').slice(0, 120),
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `admins/${user.uid}`);
  }
}

interface ProvisionPrepResult {
  phoneNormalized: string;
  authEmail: string;
  adminUid: string;
  displayName: string;
  passwordHash: string;
  passwordSalt: string;
}

async function prepareAdminCredentialsDirect(input: {
  phone: string;
  password: string;
  currentPassword?: string;
  displayName?: string;
  allowUpdate?: boolean;
}): Promise<ProvisionPrepResult> {
  const phoneNorm = normalizePhoneDigits(input.phone);
  if (phoneNorm.length < 10) {
    throw new Error('Valid 10-digit Admin mobile number is required.');
  }

  const strongPassword =
    input.password.length >= 8 &&
    /[A-Z]/.test(input.password) &&
    /[a-z]/.test(input.password) &&
    /[0-9]/.test(input.password) &&
    /[^A-Za-z0-9]/.test(input.password);
  if (!strongPassword) {
    throw new Error(
      'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.'
    );
  }

  if (!input.allowUpdate) {
    const existingCreds = await getDocs(
      query(collection(db, 'adminCredentials'), limit(1))
    );
    if (!existingCreds.empty) {
      throw new Error(
        'First Admin mobile login is already configured. Sign in as Admin and update credentials from Settings.'
      );
    }
  }

  const authEmail = adminPhoneToAuthEmail(phoneNorm);
  const cleanDisplayName = (input.displayName || 'SAGAR MANAGEMENT Admin').trim().slice(0, 120);
  const [{ hash, salt }, provisioned] = await Promise.all([
    hashPasswordClient(input.password),
    provisionFirebaseAuthUserDirect({
      email: authEmail,
      password: input.password,
      currentPassword: input.currentPassword,
      displayName: cleanDisplayName,
      conflictMessage: input.currentPassword
        ? 'Current Admin password did not match.'
        : 'An Admin Auth account for this mobile number already exists. Provide the current password or reset it in Firebase Console → Authentication → Users.',
    }),
  ]);

  return {
    phoneNormalized: phoneNorm,
    authEmail,
    adminUid: provisioned.uid,
    displayName: cleanDisplayName,
    passwordHash: hash,
    passwordSalt: salt,
  };
}

export async function provisionAdminMobileCredentials(input: {
  phone: string;
  password: string;
  currentPassword?: string;
  displayName?: string;
  allowUpdate?: boolean;
}): Promise<{ phoneNormalized: string; authEmail: string; adminUid: string }> {
  const user = auth.currentUser;
  if (!user) throw new Error('Owner/Admin authentication required.');

  let prep: ProvisionPrepResult | null = null;

  if (shouldUseBackendApi()) {
    try {
      const idToken = await user.getIdToken();
      const resp = await fetch(apiUrl('/api/admin/setup-first-admin'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          phone: input.phone,
          password: input.password,
          currentPassword: input.currentPassword,
          displayName: input.displayName,
          allowUpdate: Boolean(input.allowUpdate),
        }),
      });
      const contentType = resp.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const body = (await resp.json()) as Partial<ProvisionPrepResult> & {
          ok?: boolean;
          error?: string;
        };
        if (!resp.ok || !body.ok) {
          throw new Error(body.error || 'Failed to provision Admin credentials.');
        }
        prep = body as ProvisionPrepResult;
      }
    } catch (err) {
      // Only rethrow explicit backend validation/auth failures; fall back to direct Firebase if endpoint is unreachable
      if (
        err instanceof Error &&
        !(err instanceof TypeError) &&
        !err.message.includes('Failed to fetch')
      ) {
        throw err;
      }
    }
  }

  if (!prep) {
    prep = await prepareAdminCredentialsDirect(input);
  }

  try {
    const adminRef = doc(db, 'admins', prep.adminUid);
    const adminSnap = await getDoc(adminRef);
    if (!adminSnap.exists()) {
      await setDoc(adminRef, {
        uid: prep.adminUid,
        email: prep.authEmail,
        phone: prep.phoneNormalized,
        role: 'admin',
        createdAt: serverTimestamp(),
      });
    }

    const credRef = doc(db, 'adminCredentials', prep.phoneNormalized);
    const credSnap = await getDoc(credRef);
    if (credSnap.exists()) {
      await updateDoc(credRef, {
        adminUid: prep.adminUid,
        authEmail: prep.authEmail,
        displayName: prep.displayName,
        passwordHash: prep.passwordHash,
        passwordSalt: prep.passwordSalt,
        updatedBy: user.uid,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(credRef, {
        phoneNormalized: prep.phoneNormalized,
        adminUid: prep.adminUid,
        authEmail: prep.authEmail,
        displayName: prep.displayName,
        passwordHash: prep.passwordHash,
        passwordSalt: prep.passwordSalt,
        updatedBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const userRef = doc(db, 'users', prep.adminUid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        uid: prep.adminUid,
        role: 'admin',
        phone: prep.phoneNormalized,
        displayName: prep.displayName,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await logActivity(
      'SETUP_ADMIN_CREDENTIALS',
      'adminCredentials',
      prep.phoneNormalized,
      `Configured secure Admin mobile login (${prep.phoneNormalized})`
    );

    return {
      phoneNormalized: prep.phoneNormalized,
      authEmail: prep.authEmail,
      adminUid: prep.adminUid,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `adminCredentials/${prep.phoneNormalized}`);
  }
}

export async function saveAppSettings(
  data: Omit<AppSettings, 'settingId' | 'updatedBy' | 'updatedAt'>
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Admin sign-in required.');
  const refDoc = doc(db, 'settings', 'app');
  try {
    const snap = await getDoc(refDoc);
    const payload = {
      companyName: data.companyName.trim().slice(0, 120) || 'SAGAR MANAGEMENT',
      tagline: (data.tagline || 'SMART ATTENDANCE • SALARY • WORKER MANAGEMENT').slice(0, 160),
      upiId: (data.upiId || '').trim().slice(0, 120),
      upiName: (data.upiName || '').trim().slice(0, 120),
      adminQrImage: (data.adminQrImage || '').slice(0, 290000),
      smsProviderEndpoint: (data.smsProviderEndpoint || '').trim().slice(0, 300),
      smsSenderId: (data.smsSenderId || 'SAGARM').trim().slice(0, 40),
      defaultOtRate: nonNeg(data.defaultOtRate, 0),
      standardWorkHours: clamp(safeNumber(data.standardWorkHours, 8), 1, 24),
      updatedBy: user.uid,
      updatedAt: serverTimestamp(),
    };
    if (snap.exists()) {
      await updateDoc(refDoc, payload);
    } else {
      await setDoc(refDoc, { settingId: 'app', ...payload });
    }
    await logActivity('UPDATE_SETTINGS', 'settings', 'app', 'Updated company, UPI QR, and payroll settings');
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'settings/app');
  }
}

interface MemberPrepResult {
  phoneNormalized: string;
  authEmail: string;
  memberUid: string;
  passwordHash: string;
  passwordSalt: string;
}

async function prepareMemberCredentialsDirect(input: {
  phone: string;
  password: string;
  fullName: string;
}): Promise<MemberPrepResult> {
  const phoneNorm = normalizePhoneDigits(input.phone);
  if (phoneNorm.length < 6) {
    throw new Error('Valid mobile number (at least 6 digits) is required.');
  }
  if (!input.password || input.password.length < 6) {
    throw new Error('Member password must be at least 6 characters.');
  }

  const authEmail = memberPhoneToAuthEmail(phoneNorm);
  const displayName = (input.fullName || `Worker ${phoneNorm}`).trim().slice(0, 120);
  const [{ hash, salt }, provisioned] = await Promise.all([
    hashPasswordClient(input.password),
    provisionFirebaseAuthUserDirect({
      email: authEmail,
      password: input.password,
      displayName,
      conflictMessage: `A Firebase Auth login account for mobile ${phoneNorm} already exists with a different password. Enter the previous password to reuse it or use another mobile number.`,
    }),
  ]);

  return {
    phoneNormalized: phoneNorm,
    authEmail,
    memberUid: provisioned.uid,
    passwordHash: hash,
    passwordSalt: salt,
  };
}

export async function createMemberWithCredentials(input: {
  memberCode: string;
  fullName: string;
  phone: string;
  password: string;
  joiningDate: string;
  dailySalaryRate: number;
  otRate: number;
  previousBalance: number;
  photoUrl?: string;
  upiId?: string;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Admin authentication required.');
  const memberId = makeId('SM');
  const phoneNorm = normalizePhoneDigits(input.phone);
  if (phoneNorm.length < 6) {
    throw new Error('Valid mobile number (at least 6 digits) is required.');
  }

  // Prevent overwriting an active member's mobile credential entry
  const existingCredSnap = await getDoc(doc(db, 'memberCredentials', phoneNorm));
  if (existingCredSnap.exists()) {
    const existingMemberId = existingCredSnap.data()?.memberId;
    if (existingMemberId) {
      const existingMemberSnap = await getDoc(doc(db, 'members', existingMemberId));
      if (existingMemberSnap.exists()) {
        throw new Error(
          `A worker (${existingMemberSnap.data()?.fullName || phoneNorm}) is already registered with mobile number ${phoneNorm}.`
        );
      }
    }
  }

  let prep: MemberPrepResult | null = null;

  if (shouldUseBackendApi()) {
    try {
      const idToken = await user.getIdToken();
      const prepResp = await fetch(apiUrl('/api/admin/members/prepare'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          phone: input.phone,
          password: input.password,
          fullName: input.fullName,
          memberId,
        }),
      });
      const contentType = prepResp.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const body = (await prepResp.json()) as Partial<MemberPrepResult> & {
          ok?: boolean;
          error?: string;
        };
        if (!prepResp.ok || !body.ok) {
          throw new Error(body.error || 'Failed to prepare member credentials.');
        }
        prep = body as MemberPrepResult;
      }
    } catch (err) {
      if (
        err instanceof Error &&
        !(err instanceof TypeError) &&
        !err.message.includes('Failed to fetch')
      ) {
        throw err;
      }
    }
  }

  if (!prep) {
    prep = await prepareMemberCredentialsDirect({
      phone: input.phone,
      password: input.password,
      fullName: input.fullName,
    });
  }

  const safeJoiningDate = ensureValidDateISO(input.joiningDate);
  const safeName = input.fullName.trim().slice(0, 120);
  const safeCode = input.memberCode.trim().slice(0, 32) || memberId;

  try {
    await setDoc(doc(db, 'members', memberId), {
      memberId,
      memberCode: safeCode,
      memberUid: prep.memberUid,
      fullName: safeName,
      phone: prep.phoneNormalized,
      joiningDate: safeJoiningDate,
      dailySalaryRate: nonNeg(input.dailySalaryRate, 0),
      otRate: nonNeg(input.otRate, 0),
      previousBalance: safeNumber(input.previousBalance, 0),
      photoUrl: (input.photoUrl || '').slice(0, 290000),
      qrData: `SAGAR_MEMBER:${memberId}:${prep.phoneNormalized}`,
      upiId: (input.upiId || '').trim().slice(0, 120),
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await setDoc(doc(db, 'memberCredentials', prep.phoneNormalized), {
      phoneNormalized: prep.phoneNormalized,
      memberId,
      memberUid: prep.memberUid,
      authEmail: prep.authEmail,
      passwordHash: prep.passwordHash,
      passwordSalt: prep.passwordSalt,
      updatedBy: user.uid,
      updatedAt: serverTimestamp(),
    });

    const userRef = doc(db, 'users', prep.memberUid);
    const existingUserSnap = await getDoc(userRef);
    if (existingUserSnap.exists()) {
      await updateDoc(userRef, {
        memberId,
        phone: prep.phoneNormalized,
        displayName: safeName,
        status: 'active',
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(userRef, {
        uid: prep.memberUid,
        role: 'member',
        memberId,
        phone: prep.phoneNormalized,
        displayName: safeName,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await logActivity('CREATE_MEMBER', 'members', memberId, `Added member ${safeName} (${prep.phoneNormalized})`);
    return memberId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `members/${memberId}`);
  }
}

export async function updateMemberProfile(
  memberId: string,
  updates: Partial<Pick<Member, 'memberCode' | 'fullName' | 'phone' | 'joiningDate' | 'dailySalaryRate' | 'otRate' | 'previousBalance' | 'photoUrl' | 'upiId' | 'status'>>
): Promise<void> {
  const path = `members/${memberId}`;
  const cleanUpdates: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (updates.memberCode !== undefined) {
    cleanUpdates.memberCode = updates.memberCode.trim().slice(0, 32) || memberId;
  }
  if (updates.fullName !== undefined) {
    cleanUpdates.fullName = updates.fullName.trim().slice(0, 120);
  }
  if (updates.phone !== undefined) {
    cleanUpdates.phone = normalizePhoneDigits(updates.phone);
  }
  if (updates.joiningDate !== undefined) {
    cleanUpdates.joiningDate = ensureValidDateISO(updates.joiningDate);
  }
  if (updates.dailySalaryRate !== undefined) {
    cleanUpdates.dailySalaryRate = nonNeg(updates.dailySalaryRate, 0);
  }
  if (updates.otRate !== undefined) {
    cleanUpdates.otRate = nonNeg(updates.otRate, 0);
  }
  if (updates.previousBalance !== undefined) {
    cleanUpdates.previousBalance = safeNumber(updates.previousBalance, 0);
  }
  if (updates.photoUrl !== undefined) {
    cleanUpdates.photoUrl = (updates.photoUrl || '').slice(0, 290000);
  }
  if (updates.upiId !== undefined) {
    cleanUpdates.upiId = (updates.upiId || '').trim().slice(0, 120);
  }
  if (updates.status !== undefined) {
    cleanUpdates.status = updates.status === 'inactive' ? 'inactive' : 'active';
  }

  try {
    await updateDoc(doc(db, 'members', memberId), cleanUpdates);
    await logActivity('UPDATE_MEMBER', 'members', memberId, `Updated member profile ${updates.fullName || memberId}`);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function resetMemberPasswordByAdmin(
  member: Member,
  newPassword: string,
  currentPassword?: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Admin authentication required.');
  if (!newPassword || newPassword.length < 6) {
    throw new Error('New password must be at least 6 characters.');
  }

  const phoneNorm = normalizePhoneDigits(member.phone);
  const authEmail = memberPhoneToAuthEmail(phoneNorm);
  let passwordHash = '';
  let passwordSalt = '';
  let resolvedViaBackend = false;

  if (shouldUseBackendApi()) {
    try {
      const idToken = await user.getIdToken();
      const resp = await fetch(apiUrl('/api/admin/members/reset-password'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          phone: member.phone,
          newPassword,
          memberUid: member.memberUid,
        }),
      });
      const contentType = resp.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = (await resp.json()) as {
          ok?: boolean;
          error?: string;
          authUpdated?: boolean;
          passwordHash: string;
          passwordSalt: string;
        };
        if (!resp.ok || !data.ok) {
          throw new Error(data.error || 'Password reset failed.');
        }
        passwordHash = data.passwordHash;
        passwordSalt = data.passwordSalt;
        resolvedViaBackend = Boolean(data.authUpdated);
      }
    } catch (err) {
      if (
        err instanceof Error &&
        !(err instanceof TypeError) &&
        !err.message.includes('Failed to fetch')
      ) {
        throw err;
      }
    }
  }

  if (!passwordHash || !passwordSalt) {
    const hashed = await hashPasswordClient(newPassword);
    passwordHash = hashed.hash;
    passwordSalt = hashed.salt;
  }

  if (!resolvedViaBackend) {
    if (currentPassword) {
      await updateFirebaseAuthPasswordDirect({
        email: authEmail,
        currentPassword,
        newPassword,
      });
    } else {
      const alreadyMatches = await verifyPasswordMatchesAuthDirect(authEmail, newPassword);
      if (!alreadyMatches) {
        throw new Error(
          'Enter this member\'s current password to update their Firebase login directly in the mobile app, or reset it from Firebase Console → Authentication → Users.'
        );
      }
    }
  }

  try {
    const credRef = doc(db, 'memberCredentials', phoneNorm);
    const credSnap = await getDoc(credRef);
    if (credSnap.exists()) {
      await updateDoc(credRef, {
        memberUid: member.memberUid,
        authEmail,
        passwordHash,
        passwordSalt,
        updatedBy: user.uid,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(credRef, {
        phoneNormalized: phoneNorm,
        memberId: member.memberId,
        memberUid: member.memberUid,
        authEmail,
        passwordHash,
        passwordSalt,
        updatedBy: user.uid,
        updatedAt: serverTimestamp(),
      });
    }
    await logActivity('RESET_PASSWORD', 'members', member.memberId, `Reset password for ${member.fullName}`);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `memberCredentials/${phoneNorm}`);
  }
}

export async function deleteMemberRecord(member: Member): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Admin authentication required.');
  const phoneNorm = normalizePhoneDigits(member.phone) || member.phone;
  try {
    if (shouldUseBackendApi()) {
      const idToken = await user.getIdToken();
      await fetch(apiUrl('/api/admin/members/delete-auth'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ memberUid: member.memberUid }),
      }).catch(() => {});
    }

    await deleteDoc(doc(db, 'members', member.memberId));
    await deleteDoc(doc(db, 'memberCredentials', phoneNorm)).catch(() => {});
    if (member.memberUid) {
      await deleteDoc(doc(db, 'users', member.memberUid)).catch(() => {});
    }
    await logActivity('DELETE_MEMBER', 'members', member.memberId, `Deleted member ${member.fullName}`);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `members/${member.memberId}`);
  }
}

export async function upsertAttendanceRecord(input: {
  member: Member;
  date: string;
  status: 'P' | 'A';
  workingHours: number;
  otHours: number;
  notes?: string;
  existing?: AttendanceRecord;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Admin authentication required.');
  const safeDate = ensureValidDateISO(input.date);
  const recordId = `${input.member.memberId}_${safeDate}`.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const path = `attendance/${recordId}`;
  const safeWorkHrs = input.status === 'P' ? clamp(safeNumber(input.workingHours, 8), 0, 24) : 0;
  const safeOtHrs = clamp(safeNumber(input.otHours, 0), 0, 24);
  const safeNotes = (input.notes || '').slice(0, 300);

  try {
    const refDoc = doc(db, 'attendance', recordId);
    let alreadyExists = Boolean(input.existing);
    if (!alreadyExists) {
      const snap = await getDoc(refDoc);
      alreadyExists = snap.exists();
    }

    if (alreadyExists) {
      await updateDoc(refDoc, {
        status: input.status,
        workingHours: safeWorkHrs,
        otHours: safeOtHrs,
        notes: safeNotes,
        memberUid: input.member.memberUid,
        updatedBy: user.uid,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(refDoc, {
        recordId,
        memberId: input.member.memberId,
        memberUid: input.member.memberUid,
        date: safeDate,
        status: input.status,
        workingHours: safeWorkHrs,
        otHours: safeOtHrs,
        notes: safeNotes,
        updatedBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function saveOvertimeRecord(input: {
  member: Member;
  date: string;
  hours: number;
  rate: number;
  notes?: string;
  existingId?: string;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Admin authentication required.');
  const safeDate = ensureValidDateISO(input.date);
  const recordId =
    input.existingId ||
    `${input.member.memberId}_${safeDate}_ot`.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const safeHours = clamp(safeNumber(input.hours, 0), 0, 24);
  const safeRate = nonNeg(input.rate, 0);
  const amount = Math.round(safeHours * safeRate * 100) / 100;
  const path = `overtimeRecords/${recordId}`;

  try {
    const refDoc = doc(db, 'overtimeRecords', recordId);
    const snap = await getDoc(refDoc);
    if (snap.exists()) {
      await updateDoc(refDoc, {
        date: safeDate,
        hours: safeHours,
        rate: safeRate,
        amount,
        notes: (input.notes || '').slice(0, 300),
        memberUid: input.member.memberUid,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(refDoc, {
        recordId,
        memberId: input.member.memberId,
        memberUid: input.member.memberUid,
        date: safeDate,
        hours: safeHours,
        rate: safeRate,
        amount,
        notes: (input.notes || '').slice(0, 300),
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await logActivity('SAVE_OT', 'overtimeRecords', recordId, `OT ${safeHours}h for ${input.member.fullName} on ${safeDate}`);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteOvertimeRecord(record: OvertimeRecord): Promise<void> {
  try {
    await deleteDoc(doc(db, 'overtimeRecords', record.recordId));
    await logActivity('DELETE_OT', 'overtimeRecords', record.recordId, `Deleted OT on ${record.date}`);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `overtimeRecords/${record.recordId}`);
  }
}

export async function saveAdvanceTransaction(input: {
  member: Member;
  category: 'NORMAL' | 'COOKING';
  transactionType: 'GIVEN' | 'REPAYMENT';
  amount: number;
  date: string;
  paymentMethod: AdvanceTransaction['paymentMethod'];
  reference?: string;
  notes?: string;
  existingId?: string;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Admin authentication required.');
  const safeAmount = safeNumber(input.amount, 0);
  if (safeAmount <= 0) throw new Error('Advance amount must be greater than zero.');
  const safeDate = ensureValidDateISO(input.date);
  const advanceId = input.existingId || makeId('ADV');
  const path = `advances/${advanceId}`;

  try {
    const refDoc = doc(db, 'advances', advanceId);
    if (input.existingId) {
      await updateDoc(refDoc, {
        category: input.category,
        transactionType: input.transactionType,
        amount: safeAmount,
        date: safeDate,
        paymentMethod: input.paymentMethod,
        reference: (input.reference || '').slice(0, 120),
        notes: (input.notes || '').slice(0, 400),
        memberUid: input.member.memberUid,
        updatedAt: serverTimestamp(),
      });
      await logActivity('UPDATE_ADVANCE', 'advances', advanceId, `Updated ${input.category} advance (${safeAmount}) for ${input.member.fullName}`);
    } else {
      await setDoc(refDoc, {
        advanceId,
        memberId: input.member.memberId,
        memberUid: input.member.memberUid,
        category: input.category,
        transactionType: input.transactionType,
        amount: safeAmount,
        date: safeDate,
        paymentMethod: input.paymentMethod,
        reference: (input.reference || '').slice(0, 120),
        notes: (input.notes || '').slice(0, 400),
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await logActivity('CREATE_ADVANCE', 'advances', advanceId, `${input.category} ${input.transactionType} ₹${safeAmount} for ${input.member.fullName}`);
    }
    return advanceId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteAdvanceTransaction(adv: AdvanceTransaction): Promise<void> {
  try {
    await deleteDoc(doc(db, 'advances', adv.advanceId));
    await logActivity('DELETE_ADVANCE', 'advances', adv.advanceId, `Deleted advance ₹${adv.amount} (${adv.date})`);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `advances/${adv.advanceId}`);
  }
}

export async function savePaymentTransaction(input: {
  member: Member;
  direction: PaymentTransaction['direction'];
  amount: number;
  date: string;
  method: PaymentTransaction['method'];
  reference: string;
  verified: boolean;
  notes?: string;
  existingId?: string;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Admin authentication required.');
  const safeAmount = safeNumber(input.amount, 0);
  if (safeAmount <= 0) throw new Error('Payment amount must be greater than zero.');
  const safeDate = ensureValidDateISO(input.date);
  const safeRef = input.reference.trim().slice(0, 120) || `TXN-${Date.now().toString().slice(-6)}`;
  const paymentId = input.existingId || makeId('PAY');
  const path = `payments/${paymentId}`;

  try {
    const refDoc = doc(db, 'payments', paymentId);
    if (input.existingId) {
      await updateDoc(refDoc, {
        direction: input.direction,
        amount: safeAmount,
        date: safeDate,
        method: input.method,
        reference: safeRef,
        verified: Boolean(input.verified),
        notes: (input.notes || '').slice(0, 400),
        memberUid: input.member.memberUid,
        updatedAt: serverTimestamp(),
      });
      await logActivity('UPDATE_PAYMENT', 'payments', paymentId, `Updated payment ₹${safeAmount} (${input.method})`);
    } else {
      await setDoc(refDoc, {
        paymentId,
        memberId: input.member.memberId,
        memberUid: input.member.memberUid,
        direction: input.direction,
        amount: safeAmount,
        date: safeDate,
        method: input.method,
        reference: safeRef,
        verified: Boolean(input.verified),
        notes: (input.notes || '').slice(0, 400),
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await logActivity('CREATE_PAYMENT', 'payments', paymentId, `Payment ${input.direction} ₹${safeAmount} via ${input.method}`);
    }
    return paymentId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deletePaymentTransaction(pay: PaymentTransaction): Promise<void> {
  try {
    await deleteDoc(doc(db, 'payments', pay.paymentId));
    await logActivity('DELETE_PAYMENT', 'payments', pay.paymentId, `Deleted payment ₹${pay.amount}`);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `payments/${pay.paymentId}`);
  }
}

export async function saveSalaryRecordAndSlip(
  record: Omit<SalaryRecord, 'createdBy' | 'createdAt' | 'updatedAt'>,
  slip: Omit<SalarySlip, 'createdBy' | 'createdAt'>
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Admin authentication required.');

  const safeRecord = {
    ...record,
    startDate: ensureValidDateISO(record.startDate),
    endDate: ensureValidDateISO(record.endDate),
    presentDays: nonNeg(record.presentDays),
    absentDays: nonNeg(record.absentDays),
    workingHours: nonNeg(record.workingHours),
    otHours: nonNeg(record.otHours),
    dailyRate: nonNeg(record.dailyRate),
    otRate: nonNeg(record.otRate),
    baseSalary: nonNeg(record.baseSalary),
    otSalary: nonNeg(record.otSalary),
    grossSalary: nonNeg(record.grossSalary),
    normalAdvance: safeNumber(record.normalAdvance),
    cookingAdvance: safeNumber(record.cookingAdvance),
    previousPayments: safeNumber(record.previousPayments),
    netBalance: safeNumber(record.netBalance),
  };

  const safeSlip = {
    ...slip,
    memberCode: slip.memberCode.trim().slice(0, 32) || slip.memberId,
    memberName: slip.memberName.trim().slice(0, 120) || 'Member',
    memberPhone: (slip.memberPhone || '').slice(0, 20),
    periodLabel: slip.periodLabel.trim().slice(0, 100) || `${safeRecord.startDate} to ${safeRecord.endDate}`,
    startDate: safeRecord.startDate,
    endDate: safeRecord.endDate,
    presentDays: safeRecord.presentDays,
    absentDays: safeRecord.absentDays,
    workingHours: safeRecord.workingHours,
    otHours: safeRecord.otHours,
    dailyRate: safeRecord.dailyRate,
    otRate: safeRecord.otRate,
    baseSalary: safeRecord.baseSalary,
    otSalary: safeRecord.otSalary,
    grossSalary: safeRecord.grossSalary,
    normalAdvance: safeRecord.normalAdvance,
    cookingAdvance: safeRecord.cookingAdvance,
    previousPayments: safeRecord.previousPayments,
    finalBalance: safeNumber(slip.finalBalance),
  };

  try {
    const salaryRef = doc(db, 'salaryRecords', safeRecord.recordId);
    const existingSalary = await getDoc(salaryRef);
    if (existingSalary.exists()) {
      await updateDoc(salaryRef, {
        presentDays: safeRecord.presentDays,
        absentDays: safeRecord.absentDays,
        workingHours: safeRecord.workingHours,
        otHours: safeRecord.otHours,
        dailyRate: safeRecord.dailyRate,
        otRate: safeRecord.otRate,
        baseSalary: safeRecord.baseSalary,
        otSalary: safeRecord.otSalary,
        grossSalary: safeRecord.grossSalary,
        normalAdvance: safeRecord.normalAdvance,
        cookingAdvance: safeRecord.cookingAdvance,
        previousPayments: safeRecord.previousPayments,
        netBalance: safeRecord.netBalance,
        balanceDirection: safeRecord.balanceDirection,
        memberUid: safeRecord.memberUid,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(salaryRef, {
        ...safeRecord,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await setDoc(doc(db, 'salarySlips', safeSlip.slipId), {
      ...safeSlip,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
    });
    await logActivity('GENERATE_SALARY_SLIP', 'salarySlips', safeSlip.slipId, `Generated salary slip for ${safeSlip.memberName} (${safeSlip.periodLabel})`);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `salarySlips/${safeSlip.slipId}`);
  }
}

export async function deleteSalarySlip(slipId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'salarySlips', slipId));
    await logActivity('DELETE_SLIP', 'salarySlips', slipId, `Deleted salary slip ${slipId}`);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `salarySlips/${slipId}`);
  }
}

export async function createNotificationRecord(input: {
  member: Member;
  title: string;
  message: string;
  type: NotificationItem['type'];
  channel: NotificationItem['channel'];
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const notificationId = makeId('NTF');
  try {
    await setDoc(doc(db, 'notifications', notificationId), {
      notificationId,
      memberId: input.member.memberId,
      memberUid: input.member.memberUid,
      title: input.title.slice(0, 140),
      message: input.message.slice(0, 1000),
      type: input.type,
      channel: input.channel,
      read: false,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `notifications/${notificationId}`);
  }
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), { read: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `notifications/${notificationId}`);
  }
}

export async function deleteCollectionDoc(collectionName: string, docId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, collectionName, docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${collectionName}/${docId}`);
  }
}

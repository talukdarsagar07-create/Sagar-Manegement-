import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadString } from 'firebase/storage';
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
      actorName: (user.displayName || user.email || 'Admin').slice(0, 120),
      action: action.slice(0, 80),
      entityType: entityType.slice(0, 40),
      entityId: entityId.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128),
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
      defaultOtRate: Number(data.defaultOtRate) || 0,
      standardWorkHours: Math.min(24, Math.max(1, Number(data.standardWorkHours) || 8)),
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
  const idToken = await user.getIdToken();
  const memberId = makeId('SM');

  const prepResp = await fetch('/api/admin/members/prepare', {
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
  const prep = (await prepResp.json()) as {
    ok?: boolean;
    error?: string;
    phoneNormalized: string;
    authEmail: string;
    memberUid: string;
    passwordHash: string;
    passwordSalt: string;
  };
  if (!prepResp.ok || !prep.ok) {
    throw new Error(prep.error || 'Failed to prepare member credentials.');
  }

  try {
    await setDoc(doc(db, 'members', memberId), {
      memberId,
      memberCode: input.memberCode.trim().slice(0, 32) || memberId,
      memberUid: prep.memberUid,
      fullName: input.fullName.trim().slice(0, 120),
      phone: prep.phoneNormalized,
      joiningDate: input.joiningDate,
      dailySalaryRate: Number(input.dailySalaryRate) || 0,
      otRate: Number(input.otRate) || 0,
      previousBalance: Number(input.previousBalance) || 0,
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

    await setDoc(doc(db, 'users', prep.memberUid), {
      uid: prep.memberUid,
      role: 'member',
      memberId,
      phone: prep.phoneNormalized,
      displayName: input.fullName.trim().slice(0, 120),
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await logActivity('CREATE_MEMBER', 'members', memberId, `Added member ${input.fullName} (${prep.phoneNormalized})`);
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
  try {
    await updateDoc(doc(db, 'members', memberId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    await logActivity('UPDATE_MEMBER', 'members', memberId, `Updated member profile ${updates.fullName || memberId}`);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function resetMemberPasswordByAdmin(
  member: Member,
  newPassword: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Admin authentication required.');
  const idToken = await user.getIdToken();

  const resp = await fetch('/api/admin/members/reset-password', {
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
  const data = (await resp.json()) as {
    ok?: boolean;
    error?: string;
    phoneNormalized: string;
    authEmail: string;
    passwordHash: string;
    passwordSalt: string;
  };
  if (!resp.ok || !data.ok) {
    throw new Error(data.error || 'Password reset failed.');
  }

  try {
    await setDoc(doc(db, 'memberCredentials', data.phoneNormalized), {
      phoneNormalized: data.phoneNormalized,
      memberId: member.memberId,
      memberUid: member.memberUid,
      authEmail: data.authEmail,
      passwordHash: data.passwordHash,
      passwordSalt: data.passwordSalt,
      updatedBy: user.uid,
      updatedAt: serverTimestamp(),
    });
    await logActivity('RESET_PASSWORD', 'members', member.memberId, `Reset password for ${member.fullName}`);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `memberCredentials/${data.phoneNormalized}`);
  }
}

export async function deleteMemberRecord(member: Member): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Admin authentication required.');
  try {
    const idToken = await user.getIdToken();
    await fetch('/api/admin/members/delete-auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ memberUid: member.memberUid }),
    }).catch(() => {});

    await deleteDoc(doc(db, 'members', member.memberId));
    await deleteDoc(doc(db, 'memberCredentials', member.phone)).catch(() => {});
    await deleteDoc(doc(db, 'users', member.memberUid)).catch(() => {});
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
  const recordId = `${input.member.memberId}_${input.date}`.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const path = `attendance/${recordId}`;

  try {
    const refDoc = doc(db, 'attendance', recordId);
    if (input.existing) {
      await updateDoc(refDoc, {
        status: input.status,
        workingHours: input.status === 'P' ? Number(input.workingHours) : 0,
        otHours: Number(input.otHours) || 0,
        notes: (input.notes || '').slice(0, 300),
        memberUid: input.member.memberUid,
        updatedBy: user.uid,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(refDoc, {
        recordId,
        memberId: input.member.memberId,
        memberUid: input.member.memberUid,
        date: input.date,
        status: input.status,
        workingHours: input.status === 'P' ? Number(input.workingHours) : 0,
        otHours: Number(input.otHours) || 0,
        notes: (input.notes || '').slice(0, 300),
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
  const recordId = input.existingId || `${input.member.memberId}_${input.date}_ot`.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const amount = Math.round(Number(input.hours) * Number(input.rate) * 100) / 100;
  const path = `overtimeRecords/${recordId}`;

  try {
    const refDoc = doc(db, 'overtimeRecords', recordId);
    const snap = await getDoc(refDoc);
    if (snap.exists()) {
      await updateDoc(refDoc, {
        date: input.date,
        hours: Number(input.hours),
        rate: Number(input.rate),
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
        date: input.date,
        hours: Number(input.hours),
        rate: Number(input.rate),
        amount,
        notes: (input.notes || '').slice(0, 300),
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await logActivity('SAVE_OT', 'overtimeRecords', recordId, `OT ${input.hours}h for ${input.member.fullName} on ${input.date}`);
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
  const advanceId = input.existingId || makeId('ADV');
  const path = `advances/${advanceId}`;

  try {
    const refDoc = doc(db, 'advances', advanceId);
    if (input.existingId) {
      await updateDoc(refDoc, {
        category: input.category,
        transactionType: input.transactionType,
        amount: Number(input.amount),
        date: input.date,
        paymentMethod: input.paymentMethod,
        reference: (input.reference || '').slice(0, 120),
        notes: (input.notes || '').slice(0, 400),
        memberUid: input.member.memberUid,
        updatedAt: serverTimestamp(),
      });
      await logActivity('UPDATE_ADVANCE', 'advances', advanceId, `Updated ${input.category} advance (${input.amount}) for ${input.member.fullName}`);
    } else {
      await setDoc(refDoc, {
        advanceId,
        memberId: input.member.memberId,
        memberUid: input.member.memberUid,
        category: input.category,
        transactionType: input.transactionType,
        amount: Number(input.amount),
        date: input.date,
        paymentMethod: input.paymentMethod,
        reference: (input.reference || '').slice(0, 120),
        notes: (input.notes || '').slice(0, 400),
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await logActivity('CREATE_ADVANCE', 'advances', advanceId, `${input.category} ${input.transactionType} ₹${input.amount} for ${input.member.fullName}`);
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
  const paymentId = input.existingId || makeId('PAY');
  const path = `payments/${paymentId}`;

  try {
    const refDoc = doc(db, 'payments', paymentId);
    if (input.existingId) {
      await updateDoc(refDoc, {
        direction: input.direction,
        amount: Number(input.amount),
        date: input.date,
        method: input.method,
        reference: input.reference.trim().slice(0, 120),
        verified: Boolean(input.verified),
        notes: (input.notes || '').slice(0, 400),
        memberUid: input.member.memberUid,
        updatedAt: serverTimestamp(),
      });
      await logActivity('UPDATE_PAYMENT', 'payments', paymentId, `Updated payment ₹${input.amount} (${input.method})`);
    } else {
      await setDoc(refDoc, {
        paymentId,
        memberId: input.member.memberId,
        memberUid: input.member.memberUid,
        direction: input.direction,
        amount: Number(input.amount),
        date: input.date,
        method: input.method,
        reference: input.reference.trim().slice(0, 120),
        verified: Boolean(input.verified),
        notes: (input.notes || '').slice(0, 400),
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await logActivity('CREATE_PAYMENT', 'payments', paymentId, `Payment ${input.direction} ₹${input.amount} via ${input.method}`);
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
  try {
    await setDoc(doc(db, 'salaryRecords', record.recordId), {
      ...record,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'salarySlips', slip.slipId), {
      ...slip,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
    });
    await logActivity('GENERATE_SALARY_SLIP', 'salarySlips', slip.slipId, `Generated salary slip for ${slip.memberName} (${slip.periodLabel})`);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `salarySlips/${slip.slipId}`);
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

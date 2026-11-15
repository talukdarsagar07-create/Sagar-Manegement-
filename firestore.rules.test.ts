/**
 * SAGAR MANAGEMENT — Firestore Security Rules Test Specification
 * Verifies all Dirty Dozen adversarial payloads and authorized workflows.
 */

export interface SecurityTestCase {
  id: string;
  description: string;
  actor: 'anonymous' | 'memberA' | 'memberB' | 'unverifiedSpoof' | 'admin';
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  expected: 'ALLOW' | 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: SecurityTestCase[] = [
  { id: 'DD-01', description: 'Unauthenticated read on members', actor: 'anonymous', operation: 'get', path: 'members/SM-1001', expected: 'PERMISSION_DENIED' },
  { id: 'DD-02', description: 'Member A blanket list on members', actor: 'memberA', operation: 'list', path: 'members', expected: 'PERMISSION_DENIED' },
  { id: 'DD-03', description: 'Member A read Member B advance', actor: 'memberA', operation: 'get', path: 'advances/adv_memberB', expected: 'PERMISSION_DENIED' },
  { id: 'DD-04', description: 'Member A creating attendance record', actor: 'memberA', operation: 'create', path: 'attendance/SM-1001_2026-11-14', expected: 'PERMISSION_DENIED' },
  { id: 'DD-05', description: 'Member A updating own dailySalaryRate', actor: 'memberA', operation: 'update', path: 'members/SM-1001', expected: 'PERMISSION_DENIED' },
  { id: 'DD-06', description: 'Member A escalating role in /admins', actor: 'memberA', operation: 'create', path: 'admins/uid_memberA', expected: 'PERMISSION_DENIED' },
  { id: 'DD-07', description: 'Unverified email spoofing admin email', actor: 'unverifiedSpoof', operation: 'create', path: 'members/SM-9999', expected: 'PERMISSION_DENIED' },
  { id: 'DD-08', description: 'Shadow field injection on payment', actor: 'admin', operation: 'create', path: 'payments/pay_ghost', expected: 'PERMISSION_DENIED' },
  { id: 'DD-09', description: 'Invalid path ID poisoning', actor: 'admin', operation: 'create', path: 'advances/bad$id!', expected: 'PERMISSION_DENIED' },
  { id: 'DD-10', description: 'Forged client createdAt timestamp', actor: 'admin', operation: 'create', path: 'payments/pay_backdate', expected: 'PERMISSION_DENIED' },
  { id: 'DD-11', description: 'Member A reading memberCredentials', actor: 'memberA', operation: 'get', path: 'memberCredentials/9876543210', expected: 'PERMISSION_DENIED' },
  { id: 'DD-12', description: 'Admin deleting immutable activityLog', actor: 'admin', operation: 'delete', path: 'activityLogs/log_1', expected: 'PERMISSION_DENIED' },
];

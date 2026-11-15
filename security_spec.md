# SAGAR MANAGEMENT — Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Strict Admin Authority**: Only verified admins (`request.auth.token.email_verified == true && request.auth.token.email == 'talukdarsagar07@gmail.com'` or an existing `/admins/{request.auth.uid}` document) may create, update, or delete `members`, `memberCredentials`, `attendance`, `overtimeRecords`, `salaryRecords`, `advances`, `payments`, `salarySlips`, `settings`, and `activityLogs`.
2. **Member Data Isolation**: Authenticated members can ONLY read (`get` / `list`) documents in `members`, `attendance`, `overtimeRecords`, `salaryRecords`, `advances`, `payments`, `salarySlips`, and `notifications` where `resource.data.memberUid == request.auth.uid`. Members can NEVER read `memberCredentials`, `activityLogs`, or other members' records.
3. **No Financial Tampering by Members**: Members have zero write access to `attendance`, `overtimeRecords`, `salaryRecords`, `advances`, `payments`, `salarySlips`, `members`, `settings`, or `admins`. Members may only mark their own `notifications` as `read: true`.
4. **No Plain-Text Passwords**: `memberCredentials` stores only `passwordHash` and `passwordSalt` and is strictly Admin-only (never readable by members or unauthenticated clients).
5. **Immutable Audit & Creation Timestamps**: All `createdAt` fields must equal `request.time` on creation and remain immutable on update. All `updatedAt` fields must equal `request.time` on update.
6. **Path ID Poisoning Protection**: Single-document `get`, `create`, `update`, and `delete` operations enforce `isValidId(docId)` (`^[a-zA-Z0-9_\-]+$`, max 128 chars).
7. **Zero Shadow Fields**: Every `create` validates exact `keys().hasAll(...)` and `keys().hasOnly(...)`; every `update` validates `isValid[Entity](incoming())` and `affectedKeys().hasOnly(...)`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Member Read**: Unauthenticated client requests `get /members/SM-1001` -> `PERMISSION_DENIED`.
2. **Cross-Member PII Scrape**: Authenticated Member A (`uid_A`) queries `list /members` without `where('memberUid', '==', 'uid_A')` -> `PERMISSION_DENIED`.
3. **Cross-Member Financial Read**: Member A (`uid_A`) attempts `get /advances/adv_memberB` -> `PERMISSION_DENIED`.
4. **Member Self-Attendance Fraud**: Member A attempts `create /attendance/SM-1001_2026-11-14` with `status: "P"` -> `PERMISSION_DENIED`.
5. **Member Salary Rate Tampering**: Member A attempts `update /members/SM-1001` changing `dailySalaryRate` from `600` to `6000` -> `PERMISSION_DENIED`.
6. **Member Privilege Escalation**: Member A attempts `create /admins/uid_A` or `update /users/uid_A` setting `role: "admin"` -> `PERMISSION_DENIED`.
7. **Unverified Admin Email Spoof**: User with unverified email (`email_verified: false`, `email: 'talukdarsagar07@gmail.com'`) attempts `create /members/SM-999` -> `PERMISSION_DENIED`.
8. **Shadow Field Injection**: Authenticated user attempts `create /members/SM-1002` with extra ghost field `isSuperAdmin: true` -> `PERMISSION_DENIED`.
9. **Path ID Poisoning**: Client attempts `create /advances/../../bad$id` with invalid characters or >128 bytes -> `PERMISSION_DENIED`.
10. **Client Timestamp Forgery**: Admin/User attempts `create /payments/pay_1` with backdated `createdAt` not equal to `request.time` -> `PERMISSION_DENIED`.
11. **Credential Harvest**: Member A attempts `get /memberCredentials/9876543210` -> `PERMISSION_DENIED`.
12. **Audit Log Tampering**: Any user attempts `update` or `delete` on `/activityLogs/{logId}` -> `PERMISSION_DENIED`.

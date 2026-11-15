export type Language = 'en' | 'bn';

export type UserRole = 'admin' | 'member';

export type AttendanceStatus = 'P' | 'A';

export type AdvanceCategory = 'NORMAL' | 'COOKING';

export type AdvanceTransactionType = 'GIVEN' | 'REPAYMENT';

export type PaymentMethod = 'PhonePe' | 'Google Pay' | 'Paytm' | 'UPI' | 'Cash' | 'Bank';

export type PaymentDirection = 'TO_MEMBER' | 'FROM_MEMBER';

export type BalanceDirection = 'YOU OWE MEMBER' | 'MEMBER OWES YOU' | 'ALL SETTLED';

export type PeriodType = 'weekly' | 'monthly' | 'custom';

export interface Member {
  memberId: string;
  memberCode: string;
  memberUid: string;
  fullName: string;
  phone: string;
  joiningDate: string;
  dailySalaryRate: number;
  otRate: number;
  previousBalance: number; // positive = admin owes member, negative = member owes admin
  photoUrl?: string;
  qrData?: string;
  upiId?: string;
  status: 'active' | 'inactive';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AttendanceRecord {
  recordId: string;
  memberId: string;
  memberUid: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  workingHours: number;
  otHours: number;
  notes?: string;
  updatedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface OvertimeRecord {
  recordId: string;
  memberId: string;
  memberUid: string;
  date: string;
  hours: number;
  rate: number;
  amount: number;
  notes?: string;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AdvanceTransaction {
  advanceId: string;
  memberId: string;
  memberUid: string;
  category: AdvanceCategory;
  transactionType: AdvanceTransactionType;
  amount: number;
  date: string;
  notes?: string;
  paymentMethod: PaymentMethod;
  reference?: string;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PaymentTransaction {
  paymentId: string;
  memberId: string;
  memberUid: string;
  direction: PaymentDirection;
  amount: number;
  date: string;
  method: PaymentMethod;
  reference: string;
  verified: boolean;
  notes?: string;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SalaryRecord {
  recordId: string;
  memberId: string;
  memberUid: string;
  periodType: PeriodType;
  startDate: string;
  endDate: string;
  presentDays: number;
  absentDays: number;
  workingHours: number;
  otHours: number;
  dailyRate: number;
  otRate: number;
  baseSalary: number;
  otSalary: number;
  grossSalary: number;
  normalAdvance: number;
  cookingAdvance: number;
  previousPayments: number;
  netBalance: number;
  balanceDirection: BalanceDirection;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SalarySlip {
  slipId: string;
  memberId: string;
  memberUid: string;
  memberCode: string;
  memberName: string;
  memberPhone: string;
  periodLabel: string;
  startDate: string;
  endDate: string;
  presentDays: number;
  absentDays: number;
  workingHours: number;
  otHours: number;
  dailyRate: number;
  otRate: number;
  baseSalary: number;
  otSalary: number;
  grossSalary: number;
  normalAdvance: number;
  cookingAdvance: number;
  previousPayments: number;
  finalBalance: number;
  balanceDirection: BalanceDirection;
  createdBy: string;
  createdAt?: unknown;
}

export interface AppSettings {
  settingId: string;
  companyName: string;
  tagline?: string;
  upiId?: string;
  upiName?: string;
  adminQrImage?: string;
  smsProviderEndpoint?: string;
  smsSenderId?: string;
  defaultOtRate: number;
  standardWorkHours: number;
  updatedBy: string;
  updatedAt?: unknown;
}

export interface NotificationItem {
  notificationId: string;
  memberId?: string;
  memberUid: string;
  title: string;
  message: string;
  type: 'attendance' | 'salary' | 'advance' | 'payment' | 'system';
  channel: 'in_app' | 'whatsapp' | 'sms';
  read: boolean;
  createdBy: string;
  createdAt?: unknown;
}

export interface ActivityLog {
  logId: string;
  actorUid: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  createdAt?: unknown;
}

export interface MemberFinancialSummary {
  member: Member;
  presentDays: number;
  absentDays: number;
  totalMarkedDays: number;
  attendancePercent: number;
  workingHours: number;
  otHours: number;
  totalSalaryEarned: number;
  totalOtEarned: number;
  grossEarned: number;
  normalAdvanceGiven: number;
  normalAdvanceRepaid: number;
  normalAdvanceNet: number;
  cookingAdvanceGiven: number;
  cookingAdvanceRepaid: number;
  cookingAdvanceNet: number;
  totalAdvanceOutstanding: number;
  salaryPaymentsGiven: number;
  salaryPaymentsReceived: number;
  previousBalance: number;
  rawNetBalance: number; // positive => YOU OWE MEMBER, negative => MEMBER OWES YOU
  absBalance: number;
  balanceDirection: BalanceDirection;
}

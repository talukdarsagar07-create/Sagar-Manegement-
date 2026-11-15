import type {
  AdvanceTransaction,
  AttendanceRecord,
  BalanceDirection,
  Member,
  MemberFinancialSummary,
  OvertimeRecord,
  PaymentTransaction,
} from '../types';

export function safeNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function formatCurrency(amount: number): string {
  const safe = safeNumber(amount, 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
    minimumFractionDigits: safe % 1 === 0 ? 0 : 2,
  }).format(safe);
}

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function ensureValidDateISO(dateStr: string | undefined | null): string {
  if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const parsed = new Date(`${dateStr}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return dateStr;
    }
  }
  return todayISO();
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function getDaysInRange(startDate: string, endDate: string): string[] {
  const result: string[] = [];
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
    startDate > endDate
  ) {
    return result;
  }
  const current = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(current.getTime()) || Number.isNaN(end.getTime())) {
    return result;
  }
  let guard = 0;
  while (current <= end && guard < 366) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    result.push(`${y}-${m}-${d}`);
    current.setDate(current.getDate() + 1);
    guard += 1;
  }
  return result;
}

export function getWeekRange(anchorDate: string): { startDate: string; endDate: string; days: string[] } {
  const safeAnchor = ensureValidDateISO(anchorDate);
  const base = new Date(`${safeAnchor}T00:00:00`);
  const dayOfWeek = base.getDay(); // 0 = Sun, 1 = Mon
  const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const start = new Date(base);
  start.setDate(base.getDate() + diffToMon);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const toISO = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const startDate = toISO(start);
  const endDate = toISO(end);
  return { startDate, endDate, days: getDaysInRange(startDate, endDate) };
}

export function getMonthRange(year: number, monthIndex0: number): { startDate: string; endDate: string; days: string[] } {
  const now = new Date();
  const safeYear = Number.isFinite(year) && year >= 1970 && year <= 2100 ? year : now.getFullYear();
  const safeMonth0 =
    Number.isFinite(monthIndex0) && monthIndex0 >= 0 && monthIndex0 <= 11
      ? monthIndex0
      : now.getMonth();
  const start = new Date(safeYear, safeMonth0, 1);
  const end = new Date(safeYear, safeMonth0 + 1, 0);
  const toISO = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const startDate = toISO(start);
  const endDate = toISO(end);
  return { startDate, endDate, days: getDaysInRange(startDate, endDate) };
}

export function resolveBalanceDirection(rawNetBalance: number): BalanceDirection {
  const rounded = Math.round(safeNumber(rawNetBalance, 0) * 100) / 100;
  if (rounded > 0.01) return 'YOU OWE MEMBER';
  if (rounded < -0.01) return 'MEMBER OWES YOU';
  return 'ALL SETTLED';
}

export function getBalanceVisuals(direction: BalanceDirection) {
  if (direction === 'YOU OWE MEMBER') {
    return {
      amountTextClass: 'text-emerald-600 dark:text-emerald-400',
      badgeClass:
        'border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/60 dark:text-emerald-300',
      bannerClass:
        'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30',
      dotClass: 'bg-emerald-600 dark:bg-emerald-400',
    };
  }
  if (direction === 'MEMBER OWES YOU') {
    return {
      amountTextClass: 'text-red-600 dark:text-red-400',
      badgeClass:
        'border-red-200 bg-red-100 text-red-800 dark:border-red-800/70 dark:bg-red-950/60 dark:text-red-300',
      bannerClass:
        'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30',
      dotClass: 'bg-red-600 dark:bg-red-400',
    };
  }
  return {
    amountTextClass: 'text-slate-600 dark:text-slate-300',
    badgeClass:
      'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
    bannerClass:
      'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900',
    dotClass: 'bg-slate-500',
  };
}

export function getStandardWorkHours(standardWorkHours?: number | null): number {
  const num = Number(standardWorkHours);
  return Number.isFinite(num) && num > 0 ? num : 8;
}

export function formatHoursShort(hours: number): string {
  const rounded = Math.round(safeNumber(hours, 0) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function getAttendanceDayFactor(
  record: Pick<AttendanceRecord, 'status' | 'workingHours'> | undefined,
  standardWorkHours = 8
): number {
  if (!record || record.status !== 'P') return 0;
  const std = getStandardWorkHours(standardWorkHours);
  if (record.workingHours === undefined || record.workingHours === null) {
    return 1;
  }
  const hrs = safeNumber(record.workingHours, std);
  if (hrs <= 0) return 0;
  if (hrs >= std) return 1;
  return hrs / std;
}

export function isPartialAttendance(
  record: Pick<AttendanceRecord, 'status' | 'workingHours'> | undefined,
  standardWorkHours = 8
): boolean {
  if (!record || record.status !== 'P') return false;
  const std = getStandardWorkHours(standardWorkHours);
  if (record.workingHours === undefined || record.workingHours === null) return false;
  const hrs = safeNumber(record.workingHours, std);
  return hrs > 0 && hrs < std;
}

export function getAttendanceCode(
  record: Pick<AttendanceRecord, 'status' | 'workingHours'> | undefined,
  standardWorkHours = 8
): string {
  if (!record) return '·';
  if (record.status === 'A') return 'A';
  const std = getStandardWorkHours(standardWorkHours);
  if (record.workingHours === undefined || record.workingHours === null) return 'P';
  const hrs = safeNumber(record.workingHours, std);
  if (hrs > 0 && hrs < std) {
    return `P${formatHoursShort(hrs)}`;
  }
  if (hrs <= 0) return 'A';
  return 'P';
}

export function computeMemberFinancialSummary(
  member: Member,
  allAttendance: AttendanceRecord[],
  allOvertime: OvertimeRecord[],
  allAdvances: AdvanceTransaction[],
  allPayments: PaymentTransaction[],
  dateRange?: { startDate: string; endDate: string },
  standardWorkHours = 8
): MemberFinancialSummary {
  const stdHours = getStandardWorkHours(standardWorkHours);
  const hasValidRange =
    Boolean(dateRange?.startDate) &&
    Boolean(dateRange?.endDate) &&
    dateRange!.startDate <= dateRange!.endDate;
  const inRange = (date: string) =>
    !hasValidRange || (date >= dateRange!.startDate && date <= dateRange!.endDate);

  const memberAtt = allAttendance.filter((a) => a.memberId === member.memberId && inRange(a.date));
  const memberOt = allOvertime.filter((o) => o.memberId === member.memberId && inRange(o.date));
  const memberAdv = allAdvances.filter((a) => a.memberId === member.memberId && inRange(a.date));
  const memberPay = allPayments.filter((p) => p.memberId === member.memberId && p.verified && inRange(p.date));

  const rawEquivalentPresentDays = memberAtt.reduce(
    (sum, a) => sum + getAttendanceDayFactor(a, stdHours),
    0
  );
  const presentDays = Math.round(rawEquivalentPresentDays * 100) / 100;
  const absentDays = memberAtt.filter(
    (a) => a.status === 'A' || (a.status === 'P' && safeNumber(a.workingHours, stdHours) <= 0)
  ).length;
  const totalMarkedDays = memberAtt.filter((a) => a.status === 'P' || a.status === 'A').length;
  const attendancePercent =
    totalMarkedDays > 0
      ? Math.min(100, Math.round((rawEquivalentPresentDays / totalMarkedDays) * 1000) / 10)
      : 0;

  const workingHours =
    Math.round(
      memberAtt.reduce(
        (sum, a) => sum + (a.status === 'P' ? safeNumber(a.workingHours, stdHours) : 0),
        0
      ) * 100
    ) / 100;

  // Overtime hours come from explicit overtimeRecords + any attendance otHours not duplicated
  // To avoid double-counting, if overtimeRecords exist for a date, prefer overtimeRecords; else use attendance.otHours
  const otDatesFromRecords = new Set(memberOt.map((o) => o.date));
  const extraAttOtHours = memberAtt
    .filter((a) => !otDatesFromRecords.has(a.date))
    .reduce((sum, a) => sum + safeNumber(a.otHours, 0), 0);

  const memberOtRate = safeNumber(member.otRate, 0);
  const memberDailyRate = safeNumber(member.dailySalaryRate, 0);

  const recordOtHours = memberOt.reduce((sum, o) => sum + safeNumber(o.hours, 0), 0);
  const otHours = Math.round((recordOtHours + extraAttOtHours) * 100) / 100;

  const recordOtPay = memberOt.reduce((sum, o) => {
    const pay =
      o.amount !== undefined && o.amount !== null && Number.isFinite(Number(o.amount))
        ? Number(o.amount)
        : safeNumber(o.hours, 0) * safeNumber(o.rate, memberOtRate);
    return sum + pay;
  }, 0);
  const extraAttOtPay = extraAttOtHours * memberOtRate;
  const totalOtEarned = Math.round((recordOtPay + extraAttOtPay) * 100) / 100;

  const totalSalaryEarned = Math.round(rawEquivalentPresentDays * memberDailyRate * 100) / 100;
  const grossEarned = Math.round((totalSalaryEarned + totalOtEarned) * 100) / 100;

  const normalAdvanceGiven = memberAdv
    .filter((a) => a.category === 'NORMAL' && a.transactionType === 'GIVEN')
    .reduce((sum, a) => sum + safeNumber(a.amount, 0), 0);
  const normalAdvanceRepaid = memberAdv
    .filter((a) => a.category === 'NORMAL' && a.transactionType === 'REPAYMENT')
    .reduce((sum, a) => sum + safeNumber(a.amount, 0), 0);
  const normalAdvanceNet = Math.round((normalAdvanceGiven - normalAdvanceRepaid) * 100) / 100;

  const cookingAdvanceGiven = memberAdv
    .filter((a) => a.category === 'COOKING' && a.transactionType === 'GIVEN')
    .reduce((sum, a) => sum + safeNumber(a.amount, 0), 0);
  const cookingAdvanceRepaid = memberAdv
    .filter((a) => a.category === 'COOKING' && a.transactionType === 'REPAYMENT')
    .reduce((sum, a) => sum + safeNumber(a.amount, 0), 0);
  const cookingAdvanceNet = Math.round((cookingAdvanceGiven - cookingAdvanceRepaid) * 100) / 100;

  const totalAdvanceOutstanding = Math.round((normalAdvanceNet + cookingAdvanceNet) * 100) / 100;

  const salaryPaymentsGiven =
    Math.round(
      memberPay
        .filter((p) => p.direction === 'TO_MEMBER')
        .reduce((sum, p) => sum + safeNumber(p.amount, 0), 0) * 100
    ) / 100;
  const salaryPaymentsReceived =
    Math.round(
      memberPay
        .filter((p) => p.direction === 'FROM_MEMBER')
        .reduce((sum, p) => sum + safeNumber(p.amount, 0), 0) * 100
    ) / 100;

  const previousBalance = hasValidRange ? 0 : safeNumber(member.previousBalance, 0);

  // Net Balance Equation:
  // Credits owed TO Member: previousBalance + grossEarned + salaryPaymentsReceived (member returned cash/repaid)
  // Debits paid TO Member: totalAdvanceOutstanding + salaryPaymentsGiven
  const rawNetBalance =
    Math.round(
      (previousBalance +
        grossEarned +
        salaryPaymentsReceived -
        totalAdvanceOutstanding -
        salaryPaymentsGiven) *
        100
    ) / 100;

  return {
    member,
    presentDays,
    absentDays,
    totalMarkedDays,
    attendancePercent,
    workingHours,
    otHours,
    totalSalaryEarned,
    totalOtEarned,
    grossEarned,
    normalAdvanceGiven,
    normalAdvanceRepaid,
    normalAdvanceNet,
    cookingAdvanceGiven,
    cookingAdvanceRepaid,
    cookingAdvanceNet,
    totalAdvanceOutstanding,
    salaryPaymentsGiven,
    salaryPaymentsReceived,
    previousBalance,
    rawNetBalance,
    absBalance: Math.abs(rawNetBalance),
    balanceDirection: resolveBalanceDirection(rawNetBalance),
  };
}

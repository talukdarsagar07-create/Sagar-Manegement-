import type {
  AdvanceTransaction,
  AttendanceRecord,
  BalanceDirection,
  Member,
  MemberFinancialSummary,
  OvertimeRecord,
  PaymentTransaction,
} from '../types';

export function formatCurrency(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
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

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function getDaysInRange(startDate: string, endDate: string): string[] {
  const result: string[] = [];
  if (!startDate || !endDate || startDate > endDate) return result;
  const current = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
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
  const base = new Date(`${anchorDate}T00:00:00`);
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
  const start = new Date(year, monthIndex0, 1);
  const end = new Date(year, monthIndex0 + 1, 0);
  const toISO = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const startDate = toISO(start);
  const endDate = toISO(end);
  return { startDate, endDate, days: getDaysInRange(startDate, endDate) };
}

export function resolveBalanceDirection(rawNetBalance: number): BalanceDirection {
  const rounded = Math.round(rawNetBalance * 100) / 100;
  if (rounded > 0.01) return 'YOU OWE MEMBER';
  if (rounded < -0.01) return 'MEMBER OWES YOU';
  return 'ALL SETTLED';
}

export function computeMemberFinancialSummary(
  member: Member,
  allAttendance: AttendanceRecord[],
  allOvertime: OvertimeRecord[],
  allAdvances: AdvanceTransaction[],
  allPayments: PaymentTransaction[],
  dateRange?: { startDate: string; endDate: string }
): MemberFinancialSummary {
  const inRange = (date: string) =>
    !dateRange || (date >= dateRange.startDate && date <= dateRange.endDate);

  const memberAtt = allAttendance.filter((a) => a.memberId === member.memberId && inRange(a.date));
  const memberOt = allOvertime.filter((o) => o.memberId === member.memberId && inRange(o.date));
  const memberAdv = allAdvances.filter((a) => a.memberId === member.memberId && inRange(a.date));
  const memberPay = allPayments.filter((p) => p.memberId === member.memberId && p.verified && inRange(p.date));

  const presentDays = memberAtt.filter((a) => a.status === 'P').length;
  const absentDays = memberAtt.filter((a) => a.status === 'A').length;
  const totalMarkedDays = presentDays + absentDays;
  const attendancePercent = totalMarkedDays > 0 ? Math.round((presentDays / totalMarkedDays) * 1000) / 10 : 0;

  const workingHours = memberAtt.reduce((sum, a) => sum + (a.status === 'P' ? Number(a.workingHours || 0) : 0), 0);

  // Overtime hours come from explicit overtimeRecords + any attendance otHours not duplicated
  // To avoid double-counting, if overtimeRecords exist for a date, prefer overtimeRecords; else use attendance.otHours
  const otDatesFromRecords = new Set(memberOt.map((o) => o.date));
  const extraAttOtHours = memberAtt
    .filter((a) => !otDatesFromRecords.has(a.date))
    .reduce((sum, a) => sum + Number(a.otHours || 0), 0);

  const recordOtHours = memberOt.reduce((sum, o) => sum + Number(o.hours || 0), 0);
  const otHours = Math.round((recordOtHours + extraAttOtHours) * 100) / 100;

  const recordOtPay = memberOt.reduce((sum, o) => sum + Number(o.amount || o.hours * (o.rate || member.otRate)), 0);
  const extraAttOtPay = extraAttOtHours * Number(member.otRate || 0);
  const totalOtEarned = Math.round((recordOtPay + extraAttOtPay) * 100) / 100;

  const totalSalaryEarned = Math.round(presentDays * Number(member.dailySalaryRate || 0) * 100) / 100;
  const grossEarned = Math.round((totalSalaryEarned + totalOtEarned) * 100) / 100;

  const normalAdvanceGiven = memberAdv
    .filter((a) => a.category === 'NORMAL' && a.transactionType === 'GIVEN')
    .reduce((sum, a) => sum + Number(a.amount || 0), 0);
  const normalAdvanceRepaid = memberAdv
    .filter((a) => a.category === 'NORMAL' && a.transactionType === 'REPAYMENT')
    .reduce((sum, a) => sum + Number(a.amount || 0), 0);
  const normalAdvanceNet = Math.round((normalAdvanceGiven - normalAdvanceRepaid) * 100) / 100;

  const cookingAdvanceGiven = memberAdv
    .filter((a) => a.category === 'COOKING' && a.transactionType === 'GIVEN')
    .reduce((sum, a) => sum + Number(a.amount || 0), 0);
  const cookingAdvanceRepaid = memberAdv
    .filter((a) => a.category === 'COOKING' && a.transactionType === 'REPAYMENT')
    .reduce((sum, a) => sum + Number(a.amount || 0), 0);
  const cookingAdvanceNet = Math.round((cookingAdvanceGiven - cookingAdvanceRepaid) * 100) / 100;

  const totalAdvanceOutstanding = Math.round((normalAdvanceNet + cookingAdvanceNet) * 100) / 100;

  const salaryPaymentsGiven = memberPay
    .filter((p) => p.direction === 'TO_MEMBER')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const salaryPaymentsReceived = memberPay
    .filter((p) => p.direction === 'FROM_MEMBER')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const previousBalance = dateRange ? 0 : Number(member.previousBalance || 0);

  // Net Balance Equation:
  // Credits owed TO Member: previousBalance + grossEarned + salaryPaymentsReceived (member returned cash/repaid)
  // Debits paid TO Member: totalAdvanceOutstanding + salaryPaymentsGiven
  // Note: Advance repayments are already subtracted inside totalAdvanceOutstanding!
  // So if a member pays back cash via Payment (FROM_MEMBER), it reduces what member owes (adds to member's balance).
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

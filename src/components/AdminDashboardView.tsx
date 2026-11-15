import React, { useMemo } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarCheck,
  Clock,
  CreditCard,
  Users,
  Wallet,
} from 'lucide-react';
import {
  computeMemberFinancialSummary,
  formatCurrency,
  getMonthRange,
  getWeekRange,
  todayISO,
} from '../lib/accounting';
import { TRANSLATIONS } from '../lib/i18n';
import type {
  AdvanceTransaction,
  AttendanceRecord,
  Language,
  Member,
  OvertimeRecord,
  PaymentTransaction,
} from '../types';

interface AdminDashboardViewProps {
  lang: Language;
  members: Member[];
  attendance: AttendanceRecord[];
  overtime: OvertimeRecord[];
  advances: AdvanceTransaction[];
  payments: PaymentTransaction[];
  onNavigate: (tab: string) => void;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  lang,
  members,
  attendance,
  overtime,
  advances,
  payments,
  onNavigate,
}) => {
  const t = TRANSLATIONS[lang];
  const today = todayISO();
  const weekRange = useMemo(() => getWeekRange(today), [today]);
  const now = new Date();
  const monthRange = useMemo(
    () => getMonthRange(now.getFullYear(), now.getMonth()),
    [now.getFullYear(), now.getMonth()]
  );

  const stats = useMemo(() => {
    const todayRecords = attendance.filter((a) => a.date === today);
    const todayPresent = todayRecords.filter((a) => a.status === 'P').length;
    const todayAbsent = todayRecords.filter((a) => a.status === 'A').length;

    let weeklySalaryTotal = 0;
    let monthlySalaryTotal = 0;
    let totalOtEarned = 0;
    let totalAdvanceOutstanding = 0;
    let totalPaymentsGiven = 0;
    let totalPaymentsReceived = 0;
    let outstandingMemberBalances = 0; // member owes admin
    let outstandingAdminBalances = 0; // admin owes member

    const memberSummaries = members.map((m) => {
      const weekSum = computeMemberFinancialSummary(m, attendance, overtime, advances, payments, {
        startDate: weekRange.startDate,
        endDate: weekRange.endDate,
      });
      const monthSum = computeMemberFinancialSummary(m, attendance, overtime, advances, payments, {
        startDate: monthRange.startDate,
        endDate: monthRange.endDate,
      });
      const lifeSum = computeMemberFinancialSummary(m, attendance, overtime, advances, payments);

      weeklySalaryTotal += weekSum.grossEarned;
      monthlySalaryTotal += monthSum.grossEarned;
      totalOtEarned += lifeSum.totalOtEarned;
      totalAdvanceOutstanding += lifeSum.totalAdvanceOutstanding;
      totalPaymentsGiven += lifeSum.salaryPaymentsGiven;
      totalPaymentsReceived += lifeSum.salaryPaymentsReceived;

      if (lifeSum.balanceDirection === 'MEMBER OWES YOU') {
        outstandingMemberBalances += lifeSum.absBalance;
      } else if (lifeSum.balanceDirection === 'YOU OWE MEMBER') {
        outstandingAdminBalances += lifeSum.absBalance;
      }

      return lifeSum;
    });

    // Weekly daily attendance bar chart data
    const weeklyChart = weekRange.days.map((day) => {
      const recs = attendance.filter((a) => a.date === day);
      return {
        day: day.slice(5),
        present: recs.filter((r) => r.status === 'P').length,
        absent: recs.filter((r) => r.status === 'A').length,
      };
    });

    return {
      totalMembers: members.length,
      todayPresent,
      todayAbsent,
      weeklySalaryTotal,
      monthlySalaryTotal,
      totalOtEarned,
      totalAdvanceOutstanding,
      totalPayments: totalPaymentsGiven + totalPaymentsReceived,
      outstandingMemberBalances,
      outstandingAdminBalances,
      memberSummaries,
      weeklyChart,
    };
  }, [members, attendance, overtime, advances, payments, today, weekRange, monthRange]);

  const maxChartDay = Math.max(1, ...stats.weeklyChart.map((d) => d.present + d.absent));
  const maxFinancialBar = Math.max(
    1,
    stats.monthlySalaryTotal,
    stats.totalOtEarned,
    stats.totalAdvanceOutstanding,
    stats.totalPayments
  );

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
            {t.dashboard}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {today} · {weekRange.startDate} to {weekRange.endDate}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('attendance')}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0B1F3A] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#132E54] min-h-[40px]"
          >
            <CalendarCheck className="h-4 w-4" />
            <span>Mark Today Attendance</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('members')}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 min-h-[40px]"
          >
            <Users className="h-4 w-4" />
            <span>{t.addMember}</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t.totalMembers}</p>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#0B1F3A] dark:text-white">
            {stats.totalMembers}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {members.filter((m) => m.status === 'active').length} active
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t.todayPresent}</p>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {stats.todayPresent}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {t.todayAbsent}: <span className="font-mono font-semibold text-red-600 dark:text-red-400">{stats.todayAbsent}</span>
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t.weeklySalary}</p>
          <p className="mt-2 font-mono text-xl font-bold tabular-nums text-slate-900 dark:text-white">
            {formatCurrency(stats.weeklySalaryTotal)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Mon–Sun</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t.monthlySalary}</p>
          <p className="mt-2 font-mono text-xl font-bold tabular-nums text-slate-900 dark:text-white">
            {formatCurrency(stats.monthlySalaryTotal)}
          </p>
          <p className="mt-1 text-xs text-slate-500">{monthRange.days.length} days</p>
        </div>

        <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-4 md:col-span-1 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t.totalOt}</p>
          <p className="mt-2 font-mono text-xl font-bold tabular-nums text-[#0B1F3A] dark:text-emerald-400">
            {formatCurrency(stats.totalOtEarned)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Lifetime OT</p>
        </div>
      </div>

      {/* Financial Balances Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t.totalAdvance}</span>
            <Wallet className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 font-mono text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
            {formatCurrency(stats.totalAdvanceOutstanding)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t.totalPayments}</span>
            <CreditCard className="h-4 w-4 text-slate-500" />
          </div>
          <p className="mt-2 font-mono text-xl font-bold tabular-nums text-slate-900 dark:text-white">
            {formatCurrency(stats.totalPayments)}
          </p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">{t.adminOwesMember}</span>
            <ArrowUpRight className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 font-mono text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
            {formatCurrency(stats.outstandingAdminBalances)}
          </p>
        </div>

        <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 dark:border-red-900/50 dark:bg-red-950/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-red-800 dark:text-red-300">{t.memberOwesAdmin}</span>
            <ArrowDownRight className="h-4 w-4 text-red-600" />
          </div>
          <p className="mt-2 font-mono text-xl font-bold tabular-nums text-red-700 dark:text-red-300">
            {formatCurrency(stats.outstandingMemberBalances)}
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Weekly Attendance Bar Chart */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Weekly Attendance Overview
            </h3>
            <span className="text-xs text-slate-500">Present vs Absent</span>
          </div>
          <div className="mt-6 grid grid-cols-7 items-end gap-3 h-44">
            {stats.weeklyChart.map((bar) => {
              const pPct = Math.round((bar.present / maxChartDay) * 100);
              const aPct = Math.round((bar.absent / maxChartDay) * 100);
              return (
                <div key={bar.day} className="flex flex-col items-center justify-end h-full gap-1.5">
                  <div className="flex w-full max-w-[32px] flex-1 flex-col justify-end gap-0.5 rounded-t-md bg-slate-100 p-0.5 dark:bg-slate-800">
                    {bar.absent > 0 && (
                      <div
                        style={{ height: `${Math.max(8, aPct)}%` }}
                        className="w-full rounded-sm bg-red-500"
                        title={`Absent: ${bar.absent}`}
                      />
                    )}
                    {bar.present > 0 && (
                      <div
                        style={{ height: `${Math.max(8, pPct)}%` }}
                        className="w-full rounded-sm bg-emerald-600"
                        title={`Present: ${bar.present}`}
                      />
                    )}
                  </div>
                  <span className="font-mono text-[11px] text-slate-500">{bar.day}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Financial Distribution Chart */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Financial Summary Breakdown
            </h3>
            <Clock className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-6 space-y-4">
            {[
              { label: t.monthlySalary, value: stats.monthlySalaryTotal, color: 'bg-[#0B1F3A] dark:bg-blue-500' },
              { label: t.totalOt, value: stats.totalOtEarned, color: 'bg-emerald-600' },
              { label: t.totalAdvance, value: stats.totalAdvanceOutstanding, color: 'bg-amber-500' },
              { label: t.totalPayments, value: stats.totalPayments, color: 'bg-slate-600 dark:bg-slate-400' },
            ].map((item) => {
              const pct = Math.min(100, Math.round((item.value / maxFinancialBar) * 100));
              return (
                <div key={item.label}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{item.label}</span>
                    <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                      {formatCurrency(item.value)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className={`h-full rounded-full ${item.color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Member Balances Quick Table */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Worker Net Balances
          </h3>
          <button
            type="button"
            onClick={() => onNavigate('accounting')}
            className="text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
          >
            View Full Ledger
          </button>
        </div>
        {stats.memberSummaries.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No workers added yet. Add your first worker to start tracking attendance and payroll.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('members')}
              className="mt-4 rounded-lg bg-[#0B1F3A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#132E54]"
            >
              {t.addMember}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3 font-semibold">Member</th>
                  <th className="px-4 py-3 text-right font-semibold">Present</th>
                  <th className="px-4 py-3 text-right font-semibold">Gross Earned</th>
                  <th className="px-4 py-3 text-right font-semibold">Advances</th>
                  <th className="px-5 py-3 text-right font-semibold">Net Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {stats.memberSummaries.slice(0, 8).map((s) => (
                  <tr key={s.member.memberId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-900 dark:text-white">{s.member.fullName}</p>
                      <p className="text-xs text-slate-500">
                        {s.member.memberCode} · {s.member.phone}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {s.presentDays}d
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {formatCurrency(s.grossEarned)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-amber-600 dark:text-amber-400">
                      {formatCurrency(s.totalAdvanceOutstanding)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <p
                        className={`font-mono font-bold tabular-nums ${
                          s.balanceDirection === 'YOU OWE MEMBER'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : s.balanceDirection === 'MEMBER OWES YOU'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-slate-500'
                        }`}
                      >
                        {formatCurrency(s.absBalance)}
                      </p>
                      <p className="text-[11px] font-medium text-slate-500">{s.balanceDirection}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

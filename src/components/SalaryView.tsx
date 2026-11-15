import React, { useMemo, useState } from 'react';
import { Download, FileText, Printer, Share2, Trash2 } from 'lucide-react';
import {
  computeMemberFinancialSummary,
  formatCurrency,
  getBalanceVisuals,
  getMonthRange,
  getStandardWorkHours,
  getWeekRange,
  todayISO,
} from '../lib/accounting';
import {
  downloadSalarySlipPDF,
  printSalarySlipPDF,
  shareSalarySlipPDF,
} from '../lib/exports';
import {
  deleteSalarySlip,
  makeId,
  saveSalaryRecordAndSlip,
} from '../lib/firestoreApi';
import { TRANSLATIONS } from '../lib/i18n';
import type {
  AdvanceTransaction,
  AppSettings,
  AttendanceRecord,
  Language,
  Member,
  OvertimeRecord,
  PaymentTransaction,
  PeriodType,
  SalarySlip,
} from '../types';
import { BalanceStatusBadge } from './BalanceStatusBadge';
import { ConfirmDialog } from './ConfirmDialog';

interface SalaryViewProps {
  lang: Language;
  members: Member[];
  attendance: AttendanceRecord[];
  overtime: OvertimeRecord[];
  advances: AdvanceTransaction[];
  payments: PaymentTransaction[];
  slips: SalarySlip[];
  settings: AppSettings | null;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}

export const SalaryView: React.FC<SalaryViewProps> = ({
  lang,
  members,
  attendance,
  overtime,
  advances,
  payments,
  slips,
  settings,
  onToast,
}) => {
  const t = TRANSLATIONS[lang];
  const today = todayISO();
  const stdHours = getStandardWorkHours(settings?.standardWorkHours);
  const [periodType, setPeriodType] = useState<PeriodType>('weekly');
  const [weekAnchor, setWeekAnchor] = useState(today);
  const [monthVal, setMonthVal] = useState(today.slice(0, 7));
  const [customStart, setCustomStart] = useState(today.slice(0, 8) + '01');
  const [customEnd, setCustomEnd] = useState(today);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [deleteSlipId, setDeleteSlipId] = useState<string | null>(null);

  const range = useMemo(() => {
    if (periodType === 'weekly') {
      const r = getWeekRange(weekAnchor);
      return { startDate: r.startDate, endDate: r.endDate, label: `Weekly (${r.startDate} to ${r.endDate})` };
    }
    if (periodType === 'monthly') {
      const [y, m] = monthVal.split('-');
      const r = getMonthRange(Number(y) || 2026, (Number(m) || 1) - 1);
      return { startDate: r.startDate, endDate: r.endDate, label: `Monthly (${monthVal})` };
    }
    return { startDate: customStart, endDate: customEnd, label: `Custom (${customStart} to ${customEnd})` };
  }, [periodType, weekAnchor, monthVal, customStart, customEnd]);

  const rows = useMemo(() => {
    return members.map((m) =>
      computeMemberFinancialSummary(
        m,
        attendance,
        overtime,
        advances,
        payments,
        {
          startDate: range.startDate,
          endDate: range.endDate,
        },
        stdHours
      )
    );
  }, [members, attendance, overtime, advances, payments, range, stdHours]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        base: acc.base + r.totalSalaryEarned,
        ot: acc.ot + r.totalOtEarned,
        gross: acc.gross + r.grossEarned,
        adv: acc.adv + r.totalAdvanceOutstanding,
        pay: acc.pay + r.salaryPaymentsGiven,
      }),
      { base: 0, ot: 0, gross: 0, adv: 0, pay: 0 }
    );
  }, [rows]);

  const buildSlipObj = (sum: ReturnType<typeof computeMemberFinancialSummary>): Omit<SalarySlip, 'createdBy' | 'createdAt'> => ({
    slipId: makeId('SLIP'),
    memberId: sum.member.memberId,
    memberUid: sum.member.memberUid,
    memberCode: sum.member.memberCode,
    memberName: sum.member.fullName,
    memberPhone: sum.member.phone,
    periodLabel: range.label,
    startDate: range.startDate,
    endDate: range.endDate,
    presentDays: sum.presentDays,
    absentDays: sum.absentDays,
    workingHours: sum.workingHours,
    otHours: sum.otHours,
    dailyRate: sum.member.dailySalaryRate,
    otRate: sum.member.otRate,
    baseSalary: sum.totalSalaryEarned,
    otSalary: sum.totalOtEarned,
    grossSalary: sum.grossEarned,
    normalAdvance: sum.normalAdvanceNet,
    cookingAdvance: sum.cookingAdvanceNet,
    previousPayments: sum.salaryPaymentsGiven,
    finalBalance: sum.rawNetBalance,
    balanceDirection: sum.balanceDirection,
  });

  const handleSaveAndDownload = async (sum: ReturnType<typeof computeMemberFinancialSummary>) => {
    setGeneratingId(sum.member.memberId);
    try {
      const slip = buildSlipObj(sum);
      const recordId = `${sum.member.memberId}_${range.startDate}_${range.endDate}`.replace(/[^a-zA-Z0-9_\-]/g, '_');
      await saveSalaryRecordAndSlip(
        {
          recordId,
          memberId: sum.member.memberId,
          memberUid: sum.member.memberUid,
          periodType,
          startDate: range.startDate,
          endDate: range.endDate,
          presentDays: sum.presentDays,
          absentDays: sum.absentDays,
          workingHours: sum.workingHours,
          otHours: sum.otHours,
          dailyRate: sum.member.dailySalaryRate,
          otRate: sum.member.otRate,
          baseSalary: sum.totalSalaryEarned,
          otSalary: sum.totalOtEarned,
          grossSalary: sum.grossEarned,
          normalAdvance: sum.normalAdvanceNet,
          cookingAdvance: sum.cookingAdvanceNet,
          previousPayments: sum.salaryPaymentsGiven,
          netBalance: sum.rawNetBalance,
          balanceDirection: sum.balanceDirection,
        },
        slip
      );
      await downloadSalarySlipPDF(slip as SalarySlip);
      onToast(`Salary slip saved & PDF downloaded for ${sum.member.fullName}.`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to generate salary slip', 'error');
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
            {t.salary}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Base = Present × Daily Rate · Gross = Base + OT · Net = Gross - Advances - Payments
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
            {(['weekly', 'monthly', 'custom'] as PeriodType[]).map((pt) => (
              <button
                key={pt}
                type="button"
                onClick={() => setPeriodType(pt)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                  periodType === pt
                    ? 'bg-[#0B1F3A] text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                {pt === 'weekly' ? t.weeklyMode : pt === 'monthly' ? t.monthlyMode : t.customMode}
              </button>
            ))}
          </div>

          {periodType === 'weekly' && (
            <input
              type="date"
              value={weekAnchor}
              onChange={(e) => setWeekAnchor(e.target.value || today)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900 dark:text-white"
            />
          )}
          {periodType === 'monthly' && (
            <input
              type="month"
              value={monthVal}
              onChange={(e) => setMonthVal(e.target.value || today.slice(0, 7))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900 dark:text-white"
            />
          )}
          {periodType === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value || today.slice(0, 8) + '01')}
                className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs dark:border-slate-800 dark:bg-slate-900 dark:text-white"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value || today)}
                className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs dark:border-slate-800 dark:bg-slate-900 dark:text-white"
              />
            </div>
          )}
        </div>
      </div>

      {/* Period Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500">Base Salary</p>
          <p className="mt-1 font-mono text-lg font-bold tabular-nums">{formatCurrency(totals.base)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500">OT Salary</p>
          <p className="mt-1 font-mono text-lg font-bold tabular-nums text-emerald-600">{formatCurrency(totals.ot)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500">Gross Payroll</p>
          <p className="mt-1 font-mono text-lg font-bold tabular-nums text-[#0B1F3A] dark:text-white">{formatCurrency(totals.gross)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500">Period Advances</p>
          <p className="mt-1 font-mono text-lg font-bold tabular-nums text-amber-600">{formatCurrency(totals.adv)}</p>
        </div>
        <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-4 lg:col-span-1 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500">Period Payments</p>
          <p className="mt-1 font-mono text-lg font-bold tabular-nums">{formatCurrency(totals.pay)}</p>
        </div>
      </div>

      {/* Individual Salary Calculation Table */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3 font-bold">Member</th>
                <th className="px-3 py-3 text-right font-bold">P / A</th>
                <th className="px-3 py-3 text-right font-bold">Base</th>
                <th className="px-3 py-3 text-right font-bold">OT</th>
                <th className="px-3 py-3 text-right font-bold">Gross</th>
                <th className="px-3 py-3 text-right font-bold">Normal Adv</th>
                <th className="px-3 py-3 text-right font-bold">Cooking Adv</th>
                <th className="px-3 py-3 text-right font-bold">Paid</th>
                <th className="px-3 py-3 text-right font-bold">Net Balance</th>
                <th className="px-4 py-3 text-right font-bold">Slip PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((r) => {
                const balVisual = getBalanceVisuals(r.balanceDirection);
                return (
                  <tr key={r.member.memberId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900 dark:text-white">{r.member.fullName}</p>
                      <p className="text-[11px] text-slate-500">{r.member.memberCode}</p>
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {r.presentDays} / {r.absentDays}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {formatCurrency(r.totalSalaryEarned)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {formatCurrency(r.totalOtEarned)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-bold tabular-nums">
                      {formatCurrency(r.grossEarned)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-amber-600">
                      {formatCurrency(r.normalAdvanceNet)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-amber-600">
                      {formatCurrency(r.cookingAdvanceNet)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {formatCurrency(r.salaryPaymentsGiven)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <p className={`font-mono font-bold tabular-nums ${balVisual.amountTextClass}`}>
                        {formatCurrency(r.absBalance)}
                      </p>
                      <div className="mt-1 flex justify-end">
                        <BalanceStatusBadge direction={r.balanceDirection} lang={lang} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={generatingId === r.member.memberId}
                        onClick={() => handleSaveAndDownload(r)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1F3A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#132E54] disabled:opacity-50 whitespace-nowrap"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        <span>Generate & PDF</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Saved Salary Slips Archive */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Saved Salary Slip History ({slips.length})
          </h3>
        </div>
        {slips.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            Generate a salary slip above to archive it for download, print, or sharing.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {slips.map((slip) => {
              const slipVisual = getBalanceVisuals(slip.balanceDirection);
              return (
                <div key={slip.slipId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {slip.memberName} ({slip.memberCode})
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{slip.periodLabel}</span>
                      <span>·</span>
                      <span className={`font-mono font-bold ${slipVisual.amountTextClass}`}>
                        {formatCurrency(Math.abs(slip.finalBalance))}
                      </span>
                      <BalanceStatusBadge direction={slip.balanceDirection} lang={lang} />
                    </div>
                  </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => downloadSalarySlipPDF(slip)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>{t.downloadPdf}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => printSalarySlipPDF(slip)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    <span>{t.printPdf}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => shareSalarySlipPDF(slip)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    <span>{t.sharePdf}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteSlipId(slip.slipId)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteSlipId}
        title={t.confirmDelete}
        message="Delete this archived salary slip?"
        confirmLabel="Delete Slip"
        cancelLabel={t.cancel}
        onConfirm={async () => {
          if (!deleteSlipId) return;
          try {
            await deleteSalarySlip(deleteSlipId);
            onToast('Salary slip removed.');
            setDeleteSlipId(null);
          } catch (err) {
            onToast(err instanceof Error ? err.message : 'Failed to delete salary slip', 'error');
          }
        }}
        onCancel={() => setDeleteSlipId(null)}
      />
    </div>
  );
};

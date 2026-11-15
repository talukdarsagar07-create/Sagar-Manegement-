import React, { useEffect, useMemo, useState } from 'react';
import {
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  History,
  RefreshCw,
  Settings as SettingsIcon,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import {
  computeMemberFinancialSummary,
  formatCurrency,
  getAttendanceCode,
  getMonthRange,
  getStandardWorkHours,
  getWeekRange,
  todayISO,
} from '../lib/accounting';
import { exportCSV, exportExcel, exportTablePDF } from '../lib/exports';
import {
  fetchFirebaseProviderStatus,
  type FirebaseProviderStatus,
} from '../lib/apiClient';
import {
  provisionAdminMobileCredentials,
  saveAppSettings,
  uploadImageAsset,
} from '../lib/firestoreApi';
import { TRANSLATIONS } from '../lib/i18n';
import type {
  ActivityLog,
  AdvanceTransaction,
  AppSettings,
  AttendanceRecord,
  Language,
  Member,
  OvertimeRecord,
  PaymentTransaction,
  SalarySlip,
} from '../types';

interface ReportsSettingsViewProps {
  lang: Language;
  members: Member[];
  attendance: AttendanceRecord[];
  overtime: OvertimeRecord[];
  advances: AdvanceTransaction[];
  payments: PaymentTransaction[];
  slips: SalarySlip[];
  activityLogs: ActivityLog[];
  settings: AppSettings | null;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}

type ReportType =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'individual'
  | 'attendance'
  | 'salary'
  | 'advance'
  | 'payment';

export const ReportsSettingsView: React.FC<ReportsSettingsViewProps> = ({
  lang,
  members,
  attendance,
  overtime,
  advances,
  payments,
  slips,
  activityLogs,
  settings,
  onToast,
}) => {
  const t = TRANSLATIONS[lang];
  const today = todayISO();
  const [subTab, setSubTab] = useState<'reports' | 'settings' | 'logs'>('reports');

  // Reports State
  const [reportType, setReportType] = useState<ReportType>('monthly');
  const [reportDate, setReportDate] = useState(today);
  const [selectedMemberId, setSelectedMemberId] = useState(members[0]?.memberId || '');

  // Settings State
  const [companyName, setCompanyName] = useState(settings?.companyName || 'SAGAR MANAGEMENT');
  const [tagline, setTagline] = useState(
    settings?.tagline || 'SMART ATTENDANCE • SALARY • WORKER MANAGEMENT'
  );
  const [upiId, setUpiId] = useState(settings?.upiId || '');
  const [upiName, setUpiName] = useState(settings?.upiName || 'SAGAR MANAGEMENT');
  const [adminQrImage, setAdminQrImage] = useState(settings?.adminQrImage || '');
  const [standardWorkHours, setStandardWorkHours] = useState(
    String(settings?.standardWorkHours || 8)
  );
  const [defaultOtRate, setDefaultOtRate] = useState(String(settings?.defaultOtRate || 80));
  const [smsProviderEndpoint, setSmsProviderEndpoint] = useState(
    settings?.smsProviderEndpoint || ''
  );
  const [smsSenderId, setSmsSenderId] = useState(settings?.smsSenderId || 'SAGARM');
  const [savingSettings, setSavingSettings] = useState(false);

  // Admin Mobile Credentials Update State
  const [adminCredPhone, setAdminCredPhone] = useState('');
  const [adminCurrentPassword, setAdminCurrentPassword] = useState('');
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  const [showAdminPasswords, setShowAdminPasswords] = useState(false);
  const [savingAdminCreds, setSavingAdminCreds] = useState(false);

  const [providerInfo, setProviderInfo] = useState<FirebaseProviderStatus | null>(null);
  const [checkingProvider, setCheckingProvider] = useState(false);

  const fetchProviderStatus = async () => {
    setCheckingProvider(true);
    try {
      const data = await fetchFirebaseProviderStatus();
      setProviderInfo(data);
    } catch {
      // Ignore network hiccup
    } finally {
      setCheckingProvider(false);
    }
  };

  useEffect(() => {
    if (subTab === 'settings') {
      fetchProviderStatus();
    }
  }, [subTab]);

  const memberMap = useMemo(() => new Map(members.map((m) => [m.memberId, m])), [members]);

  const stdHours = getStandardWorkHours(settings?.standardWorkHours);

  const reportPayload = useMemo(() => {
    if (reportType === 'daily') {
      const headers = ['Member ID', 'Name', 'Date', 'Status', 'Work Hrs', 'OT Hrs'];
      const rows = members.map((m) => {
        const rec = attendance.find((a) => a.memberId === m.memberId && a.date === reportDate);
        return [
          m.memberCode,
          m.fullName,
          reportDate,
          rec ? getAttendanceCode(rec, stdHours) : 'Unmarked',
          rec?.workingHours ?? 0,
          rec?.otHours ?? 0,
        ];
      });
      return { title: `Daily Report (${reportDate})`, headers, rows };
    }

    if (reportType === 'weekly' || reportType === 'monthly' || reportType === 'salary') {
      const range =
        reportType === 'weekly'
          ? getWeekRange(reportDate)
          : getMonthRange(
              Number(reportDate.slice(0, 4)) || 2026,
              (Number(reportDate.slice(5, 7)) || 1) - 1
            );
      const headers = [
        'ID',
        'Name',
        'Present (Eq)',
        'Absent',
        'OT Hrs',
        'Base Salary',
        'OT Salary',
        'Gross',
        'Advances',
        'Payments',
        'Net Balance',
        'Status',
      ];
      const rows = members.map((m) => {
        const s = computeMemberFinancialSummary(
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
        );
        return [
          m.memberCode,
          m.fullName,
          s.presentDays,
          s.absentDays,
          s.otHours,
          s.totalSalaryEarned,
          s.totalOtEarned,
          s.grossEarned,
          s.totalAdvanceOutstanding,
          s.salaryPaymentsGiven,
          s.absBalance,
          s.balanceDirection,
        ];
      });
      return {
        title: `${reportType.toUpperCase()} Report (${range.startDate} to ${range.endDate})`,
        headers,
        rows,
      };
    }

    if (reportType === 'individual') {
      const m = memberMap.get(selectedMemberId) || members[0];
      if (!m) return { title: 'Individual Member Report', headers: ['Info'], rows: [['No member selected']] };
      const s = computeMemberFinancialSummary(
        m,
        attendance,
        overtime,
        advances,
        payments,
        undefined,
        stdHours
      );
      const headers = ['Metric', 'Value'];
      const rows: (string | number)[][] = [
        ['Member Name', m.fullName],
        ['Member ID', m.memberCode],
        ['Mobile', m.phone],
        ['Present Days (Eq)', s.presentDays],
        ['Absent Days', s.absentDays],
        ['Attendance %', `${s.attendancePercent}%`],
        ['Total Work Hours', s.workingHours],
        ['Total OT Hours', s.otHours],
        ['Total Salary Earned', s.totalSalaryEarned],
        ['Total OT Earned', s.totalOtEarned],
        ['Normal Advance Net', s.normalAdvanceNet],
        ['Cooking Advance Net', s.cookingAdvanceNet],
        ['Payments Given', s.salaryPaymentsGiven],
        ['Payments Received', s.salaryPaymentsReceived],
        ['Final Balance', `${s.absBalance} (${s.balanceDirection})`],
      ];
      return { title: `Member Report — ${m.fullName}`, headers, rows };
    }

    if (reportType === 'attendance') {
      const headers = ['Date', 'Member ID', 'Name', 'Status', 'Working Hrs', 'OT Hrs'];
      const rows = [...attendance]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((a) => [
          a.date,
          memberMap.get(a.memberId)?.memberCode || a.memberId,
          memberMap.get(a.memberId)?.fullName || a.memberId,
          getAttendanceCode(a, stdHours),
          a.workingHours,
          a.otHours,
        ]);
      return { title: 'Complete Attendance Log', headers, rows };
    }

    if (reportType === 'advance') {
      const headers = ['Date', 'TX ID', 'Member', 'Category', 'Type', 'Method', 'Amount', 'Notes'];
      const rows = [...advances]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((a) => [
          a.date,
          a.advanceId,
          memberMap.get(a.memberId)?.fullName || a.memberId,
          a.category,
          a.transactionType,
          a.paymentMethod,
          a.amount,
          a.notes || '',
        ]);
      return { title: 'Advance Transaction Report', headers, rows };
    }

    const headers = ['Date', 'Payment ID', 'Member', 'Direction', 'Method', 'Reference', 'Verified', 'Amount'];
    const rows = [...payments]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((p) => [
        p.date,
        p.paymentId,
        memberMap.get(p.memberId)?.fullName || p.memberId,
        p.direction,
        p.method,
        p.reference,
        p.verified ? 'YES' : 'PENDING',
        p.amount,
      ]);
    return { title: 'Payment Ledger Report', headers, rows };
  }, [reportType, reportDate, selectedMemberId, members, attendance, overtime, advances, payments, memberMap, stdHours]);

  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result);
      const url = await uploadImageAsset('admin_qr', `upi_qr_${Date.now()}.png`, dataUrl);
      setAdminQrImage(url);
      onToast('Admin UPI QR loaded. Click Save Settings to apply.');
    };
    reader.readAsDataURL(file);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await saveAppSettings({
        companyName,
        tagline,
        upiId,
        upiName,
        adminQrImage,
        smsProviderEndpoint,
        smsSenderId,
        defaultOtRate: Number(defaultOtRate) || 80,
        standardWorkHours: Number(standardWorkHours) || 8,
      });
      onToast('Application settings saved to Firestore.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to save settings', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveAdminCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = adminCredPhone.replace(/\D/g, '');
    if (digits.length < 10) {
      onToast('Enter a valid 10-digit Admin mobile number.', 'error');
      return;
    }
    const strong =
      adminNewPassword.length >= 8 &&
      /[A-Z]/.test(adminNewPassword) &&
      /[a-z]/.test(adminNewPassword) &&
      /[0-9]/.test(adminNewPassword) &&
      /[^A-Za-z0-9]/.test(adminNewPassword);
    if (!strong) {
      onToast(
        'Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.',
        'error'
      );
      return;
    }
    if (adminNewPassword !== adminConfirmPassword) {
      onToast('New password and confirmation do not match.', 'error');
      return;
    }
    setSavingAdminCreds(true);
    try {
      const res = await provisionAdminMobileCredentials({
        phone: adminCredPhone,
        password: adminNewPassword,
        currentPassword: adminCurrentPassword || undefined,
        displayName: companyName,
        allowUpdate: true,
      });
      setAdminCurrentPassword('');
      setAdminNewPassword('');
      setAdminConfirmPassword('');
      onToast(`Admin mobile login (${res.phoneNormalized}) updated securely.`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to update Admin login.', 'error');
    } finally {
      setSavingAdminCreds(false);
    }
  };

  const handleDownloadBackup = () => {
    const backup = {
      exportedAt: new Date().toISOString(),
      app: 'SAGAR MANAGEMENT',
      settings,
      members,
      attendance,
      overtime,
      advances,
      payments,
      slips,
      activityLogs,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sagar_management_backup_${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onToast('Full JSON database backup downloaded.');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
            {t.reports}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            PDF, Excel &amp; CSV exports · UPI QR configuration · JSON backup · Audit logs
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setSubTab('reports')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold ${
              subTab === 'reports' ? 'bg-[#0B1F3A] text-white' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Reports</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('settings')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold ${
              subTab === 'settings' ? 'bg-[#0B1F3A] text-white' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <SettingsIcon className="h-3.5 w-3.5" />
            <span>Settings &amp; Backup</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('logs')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold ${
              subTab === 'logs' ? 'bg-[#0B1F3A] text-white' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>Activity Log</span>
          </button>
        </div>
      </div>

      {subTab === 'reports' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as ReportType)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="daily">Daily Report</option>
                <option value="weekly">Weekly Report</option>
                <option value="monthly">Monthly Report</option>
                <option value="individual">Individual Member Report</option>
                <option value="attendance">Attendance Report</option>
                <option value="salary">Salary Report</option>
                <option value="advance">Advance Report</option>
                <option value="payment">Payment Report</option>
              </select>

              {(reportType === 'daily' || reportType === 'weekly' || reportType === 'monthly' || reportType === 'salary') && (
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value || today)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              )}

              {reportType === 'individual' && (
                <select
                  value={selectedMemberId}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  {members.map((m) => (
                    <option key={m.memberId} value={m.memberId}>
                      {m.fullName} ({m.memberCode})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  exportTablePDF(
                    reportPayload.title,
                    `Generated on ${today}`,
                    reportPayload.headers,
                    reportPayload.rows,
                    `sagar_${reportType}_report_${today}`
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1F3A] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#132E54]"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>{t.exportPdf}</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  exportExcel(
                    reportType,
                    reportPayload.headers,
                    reportPayload.rows,
                    `sagar_${reportType}_report_${today}`
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>{t.exportExcel}</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  exportCSV(
                    reportPayload.headers,
                    reportPayload.rows,
                    `sagar_${reportType}_report_${today}`
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <span>{t.exportCsv}</span>
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {reportPayload.title}
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                  <tr>
                    {reportPayload.headers.map((h) => (
                      <th key={h} className="px-4 py-3 font-bold whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {reportPayload.rows.length === 0 ? (
                    <tr>
                      <td colSpan={reportPayload.headers.length} className="px-4 py-8 text-center text-slate-500">
                        No rows for this report period.
                      </td>
                    </tr>
                  ) : (
                    reportPayload.rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="px-4 py-2.5 font-mono tabular-nums whitespace-nowrap">
                            {typeof cell === 'number' && cIdx >= 5 && reportType !== 'attendance'
                              ? formatCurrency(cell)
                              : String(cell)}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {subTab === 'settings' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form
            onSubmit={handleSaveSettings}
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 lg:col-span-8 dark:border-slate-800 dark:bg-slate-900"
          >
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Company, Payroll &amp; UPI Settings
            </h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Company Name
                </label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Tagline
                </label>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Admin UPI ID
                </label>
                <input
                  type="text"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="yourname@okaxis"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Payee Display Name
                </label>
                <input
                  type="text"
                  value={upiName}
                  onChange={(e) => setUpiName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Standard Working Hours / Day
                </label>
                <input
                  type="number"
                  min="1"
                  max="24"
                  value={standardWorkHours}
                  onChange={(e) => setStandardWorkHours(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Default Overtime Rate (₹/hr)
                </label>
                <input
                  type="number"
                  min="0"
                  value={defaultOtRate}
                  onChange={(e) => setDefaultOtRate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  SMS Gateway Webhook URL (Optional)
                </label>
                <input
                  type="url"
                  value={smsProviderEndpoint}
                  onChange={(e) => setSmsProviderEndpoint(e.target.value)}
                  placeholder="https://api.sms-provider.com/send"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  SMS Sender ID
                </label>
                <input
                  type="text"
                  value={smsSenderId}
                  onChange={(e) => setSmsSenderId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              {adminQrImage && (
                <img
                  src={adminQrImage}
                  alt="Admin QR"
                  className="h-16 w-16 rounded-lg border border-slate-200 object-contain bg-white"
                />
              )}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
                <Upload className="h-4 w-4" />
                <span>Upload Admin UPI QR Image</span>
                <input type="file" accept="image/*" onChange={handleQrUpload} className="hidden" />
              </label>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={savingSettings}
                className="rounded-lg bg-[#0B1F3A] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#132E54] disabled:opacity-50"
              >
                {savingSettings ? 'Saving...' : 'Save Application Settings'}
              </button>
            </div>
          </form>

          <div className="space-y-4 lg:col-span-4">
            <form
              onSubmit={handleSaveAdminCredentials}
              className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Admin Mobile Login &amp; Password
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAdminPasswords((v) => !v)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400"
                  aria-label="Toggle password visibility"
                >
                  {showAdminPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configure or rotate your Admin mobile number and password stored via Firebase Auth &amp; salted hashing.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Admin Mobile Number
                </label>
                <input
                  type="tel"
                  required
                  value={adminCredPhone}
                  onChange={(e) => setAdminCredPhone(e.target.value)}
                  placeholder="10-digit Admin mobile number"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Current Password (if changing existing)
                </label>
                <input
                  type={showAdminPasswords ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={adminCurrentPassword}
                  onChange={(e) => setAdminCurrentPassword(e.target.value)}
                  placeholder="Leave blank on initial setup"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  New Admin Password
                </label>
                <input
                  type={showAdminPasswords ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={adminNewPassword}
                  onChange={(e) => setAdminNewPassword(e.target.value)}
                  placeholder="Min 8 chars, upper, lower, digit, symbol"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Confirm New Password
                </label>
                <input
                  type={showAdminPasswords ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={adminConfirmPassword}
                  onChange={(e) => setAdminConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <button
                type="submit"
                disabled={savingAdminCreds}
                className="w-full rounded-lg bg-[#0B1F3A] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#132E54] disabled:opacity-50"
              >
                {savingAdminCreds ? 'Updating...' : 'Save Admin Mobile Login'}
              </button>
            </form>

            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Database Backup</h3>
              <p className="mt-1.5 text-xs text-slate-500">
                Export all members, attendance, overtime, advances, payments, slips, and logs as a single JSON snapshot.
              </p>
              <button
                type="button"
                onClick={handleDownloadBackup}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <Database className="h-4 w-4" />
                <span>Download Full Backup (.json)</span>
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 text-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Firebase Authentication Status
                </h3>
                <button
                  type="button"
                  onClick={fetchProviderStatus}
                  disabled={checkingProvider}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  <RefreshCw className={`h-3 w-3 ${checkingProvider ? 'animate-spin' : ''}`} />
                  <span>Check</span>
                </button>
              </div>
              {providerInfo ? (
                <div className="mt-2 space-y-1.5 leading-relaxed text-slate-600 dark:text-slate-300">
                  <p>
                    Project:{' '}
                    <code className="font-mono font-bold text-[#0B1F3A] dark:text-white">
                      {providerInfo.projectId}
                    </code>
                    {providerInfo.projectNumber ? ` (#${providerInfo.projectNumber})` : ''}
                  </p>
                  <p>
                    Email/Password:{' '}
                    <span
                      className={`font-semibold ${
                        providerInfo.emailPasswordEnabled ? 'text-emerald-600' : 'text-amber-600'
                      }`}
                    >
                      {providerInfo.emailPasswordEnabled
                        ? 'Enabled'
                        : `Disabled (${providerInfo.statusCode})`}
                    </span>
                  </p>
                  <p className="text-[11px] text-slate-500">{providerInfo.detailMessage}</p>
                  {providerInfo.providersConsoleUrl && (
                    <a
                      href={providerInfo.providersConsoleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                      <span>Open Firebase Auth Providers</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              ) : (
                <p className="mt-2 leading-relaxed text-slate-600 dark:text-slate-300">
                  Checking Firebase Authentication configuration...
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {subTab === 'logs' && (
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Audit Activity Log ({activityLogs.length})
            </h3>
          </div>
          {activityLogs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">No activity recorded yet.</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {activityLogs.map((log) => (
                <div key={log.logId} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-xs">
                  <div>
                    <span className="font-mono font-bold text-[#0B1F3A] dark:text-emerald-400">
                      {log.action}
                    </span>
                    <span className="mx-2 text-slate-400">·</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">{log.details}</span>
                  </div>
                  <span className="text-slate-500">{log.actorName}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Calendar,
  Download,
  Globe,
  LogOut,
  Moon,
  Printer,
  QrCode,
  Share2,
  Sun,
  User,
  Wallet,
} from 'lucide-react';
import QRCode from 'qrcode';
import logoUrl from '../assets/images/sagar_management_logo_1794727716847.jpg';
import {
  computeMemberFinancialSummary,
  formatCurrency,
} from '../lib/accounting';
import {
  downloadSalarySlipPDF,
  printSalarySlipPDF,
  shareSalarySlipPDF,
} from '../lib/exports';
import { TRANSLATIONS, translateDirection } from '../lib/i18n';
import type {
  AdvanceTransaction,
  AppSettings,
  AttendanceRecord,
  Language,
  Member,
  NotificationItem,
  OvertimeRecord,
  PaymentTransaction,
  SalarySlip,
} from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface MemberPortalViewProps {
  lang: Language;
  dark: boolean;
  onToggleLang: () => void;
  onToggleDark: () => void;
  onSignOut: () => void;
  member: Member;
  attendance: AttendanceRecord[];
  overtime: OvertimeRecord[];
  advances: AdvanceTransaction[];
  payments: PaymentTransaction[];
  slips: SalarySlip[];
  notifications: NotificationItem[];
  settings: AppSettings | null;
}

export const MemberPortalView: React.FC<MemberPortalViewProps> = ({
  lang,
  dark,
  onToggleLang,
  onToggleDark,
  onSignOut,
  member,
  attendance,
  overtime,
  advances,
  payments,
  slips,
  notifications,
  settings,
}) => {
  const t = TRANSLATIONS[lang];
  const [tab, setTab] = useState<'overview' | 'attendance' | 'finances' | 'slips' | 'pay'>('overview');
  const [memberQr, setMemberQr] = useState('');
  const [adminQr, setAdminQr] = useState('');

  const summary = useMemo(
    () => computeMemberFinancialSummary(member, attendance, overtime, advances, payments),
    [member, attendance, overtime, advances, payments]
  );

  useEffect(() => {
    const mPayload = member.qrData || `SAGAR_MEMBER:${member.memberId}:${member.phone}`;
    QRCode.toDataURL(mPayload, { width: 180, margin: 1 }).then(setMemberQr).catch(() => {});
    if (settings?.upiId) {
      const amt = summary.balanceDirection === 'MEMBER OWES YOU' ? summary.absBalance : undefined;
      const uri = `upi://pay?pa=${encodeURIComponent(settings.upiId)}&pn=${encodeURIComponent(settings.upiName || 'SAGAR MANAGEMENT')}${amt ? `&am=${amt}` : ''}`;
      QRCode.toDataURL(uri, { width: 200, margin: 1 }).then(setAdminQr).catch(() => {});
    }
  }, [member, settings, summary.balanceDirection, summary.absBalance]);

  const sortedAtt = useMemo(
    () => [...attendance].sort((a, b) => b.date.localeCompare(a.date)),
    [attendance]
  );
  const sortedAdv = useMemo(
    () => [...advances].sort((a, b) => b.date.localeCompare(a.date)),
    [advances]
  );
  const sortedPay = useMemo(
    () => [...payments].sort((a, b) => b.date.localeCompare(a.date)),
    [payments]
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-20 text-slate-900 dark:bg-slate-950 dark:text-slate-100 md:pb-8">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md sm:px-8 dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src={logoUrl}
            alt="SAGAR MANAGEMENT"
            className="h-9 w-9 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
          />
          <div className="min-w-0">
            <h1 className="truncate font-display text-sm font-extrabold text-[#0B1F3A] dark:text-white sm:text-base">
              {t.appName}
            </h1>
            <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              {t.myPortal}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <PWAInstallButton label={t.installApp} />
          <button
            type="button"
            onClick={onToggleLang}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold dark:border-slate-700 min-h-[38px]"
          >
            <Globe className="h-3.5 w-3.5 text-emerald-600" />
            <span>{t.language}</span>
          </button>
          <button
            type="button"
            onClick={onToggleDark}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700"
          >
            {dark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1F3A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#132E54] min-h-[38px]"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t.signOut}</span>
          </button>
        </div>
      </header>

      {/* Desktop Navigation Tabs */}
      <div className="mx-auto max-w-5xl px-4 pt-5 sm:px-8">
        <div className="hidden md:flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1.5 dark:border-slate-800 dark:bg-slate-900">
          {[
            { id: 'overview', label: 'My Profile & Balance' },
            { id: 'attendance', label: 'My Attendance & OT' },
            { id: 'finances', label: 'My Advances & Payments' },
            { id: 'slips', label: 'My Salary Slips (PDF)' },
            { id: 'pay', label: 'Admin Payment QR' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as typeof tab)}
              className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
                tab === item.id
                  ? 'bg-[#0B1F3A] text-white'
                  : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-8">
        {tab === 'overview' && (
          <div className="space-y-6">
            {/* Balance Banner */}
            <div
              className={`rounded-2xl border p-6 ${
                summary.balanceDirection === 'YOU OWE MEMBER'
                  ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30'
                  : summary.balanceDirection === 'MEMBER OWES YOU'
                    ? 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30'
                    : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
              }`}
            >
              <p className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                My Pending Balance
              </p>
              <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-mono text-3xl font-extrabold tabular-nums text-slate-900 dark:text-white">
                  {formatCurrency(summary.absBalance)}
                </p>
                <span className="text-sm font-bold text-[#0B1F3A] dark:text-emerald-300">
                  {translateDirection(summary.balanceDirection, lang, true)}
                </span>
              </div>
            </div>

            {/* Profile & KPIs */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-white p-5 text-center dark:border-slate-800 dark:bg-slate-900">
                {member.photoUrl ? (
                  <img
                    src={member.photoUrl}
                    alt={member.fullName}
                    className="h-20 w-20 rounded-2xl object-cover border border-slate-200"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#0B1F3A] text-2xl font-bold text-white">
                    {member.fullName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <h2 className="mt-3 font-display text-lg font-bold">{member.fullName}</h2>
                <p className="text-xs text-slate-500">
                  {member.memberCode} · {member.phone}
                </p>
                <p className="mt-1 text-xs text-slate-500">Joined: {member.joiningDate}</p>
                {memberQr && (
                  <img src={memberQr} alt="Member QR" className="mt-4 h-32 w-32 rounded-lg border border-slate-200 p-1 bg-white" />
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 md:col-span-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs text-slate-500">Present / Attendance</p>
                  <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-emerald-600">
                    {summary.presentDays}d
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {summary.attendancePercent}% ({summary.absentDays} absent)
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs text-slate-500">Daily Rate &amp; OT Rate</p>
                  <p className="mt-2 font-mono text-xl font-bold tabular-nums">
                    {formatCurrency(member.dailySalaryRate)}/d
                  </p>
                  <p className="mt-1 text-xs text-slate-500">OT: {formatCurrency(member.otRate)}/hr</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs text-slate-500">Total Earned (Salary + OT)</p>
                  <p className="mt-2 font-mono text-xl font-bold tabular-nums">
                    {formatCurrency(summary.grossEarned)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">OT Hours: {summary.otHours}h</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs text-slate-500">Outstanding Advances</p>
                  <p className="mt-2 font-mono text-xl font-bold tabular-nums text-amber-600">
                    {formatCurrency(summary.totalAdvanceOutstanding)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Normal {formatCurrency(summary.normalAdvanceNet)} · Cook {formatCurrency(summary.cookingAdvanceNet)}
                  </p>
                </div>
              </div>
            </div>

            {notifications.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <Bell className="h-4 w-4 text-emerald-600" />
                  <span>Recent Notifications</span>
                </div>
                <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                  {notifications.slice(0, 5).map((n) => (
                    <div key={n.notificationId} className="py-2.5 text-xs">
                      <p className="font-semibold">{n.title}</p>
                      <p className="mt-0.5 whitespace-pre-line text-slate-500">{n.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'attendance' && (
          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <h3 className="text-sm font-bold">My Attendance &amp; Overtime History ({sortedAtt.length})</h3>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {sortedAtt.length === 0 ? (
                <p className="p-6 text-center text-xs text-slate-500">No attendance marked yet.</p>
              ) : (
                sortedAtt.map((a) => (
                  <div key={a.recordId} className="flex items-center justify-between px-5 py-3 text-xs">
                    <span className="font-mono font-semibold">{a.date}</span>
                    <span>Work: {a.workingHours}h · OT: {a.otHours}h</span>
                    <span
                      className={`font-mono font-bold ${
                        a.status === 'P' ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      {a.status === 'P' ? 'PRESENT' : 'ABSENT'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {tab === 'finances' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                <h3 className="text-sm font-bold">My Advances ({sortedAdv.length})</h3>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {sortedAdv.length === 0 ? (
                  <p className="p-6 text-center text-xs text-slate-500">No advance transactions.</p>
                ) : (
                  sortedAdv.map((adv) => (
                    <div key={adv.advanceId} className="flex items-center justify-between px-5 py-3 text-xs">
                      <div>
                        <p className="font-semibold">{adv.category} ADVANCE ({adv.transactionType})</p>
                        <p className="text-slate-500">{adv.date} · {adv.paymentMethod}</p>
                      </div>
                      <span className="font-mono font-bold tabular-nums">{formatCurrency(adv.amount)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                <h3 className="text-sm font-bold">My Payment History ({sortedPay.length})</h3>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {sortedPay.length === 0 ? (
                  <p className="p-6 text-center text-xs text-slate-500">No payments recorded.</p>
                ) : (
                  sortedPay.map((p) => (
                    <div key={p.paymentId} className="flex items-center justify-between px-5 py-3 text-xs">
                      <div>
                        <p className="font-semibold">{p.method} · {p.reference}</p>
                        <p className="text-slate-500">
                          {p.date} · {p.direction === 'TO_MEMBER' ? 'Received' : 'Paid to Admin'} · {p.verified ? 'Verified' : 'Pending'}
                        </p>
                      </div>
                      <span className="font-mono font-bold tabular-nums">{formatCurrency(p.amount)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'slips' && (
          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <h3 className="text-sm font-bold">My Salary Slips ({slips.length})</h3>
            </div>
            {slips.length === 0 ? (
              <p className="p-8 text-center text-xs text-slate-500">No salary slips generated yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {slips.map((slip) => (
                  <div key={slip.slipId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <div>
                      <p className="text-sm font-bold">{slip.periodLabel}</p>
                      <p className="text-xs text-slate-500">
                        Gross: {formatCurrency(slip.grossSalary)} · Final: {formatCurrency(Math.abs(slip.finalBalance))} ({slip.balanceDirection})
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => downloadSalarySlipPDF(slip)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold dark:border-slate-700"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>PDF</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => printSalarySlipPDF(slip)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold dark:border-slate-700"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        <span>Print</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => shareSalarySlipPDF(slip)}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        <span>Share</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'pay' && (
          <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-display text-lg font-bold">Admin UPI Payment QR</h3>
            <p className="mt-1 text-xs text-slate-500">
              Scan using PhonePe, Google Pay, Paytm, or any UPI app
            </p>
            <div className="mt-5 flex justify-center">
              {settings?.adminQrImage ? (
                <img src={settings.adminQrImage} alt="Admin UPI QR" className="h-52 w-52 rounded-xl border border-slate-200 bg-white p-2 object-contain" />
              ) : adminQr ? (
                <img src={adminQr} alt="Admin UPI QR" className="h-52 w-52 rounded-xl border border-slate-200 bg-white p-2" />
              ) : (
                <div className="flex h-48 w-48 items-center justify-center rounded-xl border border-dashed border-slate-300 text-xs text-slate-400">
                  Admin UPI QR not configured yet
                </div>
              )}
            </div>
            {settings?.upiId && (
              <div className="mt-4 space-y-3">
                <p className="font-mono text-sm font-bold text-[#0B1F3A] dark:text-white">
                  {settings.upiId}
                </p>
                <a
                  href={`upi://pay?pa=${encodeURIComponent(settings.upiId)}&pn=${encodeURIComponent(settings.upiName || 'SAGAR MANAGEMENT')}`}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Pay via UPI App
                </a>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white/95 backdrop-blur-md pb-safe md:hidden dark:border-slate-800 dark:bg-slate-900/95">
        {[
          { id: 'overview', icon: User, label: 'Profile' },
          { id: 'attendance', icon: Calendar, label: 'Attendance' },
          { id: 'finances', icon: Wallet, label: 'Ledger' },
          { id: 'slips', icon: Download, label: 'Slips' },
          { id: 'pay', icon: QrCode, label: 'Pay QR' },
        ].map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as typeof tab)}
              className={`flex flex-col items-center justify-center py-2 text-[10px] font-semibold min-h-[54px] ${
                active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="mt-0.5">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};

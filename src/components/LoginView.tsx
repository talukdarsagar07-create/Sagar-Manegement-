import React, { useState } from 'react';
import { Eye, EyeOff, Globe, Lock, Moon, Phone, ShieldCheck, Sun, UserCheck } from 'lucide-react';
import logoUrl from '../assets/images/sagar_management_logo_1794727716847.jpg';
import heroBannerUrl from '../assets/images/sagar_hero_banner_1794727718342.jpg';
import { TRANSLATIONS } from '../lib/i18n';
import type { Language } from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface LoginViewProps {
  lang: Language;
  dark: boolean;
  onToggleLang: () => void;
  onToggleDark: () => void;
  onAdminGoogleLogin: () => Promise<void>;
  onAdminEmailLogin: (email: string, password: string) => Promise<void>;
  onMemberLogin: (phone: string, password: string) => Promise<void>;
  authError: string | null;
  authLoading: boolean;
}

export const LoginView: React.FC<LoginViewProps> = ({
  lang,
  dark,
  onToggleLang,
  onToggleDark,
  onAdminGoogleLogin,
  onAdminEmailLogin,
  onMemberLogin,
  authError,
  authLoading,
}) => {
  const t = TRANSLATIONS[lang];
  const [tab, setTab] = useState<'admin' | 'member'>('admin');
  const [showAdminEmail, setShowAdminEmail] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [memberPassword, setMemberPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onMemberLogin(phone, memberPassword);
  };

  const handleAdminEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onAdminEmailLogin(adminEmail, adminPassword);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col">
      {/* Top Bar */}
      <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-8 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src={logoUrl}
            alt="SAGAR MANAGEMENT"
            className="h-9 w-9 rounded-lg object-cover shrink-0 border border-slate-200 dark:border-slate-700"
          />
          <span className="font-display text-base sm:text-lg font-extrabold tracking-tight text-[#0B1F3A] dark:text-white truncate">
            {t.appName}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <PWAInstallButton label={t.installApp} />
          <button
            type="button"
            onClick={onToggleLang}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 min-h-[40px]"
          >
            <Globe className="h-4 w-4 text-emerald-600" />
            <span>{t.language}</span>
          </button>
          <button
            type="button"
            onClick={onToggleDark}
            aria-label="Toggle theme"
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 min-h-[40px] min-w-[40px]"
          >
            {dark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* Main Split Container */}
      <main className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 items-stretch gap-8 px-4 py-8 sm:px-8 lg:grid-cols-12 lg:py-12">
        {/* Left Hero Presentation (Desktop + Tablet) */}
        <section className="relative hidden overflow-hidden rounded-2xl border border-slate-200 bg-[#0B1F3A] text-white lg:col-span-7 lg:flex lg:flex-col lg:justify-between dark:border-slate-800">
          <img
            src={heroBannerUrl}
            alt="Workforce Operations"
            className="absolute inset-0 h-full w-full object-cover opacity-35"
          />
          <div className="relative z-10 flex h-full flex-col justify-between bg-gradient-to-t from-[#0B1F3A] via-[#0B1F3A]/75 to-[#0B1F3A]/45 p-10">
            <div className="flex items-center gap-4">
              <img
                src={logoUrl}
                alt="SAGAR MANAGEMENT Logo"
                className="h-16 w-16 rounded-2xl border border-white/20 object-cover shadow-lg"
              />
              <div>
                <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">
                  SAGAR MANAGEMENT
                </h1>
                <p className="mt-0.5 text-xs font-medium tracking-wide text-emerald-300">
                  {t.tagline}
                </p>
              </div>
            </div>

            <div className="max-w-xl">
              <h2 className="font-display text-3xl font-bold leading-tight text-white">
                {lang === 'bn'
                  ? 'উপস্থিতি, ওভারটাইম, অগ্রিম ও বেতনের নির্ভুল ডিজিটাল হিসাব।'
                  : 'Precision Attendance, Overtime, Advances & Payroll Accounting.'}
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-slate-200">
                {lang === 'bn'
                  ? 'অ্যাডমিন এবং কর্মীদের জন্য সম্পূর্ণ আলাদা ও নিরাপদ ফায়ারবেস পোর্টাল — সাপ্তাহিক ও মাসিক হাজিরা, পিডিএফ স্যালারি স্লিপ এবং ইউপিআই পেমেন্ট ট্র্যাকিং।'
                  : 'Dedicated Firebase-secured Admin console and Member personal portal with weekly/monthly attendance, Normal & Cooking advances, UPI QR payments, and instant PDF salary slips.'}
              </p>

              <div className="mt-8 grid grid-cols-3 gap-4 border-t border-white/15 pt-6">
                <div>
                  <p className="font-mono text-lg font-bold text-emerald-400">7d / 30d</p>
                  <p className="mt-1 text-xs text-slate-300">
                    {lang === 'bn' ? 'সাপ্তাহিক ও মাসিক হাজিরা' : 'Weekly & Monthly Cycles'}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-lg font-bold text-emerald-400">UPI + PDF</p>
                  <p className="mt-1 text-xs text-slate-300">
                    {lang === 'bn' ? 'স্লিপ এবং কিউআর পেমেন্ট' : 'Salary Slips & QR Pay'}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-lg font-bold text-emerald-400">EN / বাং</p>
                  <p className="mt-1 text-xs text-slate-300">
                    {lang === 'bn' ? 'বাংলা ও ইংরেজি সাপোর্ট' : 'Bilingual WhatsApp & SMS'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Right Login Card */}
        <section className="flex flex-col justify-center lg:col-span-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <img
                src={logoUrl}
                alt="SAGAR MANAGEMENT"
                className="h-12 w-12 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
              />
              <div>
                <h1 className="font-display text-xl font-extrabold text-[#0B1F3A] dark:text-white">
                  {t.appName}
                </h1>
                <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  {t.tagline}
                </p>
              </div>
            </div>

            {/* Segmented Switch: Admin Login vs Member Login */}
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setTab('admin')}
                className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition min-h-[44px] ${
                  tab === 'admin'
                    ? 'bg-[#0B1F3A] text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                <ShieldCheck className="h-4 w-4" />
                <span>{t.adminLogin}</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('member')}
                className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition min-h-[44px] ${
                  tab === 'member'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                <UserCheck className="h-4 w-4" />
                <span>{t.memberLogin}</span>
              </button>
            </div>

            {authError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                {authError}
              </div>
            )}

            {tab === 'admin' ? (
              <div className="mt-6 space-y-5">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    {lang === 'bn' ? 'অ্যাডমিন কন্ট্রোল প্যানেল' : 'Authorized Admin Access'}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {lang === 'bn'
                      ? 'শুধুমাত্র অনুমোদিত অ্যাডমিন অ্যাকাউন্ট দিয়ে প্রবেশ করুন।'
                      : 'Only authorized administrator accounts can access worker management, payroll, and settings.'}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={authLoading}
                  onClick={onAdminGoogleLogin}
                  className="flex w-full items-center justify-center gap-3 rounded-xl bg-[#0B1F3A] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#132E54] disabled:opacity-50 min-h-[48px]"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path
                      fill="#ffffff"
                      d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81Z"
                    />
                  </svg>
                  <span>{authLoading ? 'Signing in...' : t.signInWithGoogle}</span>
                </button>

                <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowAdminEmail(!showAdminEmail)}
                    className="text-xs font-semibold text-slate-600 hover:text-[#0B1F3A] dark:text-slate-400 dark:hover:text-white"
                  >
                    {showAdminEmail ? 'Hide Email / Password Login' : 'Use Admin Email & Password instead'}
                  </button>

                  {showAdminEmail && (
                    <form onSubmit={handleAdminEmailSubmit} className="mt-4 space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Admin Email
                        </label>
                        <input
                          type="email"
                          required
                          value={adminEmail}
                          onChange={(e) => setAdminEmail(e.target.value)}
                          placeholder="admin@company.com"
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none focus:border-[#0B1F3A] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Password
                        </label>
                        <input
                          type="password"
                          required
                          value={adminPassword}
                          onChange={(e) => setAdminPassword(e.target.value)}
                          placeholder="••••••••"
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none focus:border-[#0B1F3A] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={authLoading}
                        className="w-full rounded-xl border border-[#0B1F3A] bg-white py-2.5 text-sm font-semibold text-[#0B1F3A] hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white min-h-[44px]"
                      >
                        Sign In with Email
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ) : (
              <form onSubmit={handleMemberSubmit} className="mt-6 space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    {lang === 'bn' ? 'কর্মী ব্যক্তিগত পোর্টাল' : 'Member Personal Portal'}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {lang === 'bn'
                      ? 'আপনার নিবন্ধিত মোবাইল নম্বর এবং অ্যাডমিনের দেওয়া পাসওয়ার্ড দিয়ে লগইন করুন।'
                      : 'Sign in with your registered mobile number and Admin-assigned password.'}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {t.phoneLabel}
                  </label>
                  <div className="relative mt-1">
                    <Phone className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="10-digit mobile number"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800 dark:text-white min-h-[44px]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {t.passwordLabel}
                  </label>
                  <div className="relative mt-1">
                    <Lock className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={memberPassword}
                      onChange={(e) => setMemberPassword(e.target.value)}
                      placeholder="Enter password"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-11 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800 dark:text-white min-h-[44px]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50 min-h-[48px]"
                >
                  {authLoading ? 'Signing in...' : t.loginBtn}
                </button>
              </form>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

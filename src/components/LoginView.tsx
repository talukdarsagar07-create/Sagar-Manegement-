import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  Lock,
  Moon,
  Phone,
  RefreshCw,
  ShieldCheck,
  Sun,
  UserCheck,
} from 'lucide-react';
import logoUrl from '../assets/images/sagar_management_logo_1794727716847.jpg';
import heroBannerUrl from '../assets/images/sagar_hero_banner_1794727718342.jpg';
import { fetchFirebaseProviderStatus, type FirebaseProviderStatus } from '../lib/apiClient';
import { TRANSLATIONS } from '../lib/i18n';
import type { Language } from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface LoginViewProps {
  lang: Language;
  dark: boolean;
  onToggleLang: () => void;
  onToggleDark: () => void;
  onAdminGoogleLogin: () => Promise<void>;
  onAdminPhoneLogin: (phone: string, password: string) => Promise<void>;
  onFirstAdminSetup: (input: {
    phone: string;
    password: string;
    displayName?: string;
  }) => Promise<void>;
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
  onAdminPhoneLogin,
  onFirstAdminSetup,
  onMemberLogin,
  authError,
  authLoading,
}) => {
  const t = TRANSLATIONS[lang];
  const [tab, setTab] = useState<'admin' | 'member'>('admin');
  const [showFirstAdminSetup, setShowFirstAdminSetup] = useState(false);

  // Admin Login Form
  const [adminPhone, setAdminPhone] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);

  // First-Admin Setup Form
  const [setupName, setSetupName] = useState('');
  const [setupPhone, setSetupPhone] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirmPassword, setSetupConfirmPassword] = useState('');
  const [showSetupPassword, setShowSetupPassword] = useState(false);
  const [localValidationError, setLocalValidationError] = useState<string | null>(null);

  // Member Login Form
  const [phone, setPhone] = useState('');
  const [memberPassword, setMemberPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Firebase Auth Provider Live Status
  const [providerStatus, setProviderStatus] = useState<FirebaseProviderStatus | null>(null);
  const [checkingProvider, setCheckingProvider] = useState(false);

  const checkProviderStatus = async () => {
    setCheckingProvider(true);
    try {
      const data = await fetchFirebaseProviderStatus();
      setProviderStatus(data);
    } catch {
      setProviderStatus({
        configValid: false,
        projectId: '',
        firestoreDatabaseId: '',
        authInitialized: false,
        emailPasswordEnabled: false,
        statusCode: 'NETWORK_ERROR',
        detailMessage: 'Unable to check Firebase Authentication provider status.',
      });
    } finally {
      setCheckingProvider(false);
    }
  };

  useEffect(() => {
    if (showFirstAdminSetup) {
      checkProviderStatus();
    }
  }, [showFirstAdminSetup]);

  const handleMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalValidationError(null);
    await onMemberLogin(phone, memberPassword);
  };

  const handleAdminPhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalValidationError(null);
    await onAdminPhoneLogin(adminPhone, adminPassword);
  };

  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalValidationError(null);
    const digits = setupPhone.replace(/\D/g, '');
    if (digits.length < 10) {
      setLocalValidationError(
        lang === 'bn'
          ? 'সঠিক ১০ সংখ্যার মোবাইল নম্বর দিন।'
          : 'Please enter a valid 10-digit Admin mobile number.'
      );
      return;
    }
    const strong =
      setupPassword.length >= 8 &&
      /[A-Z]/.test(setupPassword) &&
      /[a-z]/.test(setupPassword) &&
      /[0-9]/.test(setupPassword) &&
      /[^A-Za-z0-9]/.test(setupPassword);
    if (!strong) {
      setLocalValidationError(
        lang === 'bn'
          ? 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে এবং বড় হাতের অক্ষর, ছোট হাতের অক্ষর, সংখ্যা ও বিশেষ চিহ্ন থাকতে হবে।'
          : 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.'
      );
      return;
    }
    if (setupPassword !== setupConfirmPassword) {
      setLocalValidationError(
        lang === 'bn' ? 'পাসওয়ার্ড দুটি মিলছে না।' : 'Passwords do not match.'
      );
      return;
    }
    await onFirstAdminSetup({
      phone: setupPhone,
      password: setupPassword,
      displayName: setupName.trim() || undefined,
    });
  };

  const displayedError = localValidationError || authError;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 header-safe backdrop-blur-md sm:px-8 dark:border-slate-800 dark:bg-slate-900/95">
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
                onClick={() => {
                  setTab('admin');
                  setLocalValidationError(null);
                }}
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
                onClick={() => {
                  setTab('member');
                  setLocalValidationError(null);
                }}
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

            {displayedError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                {displayedError}
              </div>
            )}

            {tab === 'admin' ? (
              <div className="mt-6 space-y-5">
                {!showFirstAdminSetup ? (
                  <>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                        {lang === 'bn' ? 'অ্যাডমিন কন্ট্রোল প্যানেল' : 'Authorized Admin Access'}
                      </h2>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {lang === 'bn'
                          ? 'আপনার অনুমোদিত অ্যাডমিন মোবাইল নম্বর ও পাসওয়ার্ড দিয়ে প্রবেশ করুন।'
                          : 'Sign in with your authorized Admin mobile number and password.'}
                      </p>
                    </div>

                    <form onSubmit={handleAdminPhoneSubmit} className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {t.phoneLabel}
                        </label>
                        <div className="relative mt-1">
                          <Phone className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                          <input
                            type="tel"
                            required
                            autoComplete="tel"
                            value={adminPhone}
                            onChange={(e) => setAdminPhone(e.target.value)}
                            placeholder="10-digit Admin mobile number"
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-[#0B1F3A] dark:border-slate-700 dark:bg-slate-800 dark:text-white min-h-[44px]"
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
                            type={showAdminPassword ? 'text' : 'password'}
                            required
                            autoComplete="current-password"
                            value={adminPassword}
                            onChange={(e) => setAdminPassword(e.target.value)}
                            placeholder="Enter Admin password"
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-11 text-sm outline-none focus:border-[#0B1F3A] dark:border-slate-700 dark:bg-slate-800 dark:text-white min-h-[44px]"
                          />
                          <button
                            type="button"
                            onClick={() => setShowAdminPassword(!showAdminPassword)}
                            aria-label="Toggle password visibility"
                            className="absolute right-2 top-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600"
                          >
                            {showAdminPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={authLoading}
                        className="w-full rounded-xl bg-[#0B1F3A] py-3 text-sm font-semibold text-white transition hover:bg-[#132E54] disabled:opacity-50 min-h-[48px]"
                      >
                        {authLoading ? 'Signing in...' : t.adminLoginBtn}
                      </button>
                    </form>

                    <div className="relative flex items-center py-1">
                      <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
                      <span className="mx-3 shrink text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        {lang === 'bn' ? 'অথবা' : 'OR'}
                      </span>
                      <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
                    </div>

                    <button
                      type="button"
                      disabled={authLoading}
                      onClick={onAdminGoogleLogin}
                      className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white min-h-[44px]"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24">
                        <path
                          fill="currentColor"
                          d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81Z"
                        />
                      </svg>
                      <span>{t.signInWithGoogle}</span>
                    </button>

                    <div className="border-t border-slate-200 pt-3 text-center dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          setShowFirstAdminSetup(true);
                          setLocalValidationError(null);
                        }}
                        className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                      >
                        {t.firstAdminSetup} →
                      </button>
                    </div>
                  </>
                ) : (
                  <form onSubmit={handleSetupSubmit} className="space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                          {t.firstAdminSetup}
                        </h2>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {lang === 'bn'
                            ? 'মালিকের গুগল অ্যাকাউন্ট যাচাই করে প্রথম অ্যাডমিন মোবাইল ও পাসওয়ার্ড সেট করুন।'
                            : 'One-time setup authorized by the owner Google account. Passwords are stored securely using Firebase Auth and salted hashing.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowFirstAdminSetup(false);
                          setLocalValidationError(null);
                        }}
                        className="shrink-0 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400"
                      >
                        ← Back
                      </button>
                    </div>

                    {providerStatus && (
                      <div
                        className={`rounded-xl border p-3 text-xs ${
                          providerStatus.emailPasswordEnabled
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200'
                            : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5 font-semibold">
                            {providerStatus.emailPasswordEnabled ? (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                            )}
                            <span>
                              {providerStatus.emailPasswordEnabled
                                ? 'Firebase Email/Password Auth Active'
                                : `Action Required (${providerStatus.statusCode})`}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={checkProviderStatus}
                            disabled={checkingProvider}
                            className="inline-flex items-center gap-1 rounded-md border border-current/20 px-2 py-0.5 text-[11px] font-semibold hover:bg-black/5 disabled:opacity-50"
                          >
                            <RefreshCw className={`h-3 w-3 ${checkingProvider ? 'animate-spin' : ''}`} />
                            <span>Recheck</span>
                          </button>
                        </div>

                        <div className="mt-1.5 space-y-1 text-[11px] opacity-90">
                          <p>
                            Connected Project:{' '}
                            <code className="font-mono font-bold">
                              {providerStatus.projectId || 'Not configured'}
                            </code>
                            {providerStatus.projectNumber
                              ? ` (#${providerStatus.projectNumber})`
                              : ''}
                          </p>
                          <p>{providerStatus.detailMessage}</p>
                          {!providerStatus.emailPasswordEnabled &&
                            providerStatus.providersConsoleUrl && (
                              <a
                                href={providerStatus.providersConsoleUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1 inline-flex items-center gap-1 font-semibold underline"
                              >
                                <span>
                                  Enable Email/Password in Firebase Console ({providerStatus.projectId})
                                </span>
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Admin Name (Optional)
                      </label>
                      <input
                        type="text"
                        value={setupName}
                        onChange={(e) => setSetupName(e.target.value)}
                        placeholder="SAGAR MANAGEMENT Admin"
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none focus:border-[#0B1F3A] dark:border-slate-700 dark:bg-slate-800 dark:text-white min-h-[44px]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Admin {t.phoneLabel}
                      </label>
                      <div className="relative mt-1">
                        <Phone className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                        <input
                          type="tel"
                          required
                          value={setupPhone}
                          onChange={(e) => setSetupPhone(e.target.value)}
                          placeholder="10-digit Admin mobile number"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-[#0B1F3A] dark:border-slate-700 dark:bg-slate-800 dark:text-white min-h-[44px]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Create Admin {t.passwordLabel}
                      </label>
                      <div className="relative mt-1">
                        <Lock className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                        <input
                          type={showSetupPassword ? 'text' : 'password'}
                          required
                          autoComplete="new-password"
                          value={setupPassword}
                          onChange={(e) => setSetupPassword(e.target.value)}
                          placeholder="Min 8 chars, upper, lower, number & symbol"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-11 text-sm outline-none focus:border-[#0B1F3A] dark:border-slate-700 dark:bg-slate-800 dark:text-white min-h-[44px]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSetupPassword(!showSetupPassword)}
                          className="absolute right-2 top-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600"
                        >
                          {showSetupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Confirm Admin {t.passwordLabel}
                      </label>
                      <input
                        type={showSetupPassword ? 'text' : 'password'}
                        required
                        autoComplete="new-password"
                        value={setupConfirmPassword}
                        onChange={(e) => setSetupConfirmPassword(e.target.value)}
                        placeholder="Re-enter Admin password"
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none focus:border-[#0B1F3A] dark:border-slate-700 dark:bg-slate-800 dark:text-white min-h-[44px]"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={authLoading}
                      className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50 min-h-[48px]"
                    >
                      {authLoading ? 'Creating Admin Account...' : t.createFirstAdminBtn}
                    </button>
                  </form>
                )}
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

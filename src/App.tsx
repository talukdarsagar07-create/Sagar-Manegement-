import React, { useEffect, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  BookOpen,
  CalendarCheck,
  CreditCard,
  FileBarChart,
  FileSpreadsheet,
  Globe,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Sun,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import logoUrl from './assets/images/sagar_management_logo_1794727716847.jpg';
import { AccountingMessagesView } from './components/AccountingMessagesView';
import { AdminDashboardView } from './components/AdminDashboardView';
import { AdvancesView } from './components/AdvancesView';
import { AttendanceOvertimeView } from './components/AttendanceOvertimeView';
import { LoginView } from './components/LoginView';
import { MemberPortalView } from './components/MemberPortalView';
import { MembersView } from './components/MembersView';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PaymentsView } from './components/PaymentsView';
import { PWAInstallButton } from './components/PWAInstallButton';
import { ReportsSettingsView } from './components/ReportsSettingsView';
import { SalaryView } from './components/SalaryView';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './lib/firebase';
import {
  adminPhoneToAuthEmail,
  apiUrl,
  hasConfiguredApiBase,
  isNativePlatform,
  memberPhoneToAuthEmail,
  normalizePhoneDigits,
} from './lib/apiClient';
import {
  ensureAdminBootstrap,
  provisionAdminMobileCredentials,
} from './lib/firestoreApi';
import { TRANSLATIONS } from './lib/i18n';
import type {
  ActivityLog,
  AdvanceTransaction,
  AppSettings,
  AttendanceRecord,
  Language,
  Member,
  NotificationItem,
  OvertimeRecord,
  PaymentTransaction,
  SalarySlip,
} from './types';

type AdminTab =
  | 'dashboard'
  | 'members'
  | 'attendance'
  | 'salary'
  | 'advances'
  | 'payments'
  | 'accounting'
  | 'reports';

export default function App() {
  const [lang, setLang] = useState<Language>(() =>
    localStorage.getItem('sagar_lang') === 'bn' ? 'bn' : 'en'
  );
  const [dark, setDark] = useState<boolean>(
    () => localStorage.getItem('sagar_theme') === 'dark'
  );

  // Auth State
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [role, setRole] = useState<'admin' | 'member' | null>(null);
  const [memberSessionToken, setMemberSessionToken] = useState<string | null>(() =>
    localStorage.getItem('sagar_member_token')
  );
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Navigation & UI
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const setupInProgressRef = useRef(false);

  // Domain Collections
  const [members, setMembers] = useState<Member[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [overtime, setOvertime] = useState<OvertimeRecord[]>([]);
  const [advances, setAdvances] = useState<AdvanceTransaction[]>([]);
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [slips, setSlips] = useState<SalarySlip[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => {
      setToast((curr) => (curr?.msg === msg ? null : curr));
    }, 4500);
  };

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('sagar_theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    localStorage.setItem('sagar_lang', lang);
  }, [lang]);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (setupInProgressRef.current) return;
      setFirebaseUser(user);
      if (!user) {
        if (memberSessionToken) {
          setRole('member');
        } else {
          setRole(null);
        }
        setAuthReady(true);
        return;
      }

      try {
        const isBootstrapped =
          user.emailVerified && user.email === BOOTSTRAPPED_ADMIN_EMAIL;
        if (isBootstrapped) {
          await ensureAdminBootstrap();
          setRole('admin');
          setAuthReady(true);
          return;
        }

        const adminSnap = await getDoc(doc(db, 'admins', user.uid));
        if (adminSnap.exists()) {
          setRole('admin');
          setAuthReady(true);
          return;
        }

        const userSnap = await getDoc(doc(db, 'users', user.uid));
        if (userSnap.exists() && userSnap.data()?.role === 'member') {
          setRole('member');
          setAuthReady(true);
          return;
        }

        // Signed in via Google with an unauthorized non-admin email
        setRole(null);
        setAuthError(
          `Account ${user.email} is not authorized as Admin. Sign in with ${BOOTSTRAPPED_ADMIN_EMAIL} or use the Member Portal.`
        );
        await signOut(auth);
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Authorization check failed.');
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsub();
  }, [memberSessionToken]);

  // Attach real-time Firestore listeners for Admin
  useEffect(() => {
    if (!authReady || role !== 'admin' || !firebaseUser) return;

    const unsubs = [
      onSnapshot(
        collection(db, 'members'),
        (snap) => setMembers(snap.docs.map((d) => d.data() as Member)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'members')
      ),
      onSnapshot(
        collection(db, 'attendance'),
        (snap) => setAttendance(snap.docs.map((d) => d.data() as AttendanceRecord)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'attendance')
      ),
      onSnapshot(
        collection(db, 'overtimeRecords'),
        (snap) => setOvertime(snap.docs.map((d) => d.data() as OvertimeRecord)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'overtimeRecords')
      ),
      onSnapshot(
        collection(db, 'advances'),
        (snap) => setAdvances(snap.docs.map((d) => d.data() as AdvanceTransaction)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'advances')
      ),
      onSnapshot(
        collection(db, 'payments'),
        (snap) => setPayments(snap.docs.map((d) => d.data() as PaymentTransaction)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'payments')
      ),
      onSnapshot(
        collection(db, 'salarySlips'),
        (snap) => setSlips(snap.docs.map((d) => d.data() as SalarySlip)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'salarySlips')
      ),
      onSnapshot(
        collection(db, 'activityLogs'),
        (snap) => setActivityLogs(snap.docs.map((d) => d.data() as ActivityLog)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'activityLogs')
      ),
      onSnapshot(
        doc(db, 'settings', 'app'),
        (snap) => setSettings(snap.exists() ? (snap.data() as AppSettings) : null),
        (err) => handleFirestoreError(err, OperationType.GET, 'settings/app')
      ),
    ];

    return () => unsubs.forEach((u) => u());
  }, [authReady, role, firebaseUser]);

  // Attach strictly isolated listeners or server_session fetch for Member
  useEffect(() => {
    if (!authReady || role !== 'member') return;

    if (firebaseUser) {
      const uid = firebaseUser.uid;
      const unsubs = [
        onSnapshot(
          query(collection(db, 'members'), where('memberUid', '==', uid)),
          (snap) => setMembers(snap.docs.map((d) => d.data() as Member)),
          (err) => handleFirestoreError(err, OperationType.LIST, 'members')
        ),
        onSnapshot(
          query(collection(db, 'attendance'), where('memberUid', '==', uid)),
          (snap) => setAttendance(snap.docs.map((d) => d.data() as AttendanceRecord)),
          (err) => handleFirestoreError(err, OperationType.LIST, 'attendance')
        ),
        onSnapshot(
          query(collection(db, 'overtimeRecords'), where('memberUid', '==', uid)),
          (snap) => setOvertime(snap.docs.map((d) => d.data() as OvertimeRecord)),
          (err) => handleFirestoreError(err, OperationType.LIST, 'overtimeRecords')
        ),
        onSnapshot(
          query(collection(db, 'advances'), where('memberUid', '==', uid)),
          (snap) => setAdvances(snap.docs.map((d) => d.data() as AdvanceTransaction)),
          (err) => handleFirestoreError(err, OperationType.LIST, 'advances')
        ),
        onSnapshot(
          query(collection(db, 'payments'), where('memberUid', '==', uid)),
          (snap) => setPayments(snap.docs.map((d) => d.data() as PaymentTransaction)),
          (err) => handleFirestoreError(err, OperationType.LIST, 'payments')
        ),
        onSnapshot(
          query(collection(db, 'salarySlips'), where('memberUid', '==', uid)),
          (snap) => setSlips(snap.docs.map((d) => d.data() as SalarySlip)),
          (err) => handleFirestoreError(err, OperationType.LIST, 'salarySlips')
        ),
        onSnapshot(
          query(collection(db, 'notifications'), where('memberUid', '==', uid)),
          (snap) => setNotifications(snap.docs.map((d) => d.data() as NotificationItem)),
          (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
        ),
        onSnapshot(
          doc(db, 'settings', 'app'),
          (snap) => setSettings(snap.exists() ? (snap.data() as AppSettings) : null),
          (err) => handleFirestoreError(err, OperationType.GET, 'settings/app')
        ),
      ];
      return () => unsubs.forEach((u) => u());
    }

    if (memberSessionToken) {
      fetch(apiUrl('/api/member-portal/me'), {
        headers: { Authorization: `Bearer ${memberSessionToken}` },
      })
        .then(async (resp) => {
          if (!resp.ok) {
            localStorage.removeItem('sagar_member_token');
            setMemberSessionToken(null);
            setRole(null);
            return;
          }
          const data = (await resp.json()) as {
            member: Member;
            attendance: AttendanceRecord[];
            overtimeRecords: OvertimeRecord[];
            advances: AdvanceTransaction[];
            payments: PaymentTransaction[];
            salarySlips: SalarySlip[];
            notifications: NotificationItem[];
            settings: AppSettings | null;
          };
          setMembers([data.member]);
          setAttendance(data.attendance || []);
          setOvertime(data.overtimeRecords || []);
          setAdvances(data.advances || []);
          setPayments(data.payments || []);
          setSlips(data.salarySlips || []);
          setNotifications(data.notifications || []);
          setSettings(data.settings || null);
        })
        .catch(() => {});
    }
  }, [authReady, role, firebaseUser, memberSessionToken]);

  const handleAdminGoogleLogin = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
      if (isNativePlatform()) {
        setAuthError(
          `Google Sign-In popup is restricted inside the Android WebView (${msg}). Use Admin Mobile Number + Password to sign in.`
        );
      } else {
        setAuthError(msg);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAdminPhoneLogin = async (phone: string, password: string) => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const phoneNorm = normalizePhoneDigits(phone);
      if (phoneNorm.length < 10 || !password) {
        setAuthError('Valid 10-digit Admin mobile number and password are required.');
        return;
      }

      if (isNativePlatform() && !hasConfiguredApiBase()) {
        await signInWithEmailAndPassword(auth, adminPhoneToAuthEmail(phoneNorm), password);
        return;
      }

      const resp = await fetch(apiUrl('/api/auth/admin-login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password }),
      });
      const data = (await resp.json()) as {
        ok?: boolean;
        error?: string;
        mode?: 'custom_token' | 'email_password';
        customToken?: string;
        authEmail?: string;
      };
      if (!resp.ok || !data.ok) {
        setAuthError(data.error || 'Invalid Admin mobile number or password.');
        return;
      }

      if (data.mode === 'custom_token' && data.customToken) {
        await signInWithCustomToken(auth, data.customToken);
      } else if (data.mode === 'email_password' && data.authEmail) {
        await signInWithEmailAndPassword(auth, data.authEmail, password);
      } else {
        setAuthError('Unsupported Admin authentication response.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('operation-not-allowed')) {
        setAuthError(
          'Email/Password provider is not enabled in Firebase Console yet. Enable Authentication → Sign-in method → Email/Password in Firebase Console.'
        );
      } else {
        setAuthError(msg || 'Admin login failed.');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleFirstAdminSetup = async (input: {
    phone: string;
    password: string;
    displayName?: string;
  }) => {
    setAuthError(null);
    setAuthLoading(true);
    setupInProgressRef.current = true;
    try {
      let currentUser = auth.currentUser;
      if (
        !currentUser ||
        !currentUser.emailVerified ||
        currentUser.email !== BOOTSTRAPPED_ADMIN_EMAIL
      ) {
        const cred = await signInWithPopup(auth, googleProvider);
        currentUser = cred.user;
      }

      if (
        !currentUser.emailVerified ||
        currentUser.email !== BOOTSTRAPPED_ADMIN_EMAIL
      ) {
        await signOut(auth).catch(() => {});
        setAuthError(
          `Only the authorized owner account (${BOOTSTRAPPED_ADMIN_EMAIL}) can perform First-Time Admin Setup.`
        );
        return;
      }

      await ensureAdminBootstrap();
      const provisioned = await provisionAdminMobileCredentials({
        phone: input.phone,
        password: input.password,
        displayName: input.displayName,
        allowUpdate: false,
      });

      const signedIn = await signInWithEmailAndPassword(
        auth,
        provisioned.authEmail,
        input.password
      );
      const adminSnap = await getDoc(doc(db, 'admins', signedIn.user.uid));
      if (!adminSnap.exists()) {
        await signOut(auth).catch(() => {});
        setAuthError('Admin authorization record could not be verified.');
        return;
      }

      setFirebaseUser(signedIn.user);
      setRole('admin');
      setAuthReady(true);
      showToast(
        `Admin mobile login (${provisioned.phoneNormalized}) created successfully.`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAuthError(msg || 'First-Time Admin Setup failed.');
    } finally {
      setupInProgressRef.current = false;
      setAuthLoading(false);
    }
  };

  const handleMemberLogin = async (phone: string, password: string) => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const phoneNorm = normalizePhoneDigits(phone);
      if (phoneNorm.length < 6 || !password) {
        setAuthError('Mobile number and password are required.');
        return;
      }

      if (isNativePlatform() && !hasConfiguredApiBase()) {
        await signInWithEmailAndPassword(auth, memberPhoneToAuthEmail(phoneNorm), password);
        setRole('member');
        return;
      }

      const resp = await fetch(apiUrl('/api/auth/member-login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password }),
      });
      const data = (await resp.json()) as {
        ok?: boolean;
        error?: string;
        mode?: 'custom_token' | 'email_password' | 'server_session';
        customToken?: string;
        authEmail?: string;
        sessionToken?: string;
      };
      if (!resp.ok || !data.ok) {
        setAuthError(data.error || 'Member login failed.');
        return;
      }

      if (data.mode === 'custom_token' && data.customToken) {
        await signInWithCustomToken(auth, data.customToken);
        setRole('member');
      } else if (data.mode === 'email_password' && data.authEmail) {
        await signInWithEmailAndPassword(auth, data.authEmail, password);
        setRole('member');
      } else if (data.mode === 'server_session' && data.sessionToken) {
        localStorage.setItem('sagar_member_token', data.sessionToken);
        setMemberSessionToken(data.sessionToken);
        setRole('member');
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Member login failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    localStorage.removeItem('sagar_member_token');
    setMemberSessionToken(null);
    setRole(null);
    setMembers([]);
    setAttendance([]);
    setOvertime([]);
    setAdvances([]);
    setPayments([]);
    setSlips([]);
    await signOut(auth).catch(() => {});
  };

  const t = TRANSLATIONS[lang];

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <img src={logoUrl} alt="SAGAR MANAGEMENT" className="h-14 w-14 rounded-2xl object-cover shadow" />
          <p className="text-xs font-semibold text-slate-500">Loading SAGAR MANAGEMENT...</p>
        </div>
      </div>
    );
  }

  if (!role) {
    return (
      <>
        <LoginView
          lang={lang}
          dark={dark}
          onToggleLang={() => setLang((l) => (l === 'en' ? 'bn' : 'en'))}
          onToggleDark={() => setDark((d) => !d)}
          onAdminGoogleLogin={handleAdminGoogleLogin}
          onAdminPhoneLogin={handleAdminPhoneLogin}
          onFirstAdminSetup={handleFirstAdminSetup}
          onMemberLogin={handleMemberLogin}
          authError={authError}
          authLoading={authLoading}
        />
        <OfflineIndicator />
      </>
    );
  }

  if (role === 'member') {
    const activeMember = members[0];
    if (!activeMember) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center dark:bg-slate-950">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Loading your personal member portal...
          </p>
          <button
            type="button"
            onClick={handleSignOut}
            className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold"
          >
            Sign Out
          </button>
        </div>
      );
    }

    return (
      <>
        <MemberPortalView
          lang={lang}
          dark={dark}
          onToggleLang={() => setLang((l) => (l === 'en' ? 'bn' : 'en'))}
          onToggleDark={() => setDark((d) => !d)}
          onSignOut={handleSignOut}
          member={activeMember}
          attendance={attendance}
          overtime={overtime}
          advances={advances}
          payments={payments}
          slips={slips}
          notifications={notifications}
          settings={settings}
        />
        <OfflineIndicator />
      </>
    );
  }

  const navItems: Array<{ id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'dashboard', label: t.dashboard, icon: LayoutDashboard },
    { id: 'members', label: t.members, icon: Users },
    { id: 'attendance', label: t.attendance, icon: CalendarCheck },
    { id: 'salary', label: t.salary, icon: FileBarChart },
    { id: 'advances', label: t.advances, icon: Wallet },
    { id: 'payments', label: t.payments, icon: CreditCard },
    { id: 'accounting', label: t.accounting, icon: BookOpen },
    { id: 'reports', label: t.reports, icon: FileSpreadsheet },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 bg-[#0B1F3A] text-white dark:border-slate-800">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <img src={logoUrl} alt="Logo" className="h-10 w-10 rounded-xl object-cover shrink-0" />
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-extrabold tracking-tight text-white">
              {settings?.companyName || t.appName}
            </p>
            <p className="truncate text-[10px] font-medium text-emerald-400">Admin Console</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition min-h-[42px] ${
                  active
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-xs font-semibold text-white hover:bg-white/20"
          >
            <LogOut className="h-4 w-4" />
            <span>{t.signOut}</span>
          </button>
        </div>
      </aside>

      {/* Main Content Wrapper */}
      <div className="flex flex-1 flex-col lg:pl-64 pb-20 lg:pb-0 min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md sm:px-6 dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 lg:hidden dark:border-slate-700"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="truncate font-display text-sm font-bold text-[#0B1F3A] dark:text-white sm:text-base">
              {navItems.find((i) => i.id === activeTab)?.label}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton label={t.installApp} />
            <button
              type="button"
              onClick={() => setLang((l) => (l === 'en' ? 'bn' : 'en'))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 min-h-[38px]"
            >
              <Globe className="h-3.5 w-3.5 text-emerald-600" />
              <span>{t.language}</span>
            </button>
            <button
              type="button"
              onClick={() => setDark((d) => !d)}
              aria-label="Toggle theme"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
            >
              {dark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        {/* Active View */}
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
          {activeTab === 'dashboard' && (
            <AdminDashboardView
              lang={lang}
              members={members}
              attendance={attendance}
              overtime={overtime}
              advances={advances}
              payments={payments}
              onNavigate={(tab) => setActiveTab(tab as AdminTab)}
            />
          )}
          {activeTab === 'members' && (
            <MembersView
              lang={lang}
              members={members}
              attendance={attendance}
              overtime={overtime}
              advances={advances}
              payments={payments}
              slips={slips}
              settings={settings}
              onToast={showToast}
            />
          )}
          {activeTab === 'attendance' && (
            <AttendanceOvertimeView
              lang={lang}
              members={members}
              attendance={attendance}
              overtime={overtime}
              settings={settings}
              onToast={showToast}
            />
          )}
          {activeTab === 'salary' && (
            <SalaryView
              lang={lang}
              members={members}
              attendance={attendance}
              overtime={overtime}
              advances={advances}
              payments={payments}
              slips={slips}
              onToast={showToast}
            />
          )}
          {activeTab === 'advances' && (
            <AdvancesView
              lang={lang}
              members={members}
              attendance={attendance}
              overtime={overtime}
              advances={advances}
              payments={payments}
              onToast={showToast}
            />
          )}
          {activeTab === 'payments' && (
            <PaymentsView
              lang={lang}
              members={members}
              payments={payments}
              settings={settings}
              onNavigateSettings={() => setActiveTab('reports')}
              onToast={showToast}
            />
          )}
          {activeTab === 'accounting' && (
            <AccountingMessagesView
              lang={lang}
              members={members}
              attendance={attendance}
              overtime={overtime}
              advances={advances}
              payments={payments}
              settings={settings}
              onToast={showToast}
            />
          )}
          {activeTab === 'reports' && (
            <ReportsSettingsView
              lang={lang}
              members={members}
              attendance={attendance}
              overtime={overtime}
              advances={advances}
              payments={payments}
              slips={slips}
              activityLogs={activityLogs}
              settings={settings}
              onToast={showToast}
            />
          )}
        </main>
      </div>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative z-10 flex w-72 flex-col bg-[#0B1F3A] text-white">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-3">
                <img src={logoUrl} alt="Logo" className="h-9 w-9 rounded-lg object-cover" />
                <span className="font-display text-sm font-bold">{t.appName}</span>
              </div>
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="p-1 text-slate-300">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium ${
                      activeTab === item.id ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="border-t border-white/10 p-4">
              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-2.5 text-xs font-semibold"
              >
                <LogOut className="h-4 w-4" />
                <span>{t.signOut}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Tab Bar (5 quick thumb destinations) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white/95 backdrop-blur-md pb-safe lg:hidden dark:border-slate-800 dark:bg-slate-900/95">
        {[
          { id: 'dashboard', icon: LayoutDashboard, label: 'Home' },
          { id: 'members', icon: Users, label: 'Members' },
          { id: 'attendance', icon: CalendarCheck, label: 'Attend' },
          { id: 'salary', icon: FileBarChart, label: 'Salary' },
          { id: 'accounting', icon: BookOpen, label: 'Ledger' },
        ].map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id as AdminTab)}
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

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed right-4 top-16 z-50 max-w-sm rounded-xl px-4 py-3 text-xs font-semibold text-white shadow-lg ${
            toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'
          }`}
        >
          {toast.msg}
        </div>
      )}

      <OfflineIndicator />
    </div>
  );
}

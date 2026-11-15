import type { BalanceDirection, Language, MemberFinancialSummary } from '../types';
import { formatCurrency } from './accounting';

export const TRANSLATIONS: Record<Language, Record<string, string>> = {
  en: {
    appName: 'SAGAR MANAGEMENT',
    tagline: 'SMART ATTENDANCE • SALARY • WORKER MANAGEMENT',
    dashboard: 'Dashboard',
    members: 'Members',
    attendance: 'Attendance',
    salary: 'Salary & Slips',
    advances: 'Advances',
    payments: 'Payments',
    accounting: 'Ledger & Messages',
    reports: 'Reports & Settings',
    myPortal: 'My Portal',
    signOut: 'Sign Out',
    adminLogin: 'Admin Login',
    memberLogin: 'Member Login',
    adminLoginBtn: 'Sign In as Admin',
    firstAdminSetup: 'First-Time Admin Setup',
    createFirstAdminBtn: 'Verify Owner & Create Admin Account',
    signInWithGoogle: 'Sign in with Google (Owner)',
    phoneLabel: 'Mobile Number',
    passwordLabel: 'Password',
    loginBtn: 'Sign In to Portal',
    totalMembers: 'Total Members',
    todayPresent: "Today's Present",
    todayAbsent: "Today's Absent",
    weeklySalary: 'Weekly Salary',
    monthlySalary: 'Monthly Salary',
    totalOt: 'Total Overtime',
    totalAdvance: 'Outstanding Advance',
    totalPayments: 'Total Payments',
    memberOwesAdmin: 'Outstanding Member Balances',
    adminOwesMember: 'Outstanding Admin Balances',
    youOweMember: 'YOU OWE MEMBER',
    memberOwesYou: 'MEMBER OWES YOU',
    allSettled: 'ALL SETTLED',
    youOweAdmin: 'YOU OWE ADMIN',
    adminOwesYou: 'ADMIN OWES YOU',
    addMember: 'Add Member',
    editMember: 'Edit Member',
    deleteMember: 'Delete Member',
    searchPlaceholder: 'Search by name, mobile, or ID...',
    weeklyMode: 'Weekly (7 Days)',
    monthlyMode: 'Monthly',
    customMode: 'Custom Range',
    present: 'Present',
    absent: 'Absent',
    normalAdvance: 'Normal Advance',
    cookingAdvance: 'Cooking Advance',
    giveAdvance: 'Give Advance',
    recordRepayment: 'Record Repayment',
    recordPayment: 'Record Payment',
    downloadPdf: 'Download PDF',
    printPdf: 'Print',
    sharePdf: 'Share PDF',
    exportExcel: 'Export Excel',
    exportCsv: 'Export CSV',
    exportPdf: 'Export PDF',
    sendWhatsApp: 'Send WhatsApp',
    sendSms: 'Send SMS',
    save: 'Save',
    cancel: 'Cancel',
    confirmDelete: 'Confirm Deletion',
    installApp: 'Install App',
    darkMode: 'Dark Mode',
    lightMode: 'Light Mode',
    language: 'বাংলা',
  },
  bn: {
    appName: 'সাগর ম্যানেজমেন্ট',
    tagline: 'স্মার্ট উপস্থিতি • বেতন • কর্মী পরিচালনা',
    dashboard: 'ড্যাশবোর্ড',
    members: 'সদস্যবৃন্দ',
    attendance: 'উপস্থিতি',
    salary: 'বেতন ও স্লিপ',
    advances: 'অগ্রিম (অ্যাডভান্স)',
    payments: 'পেমেন্ট',
    accounting: 'হিসাব ও বার্তা',
    reports: 'রিপোর্ট ও সেটিংস',
    myPortal: 'আমার পোর্টাল',
    signOut: 'লগ আউট',
    adminLogin: 'অ্যাডমিন লগইন',
    memberLogin: 'সদস্য লগইন',
    adminLoginBtn: 'অ্যাডমিন হিসেবে প্রবেশ করুন',
    firstAdminSetup: 'প্রথমবার অ্যাডমিন সেটআপ',
    createFirstAdminBtn: 'মালিক যাচাই ও অ্যাডমিন তৈরি করুন',
    signInWithGoogle: 'গুগল দিয়ে মালিক লগইন',
    phoneLabel: 'মোবাইল নম্বর',
    passwordLabel: 'পাসওয়ার্ড',
    loginBtn: 'পোর্টালে প্রবেশ করুন',
    totalMembers: 'মোট সদস্য',
    todayPresent: 'আজ উপস্থিত',
    todayAbsent: 'আজ অনুপস্থিত',
    weeklySalary: 'সাপ্তাহিক বেতন',
    monthlySalary: 'মাসিক বেতন',
    totalOt: 'মোট ওভারটাইম',
    totalAdvance: 'বকেয়া অগ্রিম',
    totalPayments: 'মোট পেমেন্ট',
    memberOwesAdmin: 'সদস্যদের কাছে পাওনা',
    adminOwesMember: 'সদস্যদের বকেয়া বেতন',
    youOweMember: 'আপনি সদস্যকে দেবেন',
    memberOwesYou: 'সদস্য আপনার কাছে দেনা',
    allSettled: 'সম্পূর্ণ পরিশোধিত',
    youOweAdmin: 'আপনি অ্যাডমিনকে দেবেন',
    adminOwesYou: 'অ্যাডমিন আপনাকে দেবেন',
    addMember: 'নতুন সদস্য যোগ',
    editMember: 'সদস্য সম্পাদনা',
    deleteMember: 'সদস্য মুছুন',
    searchPlaceholder: 'নাম, মোবাইল বা আইডি দিয়ে খুঁজুন...',
    weeklyMode: 'সাপ্তাহিক (৭ দিন)',
    monthlyMode: 'মাসিক',
    customMode: 'কাস্টম তারিখ',
    present: 'উপস্থিত',
    absent: 'অনুপস্থিত',
    normalAdvance: 'সাধারণ অগ্রিম',
    cookingAdvance: 'রান্নার অগ্রিম',
    giveAdvance: 'অগ্রিম প্রদান',
    recordRepayment: 'অগ্রিম ফেরত',
    recordPayment: 'পেমেন্ট যোগ করুন',
    downloadPdf: 'পিডিএফ ডাউনলোড',
    printPdf: 'প্রিন্ট',
    sharePdf: 'শেয়ার পিডিএফ',
    exportExcel: 'এক্সেল এক্সপোর্ট',
    exportCsv: 'সিএসভি এক্সপোর্ট',
    exportPdf: 'পিডিএফ এক্সপোর্ট',
    sendWhatsApp: 'হোয়াটসঅ্যাপ পাঠান',
    sendSms: 'এসএমএস পাঠান',
    save: 'সংরক্ষণ করুন',
    cancel: 'বাতিল',
    confirmDelete: 'মুছে ফেলা নিশ্চিত করুন',
    installApp: 'অ্যাপ ইনস্টল',
    darkMode: 'ডার্ক মোড',
    lightMode: 'লাইট মোড',
    language: 'English',
  },
};

export function translateDirection(dir: BalanceDirection, lang: Language, isMemberView = false): string {
  if (lang === 'bn') {
    if (dir === 'ALL SETTLED') return TRANSLATIONS.bn.allSettled;
    if (isMemberView) {
      return dir === 'YOU OWE MEMBER' ? TRANSLATIONS.bn.adminOwesYou : TRANSLATIONS.bn.youOweAdmin;
    }
    return dir === 'YOU OWE MEMBER' ? TRANSLATIONS.bn.youOweMember : TRANSLATIONS.bn.memberOwesYou;
  }
  if (dir === 'ALL SETTLED') return 'ALL SETTLED';
  if (isMemberView) {
    return dir === 'YOU OWE MEMBER' ? 'ADMIN OWES YOU' : 'YOU OWE ADMIN';
  }
  return dir;
}

export type MessageTemplateType =
  | 'attendance'
  | 'salary'
  | 'advance'
  | 'reminder'
  | 'balance'
  | 'confirmation';

export function buildTemplateMessage(
  type: MessageTemplateType,
  lang: Language,
  summary: MemberFinancialSummary,
  extra?: { periodLabel?: string; amount?: number; method?: string; upiId?: string }
): string {
  const { member } = summary;
  const period = extra?.periodLabel || 'Current Period';
  const balDirText = translateDirection(summary.balanceDirection, lang, true);

  if (lang === 'bn') {
    switch (type) {
      case 'attendance':
        return `সাগর ম্যানেজমেন্ট - উপস্থিতি রিপোর্ট\nনাম: ${member.fullName} (${member.memberCode})\nউপস্থিত: ${summary.presentDays} দিন | অনুপস্থিত: ${summary.absentDays} দিন\nউপস্থিতির হার: ${summary.attendancePercent}%\nওভারটাইম: ${summary.otHours} ঘণ্টা`;
      case 'salary':
        return `সাগর ম্যানেজমেন্ট - বেতন বিবরণী (${period})\nনাম: ${member.fullName} (${member.memberCode})\nউপস্থিত দিন: ${summary.presentDays} × ${formatCurrency(member.dailySalaryRate)} = ${formatCurrency(summary.totalSalaryEarned)}\nওভারটাইম: ${summary.otHours} ঘণ্টা = ${formatCurrency(summary.totalOtEarned)}\nমোট বেতন: ${formatCurrency(summary.grossEarned)}\nমোট অগ্রিম: ${formatCurrency(summary.totalAdvanceOutstanding)}\nচূড়ান্ত ব্যালেন্স: ${formatCurrency(summary.absBalance)} (${balDirText})`;
      case 'advance':
        return `সাগর ম্যানেজমেন্ট - অগ্রিম (অ্যাডভান্স) হিসাব\nনাম: ${member.fullName}\nসাধারণ অগ্রিম বকেয়া: ${formatCurrency(summary.normalAdvanceNet)}\nরান্নার অগ্রিম বকেয়া: ${formatCurrency(summary.cookingAdvanceNet)}\nমোট বকেয়া অগ্রিম: ${formatCurrency(summary.totalAdvanceOutstanding)}`;
      case 'reminder':
        return `সাগর ম্যানেজমেন্ট - পেমেন্ট রিমাইন্ডার\nপ্রিয় ${member.fullName}, আপনার বকেয়া ব্যালেন্স ${formatCurrency(summary.absBalance)} (${balDirText})।${extra?.upiId ? `\nUPI ID: ${extra.upiId}` : ''}\nদয়া করে দ্রুত পরিশোধ করুন।`;
      case 'balance':
        return `সাগর ম্যানেজমেন্ট - বকেয়া হিসাব\nনাম: ${member.fullName} (${member.memberCode})\nমোট উপার্জন: ${formatCurrency(summary.grossEarned)}\nমোট অগ্রিম ও পেমেন্ট: ${formatCurrency(summary.totalAdvanceOutstanding + summary.salaryPaymentsGiven)}\nবর্তমান ব্যালেন্স: ${formatCurrency(summary.absBalance)} (${balDirText})`;
      case 'confirmation':
        return `সাগর ম্যানেজমেন্ট - পেমেন্ট নিশ্চিতকরণ\nনাম: ${member.fullName}\nপরিমাণ: ${formatCurrency(extra?.amount || 0)}\nমাধ্যম: ${extra?.method || 'UPI'}\nবর্তমান ব্যালেন্স: ${formatCurrency(summary.absBalance)} (${balDirText})\nধন্যবাদ।`;
    }
  }

  switch (type) {
    case 'attendance':
      return `SAGAR MANAGEMENT - Attendance Report\nName: ${member.fullName} (${member.memberCode})\nPresent: ${summary.presentDays} days | Absent: ${summary.absentDays} days\nAttendance: ${summary.attendancePercent}%\nOvertime: ${summary.otHours} hrs`;
    case 'salary':
      return `SAGAR MANAGEMENT - Salary Statement (${period})\nName: ${member.fullName} (${member.memberCode})\nBase Salary (${summary.presentDays}d × ${formatCurrency(member.dailySalaryRate)}): ${formatCurrency(summary.totalSalaryEarned)}\nOvertime (${summary.otHours}h): ${formatCurrency(summary.totalOtEarned)}\nGross Salary: ${formatCurrency(summary.grossEarned)}\nTotal Advance: ${formatCurrency(summary.totalAdvanceOutstanding)}\nFinal Balance: ${formatCurrency(summary.absBalance)} (${balDirText})`;
    case 'advance':
      return `SAGAR MANAGEMENT - Advance Summary\nName: ${member.fullName} (${member.memberCode})\nNormal Advance Net: ${formatCurrency(summary.normalAdvanceNet)}\nCooking Advance Net: ${formatCurrency(summary.cookingAdvanceNet)}\nTotal Outstanding Advance: ${formatCurrency(summary.totalAdvanceOutstanding)}`;
    case 'reminder':
      return `SAGAR MANAGEMENT - Payment Reminder\nDear ${member.fullName}, your pending balance is ${formatCurrency(summary.absBalance)} (${balDirText}).${extra?.upiId ? `\nUPI ID: ${extra.upiId}` : ''}\nPlease settle at your earliest convenience.`;
    case 'balance':
      return `SAGAR MANAGEMENT - Balance Statement\nName: ${member.fullName} (${member.memberCode})\nTotal Earned: ${formatCurrency(summary.grossEarned)}\nAdvances & Payments: ${formatCurrency(summary.totalAdvanceOutstanding + summary.salaryPaymentsGiven)}\nCurrent Balance: ${formatCurrency(summary.absBalance)} (${balDirText})`;
    case 'confirmation':
      return `SAGAR MANAGEMENT - Payment Confirmation\nName: ${member.fullName}\nAmount: ${formatCurrency(extra?.amount || 0)}\nMethod: ${extra?.method || 'UPI'}\nUpdated Balance: ${formatCurrency(summary.absBalance)} (${balDirText})\nThank you.`;
  }
}

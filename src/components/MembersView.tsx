import React, { useEffect, useMemo, useState } from 'react';
import {
  Edit2,
  KeyRound,
  Plus,
  QrCode,
  Search,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';
import QRCode from 'qrcode';
import {
  computeMemberFinancialSummary,
  formatCurrency,
  todayISO,
} from '../lib/accounting';
import {
  createMemberWithCredentials,
  deleteMemberRecord,
  resetMemberPasswordByAdmin,
  updateMemberProfile,
  uploadImageAsset,
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
  SalarySlip,
} from '../types';
import { ConfirmDialog } from './ConfirmDialog';

interface MembersViewProps {
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

async function compressPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSide = 256;
        const ratio = Math.min(maxSide / img.width, maxSide / img.height, 1);
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas error'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = () => reject(new Error('Invalid image file'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export const MembersView: React.FC<MembersViewProps> = ({
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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Add/Edit Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [memberCode, setMemberCode] = useState('');
  const [joiningDate, setJoiningDate] = useState(todayISO());
  const [dailySalaryRate, setDailySalaryRate] = useState('500');
  const [otRate, setOtRate] = useState(String(settings?.defaultOtRate || 80));
  const [previousBalance, setPreviousBalance] = useState('0');
  const [upiId, setUpiId] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');

  // Profile Drawer & QR
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  // Password Reset Modal
  const [resetTarget, setResetTarget] = useState<Member | null>(null);
  const [newPass, setNewPass] = useState('');

  // Delete Confirm
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);

  useEffect(() => {
    if (!selectedMember) {
      setQrDataUrl('');
      return;
    }
    const payload = selectedMember.upiId
      ? `upi://pay?pa=${encodeURIComponent(selectedMember.upiId)}&pn=${encodeURIComponent(selectedMember.fullName)}`
      : selectedMember.qrData || `SAGAR_MEMBER:${selectedMember.memberId}:${selectedMember.phone}`;
    QRCode.toDataURL(payload, { width: 220, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [selectedMember]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      if (!q) return true;
      return (
        m.fullName.toLowerCase().includes(q) ||
        m.phone.toLowerCase().includes(q) ||
        m.memberCode.toLowerCase().includes(q)
      );
    });
  }, [members, search, statusFilter]);

  const openAddModal = () => {
    setEditingMember(null);
    setFullName('');
    setPhone('');
    setPassword('');
    setMemberCode(`SM-${1001 + members.length}`);
    setJoiningDate(todayISO());
    setDailySalaryRate('500');
    setOtRate(String(settings?.defaultOtRate || 80));
    setPreviousBalance('0');
    setUpiId('');
    setPhotoUrl('');
    setStatus('active');
    setModalOpen(true);
  };

  const openEditModal = (m: Member) => {
    setEditingMember(m);
    setFullName(m.fullName);
    setPhone(m.phone);
    setPassword('');
    setMemberCode(m.memberCode);
    setJoiningDate(m.joiningDate);
    setDailySalaryRate(String(m.dailySalaryRate));
    setOtRate(String(m.otRate));
    setPreviousBalance(String(m.previousBalance || 0));
    setUpiId(m.upiId || '');
    setPhotoUrl(m.photoUrl || '');
    setStatus(m.status);
    setModalOpen(true);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressPhoto(file);
      const uploaded = await uploadImageAsset('member_photos', `photo_${Date.now()}.jpg`, compressed);
      setPhotoUrl(uploaded);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Photo upload failed', 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || phone.replace(/\D/g, '').length < 6) {
      onToast('Enter valid Full Name and Mobile Number (min 6 digits).', 'error');
      return;
    }
    if (!editingMember && password.length < 6) {
      onToast('Member password must be at least 6 characters.', 'error');
      return;
    }

    setSaving(true);
    try {
      if (editingMember) {
        await updateMemberProfile(editingMember.memberId, {
          memberCode,
          fullName: fullName.trim(),
          phone: phone.replace(/\D/g, '').slice(-10),
          joiningDate,
          dailySalaryRate: Number(dailySalaryRate) || 0,
          otRate: Number(otRate) || 0,
          previousBalance: Number(previousBalance) || 0,
          upiId: upiId.trim(),
          photoUrl,
          status,
        });
        onToast('Member updated successfully.');
      } else {
        await createMemberWithCredentials({
          memberCode,
          fullName: fullName.trim(),
          phone,
          password,
          joiningDate,
          dailySalaryRate: Number(dailySalaryRate) || 0,
          otRate: Number(otRate) || 0,
          previousBalance: Number(previousBalance) || 0,
          photoUrl,
          upiId: upiId.trim(),
        });
        onToast('Member created with secure login credentials.');
      }
      setModalOpen(false);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to save member.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget || newPass.length < 6) {
      onToast('New password must be at least 6 characters.', 'error');
      return;
    }
    setSaving(true);
    try {
      await resetMemberPasswordByAdmin(resetTarget, newPass);
      onToast(`Password updated for ${resetTarget.fullName}.`);
      setResetTarget(null);
      setNewPass('');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Password reset failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteMemberRecord(deleteTarget);
      if (selectedMember?.memberId === deleteTarget.memberId) setSelectedMember(null);
      onToast(`${deleteTarget.fullName} deleted.`);
      setDeleteTarget(null);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to delete member.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const selectedSummary = useMemo(
    () =>
      selectedMember
        ? computeMemberFinancialSummary(selectedMember, attendance, overtime, advances, payments)
        : null,
    [selectedMember, attendance, overtime, advances, payments]
  );

  const selectedSlips = useMemo(
    () =>
      selectedMember ? slips.filter((s) => s.memberId === selectedMember.memberId) : [],
    [selectedMember, slips]
  );

  return (
    <div className="space-y-6">
      {/* Header & Search */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
            {t.members}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {members.length} total workers · Mobile login & individual QR codes
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 min-h-[42px]"
        >
          <Plus className="h-4 w-4" />
          <span>{t.addMember}</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-[#0B1F3A] dark:border-slate-800 dark:bg-slate-900 dark:text-white min-h-[42px]"
          />
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
          {(['all', 'active', 'inactive'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                statusFilter === st
                  ? 'bg-[#0B1F3A] text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Members Grid / Table */}
      {filteredMembers.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <User className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
          <p className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-300">
            No matching members found.
          </p>
          <button
            type="button"
            onClick={openAddModal}
            className="mt-4 rounded-lg bg-[#0B1F3A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#132E54]"
          >
            {t.addMember}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredMembers.map((m) => {
            const sum = computeMemberFinancialSummary(m, attendance, overtime, advances, payments);
            return (
              <div
                key={m.memberId}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div
                      onClick={() => setSelectedMember(m)}
                      className="flex cursor-pointer items-center gap-3 min-w-0"
                    >
                      {m.photoUrl ? (
                        <img
                          src={m.photoUrl}
                          alt={m.fullName}
                          className="h-12 w-12 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                        />
                      ) : (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0B1F3A] font-display text-base font-bold text-white">
                          {m.fullName.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3 className="truncate font-bold text-slate-900 dark:text-white">
                          {m.fullName}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {m.memberCode} · {m.phone}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-[11px] font-semibold uppercase tracking-wide ${
                        m.status === 'active'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {m.status}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                    <div>
                      <p className="text-slate-500">Daily Rate</p>
                      <p className="mt-0.5 font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatCurrency(m.dailySalaryRate)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">OT / Hr</p>
                      <p className="mt-0.5 font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatCurrency(m.otRate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-slate-500">Balance</p>
                      <p
                        className={`mt-0.5 font-mono font-bold tabular-nums ${
                          sum.balanceDirection === 'YOU OWE MEMBER'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : sum.balanceDirection === 'MEMBER OWES YOU'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-slate-500'
                        }`}
                      >
                        {formatCurrency(sum.absBalance)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setSelectedMember(m)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 min-h-[36px]"
                  >
                    <QrCode className="h-3.5 w-3.5" />
                    <span>Profile & QR</span>
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setResetTarget(m);
                        setNewPass('');
                      }}
                      title="Reset Password"
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-[#0B1F3A] dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                      <KeyRound className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(m)}
                      title="Edit Member"
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-[#0B1F3A] dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(m)}
                      title="Delete Member"
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="my-8 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                {editingMember ? t.editMember : t.addMember}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div className="flex items-center gap-4">
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt="Preview"
                    className="h-16 w-16 rounded-xl object-cover border border-slate-200"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800">
                    <User className="h-7 w-7" />
                  </div>
                )}
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <Upload className="h-4 w-4" />
                  <span>Upload Profile Photo</span>
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Member ID *
                  </label>
                  <input
                    type="text"
                    required
                    value={memberCode}
                    onChange={(e) => setMemberCode(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Mobile Number (Login ID) *
                  </label>
                  <input
                    type="tel"
                    required
                    disabled={!!editingMember}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="10-digit mobile"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                {!editingMember && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Portal Password (min 6) *
                    </label>
                    <input
                      type="text"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Set member password"
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Joining Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={joiningDate}
                    onChange={(e) => setJoiningDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Daily Salary Rate (₹) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={dailySalaryRate}
                    onChange={(e) => setDailySalaryRate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Overtime Rate / Hr (₹) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={otRate}
                    onChange={(e) => setOtRate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Opening Previous Balance (₹)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={previousBalance}
                    onChange={(e) => setPreviousBalance(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Member UPI ID (Optional)
                  </label>
                  <input
                    type="text"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    placeholder="worker@upi"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                {editingMember && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Account Status
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#0B1F3A] px-5 py-2 text-sm font-semibold text-white hover:bg-[#132E54] disabled:opacity-50"
                >
                  {saving ? 'Saving...' : t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Member Profile & QR Modal */}
      {selectedMember && selectedSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="my-8 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-3">
                {selectedMember.photoUrl ? (
                  <img
                    src={selectedMember.photoUrl}
                    alt={selectedMember.fullName}
                    className="h-14 w-14 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#0B1F3A] text-lg font-bold text-white">
                    {selectedMember.fullName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                    {selectedMember.fullName}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {selectedMember.memberCode} · {selectedMember.phone} · Joined {selectedMember.joiningDate}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMember(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                {qrDataUrl && <img src={qrDataUrl} alt="Member QR" className="h-40 w-40 rounded-lg" />}
                <p className="mt-2 text-center text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {selectedMember.upiId ? `UPI: ${selectedMember.upiId}` : selectedMember.memberCode}
                </p>
              </div>

              <div className="sm:col-span-2 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                  <p className="text-slate-500">Present / Attendance %</p>
                  <p className="mt-1 font-mono text-base font-bold tabular-nums">
                    {selectedSummary.presentDays}d ({selectedSummary.attendancePercent}%)
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                  <p className="text-slate-500">Total Salary + OT</p>
                  <p className="mt-1 font-mono text-base font-bold tabular-nums">
                    {formatCurrency(selectedSummary.grossEarned)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                  <p className="text-slate-500">Total Advance Net</p>
                  <p className="mt-1 font-mono text-base font-bold tabular-nums text-amber-600">
                    {formatCurrency(selectedSummary.totalAdvanceOutstanding)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                  <p className="text-slate-500">Final Balance</p>
                  <p
                    className={`mt-1 font-mono text-base font-bold tabular-nums ${
                      selectedSummary.balanceDirection === 'YOU OWE MEMBER'
                        ? 'text-emerald-600'
                        : selectedSummary.balanceDirection === 'MEMBER OWES YOU'
                          ? 'text-red-600'
                          : 'text-slate-500'
                    }`}
                  >
                    {formatCurrency(selectedSummary.absBalance)}
                  </p>
                  <p className="text-[10px] font-semibold text-slate-500">
                    {selectedSummary.balanceDirection}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Individual Salary Slip History ({selectedSlips.length})
              </h4>
              {selectedSlips.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No archived salary slips yet.</p>
              ) : (
                <div className="mt-2 max-h-40 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                  {selectedSlips.map((slip) => (
                    <div key={slip.slipId} className="flex items-center justify-between px-4 py-2.5 text-xs">
                      <div>
                        <p className="font-semibold">{slip.periodLabel}</p>
                        <p className="text-slate-500">{slip.startDate} to {slip.endDate}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-bold">{formatCurrency(Math.abs(slip.finalBalance))}</p>
                        <p className="text-[10px] text-slate-500">{slip.balanceDirection}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Reset Password — {resetTarget.fullName}
            </h3>
            <p className="mt-1 text-xs text-slate-500">Mobile Login ID: {resetTarget.phone}</p>
            <form onSubmit={handlePasswordReset} className="mt-4 space-y-4">
              <input
                type="text"
                required
                minLength={6}
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                placeholder="Enter new password (min 6 chars)"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#0B1F3A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#132E54]"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={t.confirmDelete}
        message={`Are you sure you want to delete ${deleteTarget?.fullName}? This removes their profile and login access.`}
        confirmLabel={t.deleteMember}
        cancelLabel={t.cancel}
        loading={saving}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

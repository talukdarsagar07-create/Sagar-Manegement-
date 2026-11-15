import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  Plus,
  QrCode,
  Share2,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import QRCode from 'qrcode';
import { formatCurrency, todayISO } from '../lib/accounting';
import {
  deletePaymentTransaction,
  savePaymentTransaction,
} from '../lib/firestoreApi';
import { TRANSLATIONS } from '../lib/i18n';
import type {
  AppSettings,
  Language,
  Member,
  PaymentDirection,
  PaymentMethod,
  PaymentTransaction,
} from '../types';
import { ConfirmDialog } from './ConfirmDialog';

interface PaymentsViewProps {
  lang: Language;
  members: Member[];
  payments: PaymentTransaction[];
  settings: AppSettings | null;
  onNavigateSettings: () => void;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}

const UPI_APPS: PaymentMethod[] = ['PhonePe', 'Google Pay', 'Paytm', 'UPI', 'Cash', 'Bank'];

export const PaymentsView: React.FC<PaymentsViewProps> = ({
  lang,
  members,
  payments,
  settings,
  onNavigateSettings,
  onToast,
}) => {
  const t = TRANSLATIONS[lang];
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PaymentTransaction | null>(null);
  const [adminUpiQr, setAdminUpiQr] = useState('');

  // Form
  const [memberId, setMemberId] = useState('');
  const [direction, setDirection] = useState<PaymentDirection>('TO_MEMBER');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState<PaymentMethod>('PhonePe');
  const [reference, setReference] = useState('');
  const [verified, setVerified] = useState(false);
  const [notes, setNotes] = useState('');

  const memberMap = useMemo(() => new Map(members.map((m) => [m.memberId, m])), [members]);

  useEffect(() => {
    if (!settings?.upiId) {
      setAdminUpiQr('');
      return;
    }
    const uri = `upi://pay?pa=${encodeURIComponent(settings.upiId)}&pn=${encodeURIComponent(settings.upiName || settings.companyName || 'SAGAR MANAGEMENT')}`;
    QRCode.toDataURL(uri, { width: 200, margin: 1 })
      .then(setAdminUpiQr)
      .catch(() => setAdminUpiQr(''));
  }, [settings]);

  const openNewPayment = () => {
    setMemberId(members[0]?.memberId || '');
    setDirection('TO_MEMBER');
    setAmount('');
    setDate(todayISO());
    setMethod('PhonePe');
    setReference(`UTR-${Date.now().toString().slice(-6)}`);
    setVerified(false);
    setNotes('');
    setModalOpen(true);
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const m = memberMap.get(memberId);
    const numAmt = Number(amount);
    if (!m) {
      onToast('Select a valid member.', 'error');
      return;
    }
    if (!numAmt || numAmt <= 0) {
      onToast('Enter a valid positive amount.', 'error');
      return;
    }
    if (!reference.trim()) {
      onToast('Transaction Reference / UTR is required.', 'error');
      return;
    }

    setSaving(true);
    try {
      await savePaymentTransaction({
        member: m,
        direction,
        amount: numAmt,
        date,
        method,
        reference,
        verified,
        notes,
      });
      onToast(
        verified
          ? 'Verified payment recorded in ledger.'
          : 'Payment logged as Pending Verification (not counted until verified).'
      );
      setModalOpen(false);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to save payment', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleVerify = async (p: PaymentTransaction) => {
    const m = memberMap.get(p.memberId);
    if (!m) return;
    try {
      await savePaymentTransaction({
        member: m,
        direction: p.direction,
        amount: p.amount,
        date: p.date,
        method: p.method,
        reference: p.reference,
        verified: !p.verified,
        notes: p.notes,
        existingId: p.paymentId,
      });
      onToast(!p.verified ? 'Payment marked as Verified.' : 'Payment marked as Unverified.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Verification update failed', 'error');
    }
  };

  const shareAdminQr = async () => {
    const text = `SAGAR MANAGEMENT Payment UPI ID: ${settings?.upiId || 'Not configured'}`;
    if (navigator.share) {
      await navigator.share({ title: 'SAGAR MANAGEMENT UPI Payment', text }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(text);
      onToast('Admin UPI details copied to clipboard.');
    }
  };

  const sortedPayments = useMemo(
    () => [...payments].sort((a, b) => b.date.localeCompare(a.date)),
    [payments]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
            {t.payments} &amp; UPI QR
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            PhonePe · Google Pay · Paytm · UPI · Verified transaction ledger
          </p>
        </div>
        <button
          type="button"
          disabled={members.length === 0}
          onClick={openNewPayment}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 min-h-[42px]"
        >
          <Plus className="h-4 w-4" />
          <span>{t.recordPayment}</span>
        </button>
      </div>

      {/* Admin UPI Card + Payment Methods */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Admin UPI Payment QR
            </h3>
            <button
              type="button"
              onClick={onNavigateSettings}
              className="text-xs font-semibold text-emerald-600 hover:underline"
            >
              Configure QR / UPI
            </button>
          </div>

          <div className="mt-4 flex flex-col items-center rounded-xl border border-slate-100 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-800/40">
            {settings?.adminQrImage ? (
              <img
                src={settings.adminQrImage}
                alt="Admin UPI QR"
                className="h-44 w-44 rounded-xl object-contain bg-white p-2 border border-slate-200"
              />
            ) : adminUpiQr ? (
              <img
                src={adminUpiQr}
                alt="Generated UPI QR"
                className="h-44 w-44 rounded-xl bg-white p-2 border border-slate-200"
              />
            ) : (
              <div className="flex h-44 w-44 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 text-slate-400 dark:border-slate-700">
                <QrCode className="h-10 w-10" />
                <span className="mt-2 text-xs">No UPI QR uploaded</span>
              </div>
            )}
            <p className="mt-3 font-mono text-xs font-bold text-[#0B1F3A] dark:text-white">
              {settings?.upiId || 'Set UPI ID in Settings'}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={shareAdminQr}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span>Share Payment QR</span>
              </button>
            </div>
          </div>
        </div>

        {/* UPI Supported Channels Summary */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Payment Channels &amp; Verification Summary
          </h3>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {UPI_APPS.map((app) => {
              const appTotal = payments
                .filter((p) => p.method === app && p.verified)
                .reduce((s, p) => s + p.amount, 0);
              return (
                <div
                  key={app}
                  className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {app}
                    </span>
                    <CreditCard className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                  <p className="mt-2 font-mono text-base font-bold tabular-nums text-[#0B1F3A] dark:text-white">
                    {formatCurrency(appTotal)}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <strong>Strict Verification Policy:</strong> Only verified payments affect member net balances. Confirm UTR / reference before marking a payment as Verified.
          </div>
        </div>
      </div>

      {/* Payment History Table */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Payment Records ({sortedPayments.length})
          </h3>
        </div>
        {sortedPayments.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No payments recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3 font-bold">Date &amp; ID</th>
                  <th className="px-4 py-3 font-bold">Member</th>
                  <th className="px-4 py-3 font-bold">Direction</th>
                  <th className="px-4 py-3 font-bold">Method &amp; Ref</th>
                  <th className="px-4 py-3 text-right font-bold">Amount</th>
                  <th className="px-4 py-3 font-bold">Verification</th>
                  <th className="px-4 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sortedPayments.map((p) => {
                  const m = memberMap.get(p.memberId);
                  return (
                    <tr key={p.paymentId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-mono">
                        <div className="font-semibold text-slate-900 dark:text-white">{p.date}</div>
                        <div className="text-[10px] text-slate-400">{p.paymentId}</div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                        {m?.fullName || p.memberId}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`font-semibold ${
                            p.direction === 'TO_MEMBER' ? 'text-[#0B1F3A] dark:text-blue-300' : 'text-emerald-600'
                          }`}
                        >
                          {p.direction === 'TO_MEMBER' ? 'Given to Member' : 'Received from Member'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold">{p.method}</div>
                        <div className="font-mono text-[11px] text-slate-500">{p.reference}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold tabular-nums">
                        {formatCurrency(p.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleVerify(p)}
                          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
                            p.verified
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                          }`}
                        >
                          {p.verified ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                          <span>{p.verified ? 'Verified' : 'Verify Now'}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(p)}
                          className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Payment Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              {t.recordPayment}
            </h3>
            <form onSubmit={handleSavePayment} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Member *
                </label>
                <select
                  required
                  value={memberId}
                  onChange={(e) => setMemberId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  {members.map((m) => (
                    <option key={m.memberId} value={m.memberId}>
                      {m.fullName} ({m.memberCode})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Direction
                  </label>
                  <select
                    value={direction}
                    onChange={(e) => setDirection(e.target.value as PaymentDirection)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="TO_MEMBER">Payment Given (To Member)</option>
                    <option value="FROM_MEMBER">Payment Received (From Member)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Method
                  </label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    {UPI_APPS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Amount (₹) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value || todayISO())}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Transaction Reference / UTR *
                </label>
                <input
                  type="text"
                  required
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="UPI UTR or Receipt No."
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <label className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-800">
                <input
                  type="checkbox"
                  checked={verified}
                  onChange={(e) => setVerified(e.target.checked)}
                  className="h-4 w-4 accent-emerald-600"
                />
                <span>I have verified this payment transaction in bank / UPI app</span>
              </label>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Notes
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={t.confirmDelete}
        message={`Delete payment record ${deleteTarget?.reference} (${deleteTarget ? formatCurrency(deleteTarget.amount) : ''})?`}
        confirmLabel="Delete"
        cancelLabel={t.cancel}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await deletePaymentTransaction(deleteTarget);
            onToast('Payment record deleted.');
            setDeleteTarget(null);
          } catch (err) {
            onToast(err instanceof Error ? err.message : 'Failed to delete payment', 'error');
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

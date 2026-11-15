import React, { useMemo, useState } from 'react';
import { Edit2, Plus, Trash2 } from 'lucide-react';
import {
  computeMemberFinancialSummary,
  formatCurrency,
  todayISO,
} from '../lib/accounting';
import {
  deleteAdvanceTransaction,
  saveAdvanceTransaction,
} from '../lib/firestoreApi';
import { TRANSLATIONS } from '../lib/i18n';
import type {
  AdvanceCategory,
  AdvanceTransaction,
  AdvanceTransactionType,
  AttendanceRecord,
  Language,
  Member,
  OvertimeRecord,
  PaymentMethod,
  PaymentTransaction,
} from '../types';
import { ConfirmDialog } from './ConfirmDialog';

interface AdvancesViewProps {
  lang: Language;
  members: Member[];
  attendance: AttendanceRecord[];
  overtime: OvertimeRecord[];
  advances: AdvanceTransaction[];
  payments: PaymentTransaction[];
  onToast: (msg: string, type?: 'success' | 'error') => void;
}

export const AdvancesView: React.FC<AdvancesViewProps> = ({
  lang,
  members,
  attendance,
  overtime,
  advances,
  payments,
  onToast,
}) => {
  const t = TRANSLATIONS[lang];
  const [filterMember, setFilterMember] = useState('all');
  const [filterCategory, setFilterCategory] = useState<'all' | AdvanceCategory>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdvanceTransaction | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdvanceTransaction | null>(null);

  // Form
  const [memberId, setMemberId] = useState('');
  const [category, setCategory] = useState<AdvanceCategory>('NORMAL');
  const [txType, setTxType] = useState<AdvanceTransactionType>('GIVEN');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState<PaymentMethod>('Cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  const memberMap = useMemo(() => new Map(members.map((m) => [m.memberId, m])), [members]);

  const memberBalances = useMemo(
    () => members.map((m) => computeMemberFinancialSummary(m, attendance, overtime, advances, payments)),
    [members, attendance, overtime, advances, payments]
  );

  const filteredAdvances = useMemo(() => {
    return advances
      .filter((a) => {
        if (filterMember !== 'all' && a.memberId !== filterMember) return false;
        if (filterCategory !== 'all' && a.category !== filterCategory) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [advances, filterMember, filterCategory]);

  const totals = useMemo(() => {
    let normalNet = 0;
    let cookingNet = 0;
    memberBalances.forEach((b) => {
      normalNet += b.normalAdvanceNet;
      cookingNet += b.cookingAdvanceNet;
    });
    return { normalNet, cookingNet, total: normalNet + cookingNet };
  }, [memberBalances]);

  const openModal = (presetType: AdvanceTransactionType, editItem?: AdvanceTransaction) => {
    if (editItem) {
      setEditing(editItem);
      setMemberId(editItem.memberId);
      setCategory(editItem.category);
      setTxType(editItem.transactionType);
      setAmount(String(editItem.amount));
      setDate(editItem.date);
      setMethod(editItem.paymentMethod);
      setReference(editItem.reference || '');
      setNotes(editItem.notes || '');
    } else {
      setEditing(null);
      setMemberId(members[0]?.memberId || '');
      setCategory('NORMAL');
      setTxType(presetType);
      setAmount('');
      setDate(todayISO());
      setMethod('Cash');
      setReference('');
      setNotes('');
    }
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetMember = memberMap.get(memberId);
    const numAmount = Number(amount);
    if (!targetMember) {
      onToast('Select a valid member.', 'error');
      return;
    }
    if (!numAmount || numAmount <= 0) {
      onToast('Amount must be greater than zero.', 'error');
      return;
    }

    setSaving(true);
    try {
      await saveAdvanceTransaction({
        member: targetMember,
        category,
        transactionType: txType,
        amount: numAmount,
        date,
        paymentMethod: method,
        reference,
        notes,
        existingId: editing?.advanceId,
      });
      onToast(editing ? 'Advance transaction updated.' : `${category} ${txType} recorded.`);
      setModalOpen(false);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to save advance', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
            {t.advances}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Separate tracking for Normal Advance and Cooking Advance · Never deducted twice
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={members.length === 0}
            onClick={() => openModal('GIVEN')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1F3A] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#132E54] disabled:opacity-50 min-h-[42px]"
          >
            <Plus className="h-4 w-4" />
            <span>{t.giveAdvance}</span>
          </button>
          <button
            type="button"
            disabled={members.length === 0}
            onClick={() => openModal('REPAYMENT')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 min-h-[42px]"
          >
            <Plus className="h-4 w-4" />
            <span>{t.recordRepayment}</span>
          </button>
        </div>
      </div>

      {/* Category Totals */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500">{t.normalAdvance} Net</p>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-[#0B1F3A] dark:text-white">
            {formatCurrency(totals.normalNet)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500">{t.cookingAdvance} Net</p>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-amber-600">
            {formatCurrency(totals.cookingNet)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500">{t.totalAdvance}</p>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-red-600">
            {formatCurrency(totals.total)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filterMember}
          onChange={(e) => setFilterMember(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900 dark:text-white min-h-[40px]"
        >
          <option value="all">All Members</option>
          {members.map((m) => (
            <option key={m.memberId} value={m.memberId}>
              {m.fullName} ({m.memberCode})
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
          {(['all', 'NORMAL', 'COOKING'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilterCategory(cat)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                filterCategory === cat
                  ? 'bg-[#0B1F3A] text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {cat === 'all' ? 'All Categories' : `${cat} ADVANCE`}
            </button>
          ))}
        </div>
      </div>

      {/* Transactions Table */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Advance Transaction History ({filteredAdvances.length})
          </h3>
        </div>
        {filteredAdvances.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No advance transactions found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3 font-bold">TX ID &amp; Date</th>
                  <th className="px-4 py-3 font-bold">Member</th>
                  <th className="px-4 py-3 font-bold">Category</th>
                  <th className="px-4 py-3 font-bold">Type</th>
                  <th className="px-4 py-3 font-bold">Method</th>
                  <th className="px-4 py-3 text-right font-bold">Amount</th>
                  <th className="px-4 py-3 font-bold">Notes</th>
                  <th className="px-4 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredAdvances.map((adv) => {
                  const m = memberMap.get(adv.memberId);
                  return (
                    <tr key={adv.advanceId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-mono">
                        <div className="font-semibold text-slate-900 dark:text-white">{adv.date}</div>
                        <div className="text-[10px] text-slate-400">{adv.advanceId}</div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                        {m?.fullName || adv.memberId}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {adv.category} ADVANCE
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`font-semibold ${
                            adv.transactionType === 'GIVEN' ? 'text-amber-600' : 'text-emerald-600'
                          }`}
                        >
                          {adv.transactionType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{adv.paymentMethod}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold tabular-nums">
                        {formatCurrency(adv.amount)}
                      </td>
                      <td className="px-4 py-3 max-w-[200px] truncate text-slate-500">
                        {adv.notes || '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openModal(adv.transactionType, adv)}
                            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(adv)}
                            className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Advance Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              {editing ? 'Edit Advance Transaction' : txType === 'GIVEN' ? t.giveAdvance : t.recordRepayment}
            </h3>
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Member *
                </label>
                <select
                  required
                  disabled={!!editing}
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
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as AdvanceCategory)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="NORMAL">NORMAL ADVANCE</option>
                    <option value="COOKING">COOKING ADVANCE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Type
                  </label>
                  <select
                    value={txType}
                    onChange={(e) => setTxType(e.target.value as AdvanceTransactionType)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="GIVEN">GIVEN</option>
                    <option value="REPAYMENT">REPAYMENT</option>
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
                    onChange={(e) => setDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Payment Method
                </label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="Cash">Cash</option>
                  <option value="PhonePe">PhonePe</option>
                  <option value="Google Pay">Google Pay</option>
                  <option value="Paytm">Paytm</option>
                  <option value="UPI">UPI</option>
                  <option value="Bank">Bank</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Notes
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional reason or bill note"
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
                  className="rounded-lg bg-[#0B1F3A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#132E54] disabled:opacity-50"
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
        message={`Delete advance transaction of ${deleteTarget ? formatCurrency(deleteTarget.amount) : ''}?`}
        confirmLabel="Delete"
        cancelLabel={t.cancel}
        onConfirm={async () => {
          if (deleteTarget) {
            await deleteAdvanceTransaction(deleteTarget);
            onToast('Advance transaction deleted.');
            setDeleteTarget(null);
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

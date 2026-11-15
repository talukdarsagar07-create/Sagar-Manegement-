import React, { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Send, Smartphone } from 'lucide-react';
import {
  computeMemberFinancialSummary,
  formatCurrency,
  getBalanceVisuals,
  getStandardWorkHours,
} from '../lib/accounting';
import { apiUrl, shouldUseBackendApi } from '../lib/apiClient';
import { auth } from '../lib/firebase';
import { createNotificationRecord } from '../lib/firestoreApi';
import {
  buildTemplateMessage,
  MessageTemplateType,
  TRANSLATIONS,
} from '../lib/i18n';
import type {
  AdvanceTransaction,
  AppSettings,
  AttendanceRecord,
  Language,
  Member,
  OvertimeRecord,
  PaymentTransaction,
} from '../types';
import { BalanceStatusBadge } from './BalanceStatusBadge';

interface AccountingMessagesViewProps {
  lang: Language;
  members: Member[];
  attendance: AttendanceRecord[];
  overtime: OvertimeRecord[];
  advances: AdvanceTransaction[];
  payments: PaymentTransaction[];
  settings: AppSettings | null;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}

const TEMPLATES: Array<{ id: MessageTemplateType; label: string }> = [
  { id: 'attendance', label: 'Attendance Report' },
  { id: 'salary', label: 'Salary Details' },
  { id: 'advance', label: 'Advance Details' },
  { id: 'reminder', label: 'Payment Reminder' },
  { id: 'balance', label: 'Pending Balance' },
  { id: 'confirmation', label: 'Payment Confirmation' },
];

export const AccountingMessagesView: React.FC<AccountingMessagesViewProps> = ({
  lang,
  members,
  attendance,
  overtime,
  advances,
  payments,
  settings,
  onToast,
}) => {
  const t = TRANSLATIONS[lang];
  const [selectedMemberId, setSelectedMemberId] = useState(members[0]?.memberId || '');
  const [templateType, setTemplateType] = useState<MessageTemplateType>('balance');
  const [msgLang, setMsgLang] = useState<Language>(lang);
  const [customMessage, setCustomMessage] = useState('');
  const [sendingSms, setSendingSms] = useState(false);

  const stdHours = getStandardWorkHours(settings?.standardWorkHours);

  const summaries = useMemo(
    () =>
      members.map((m) =>
        computeMemberFinancialSummary(
          m,
          attendance,
          overtime,
          advances,
          payments,
          undefined,
          stdHours
        )
      ),
    [members, attendance, overtime, advances, payments, stdHours]
  );

  const selectedSummary = useMemo(
    () => summaries.find((s) => s.member.memberId === selectedMemberId) || summaries[0] || null,
    [summaries, selectedMemberId]
  );

  useEffect(() => {
    if (!selectedMemberId && members[0]) {
      setSelectedMemberId(members[0].memberId);
    }
  }, [members, selectedMemberId]);

  useEffect(() => {
    if (!selectedSummary) return;
    setCustomMessage(
      buildTemplateMessage(templateType, msgLang, selectedSummary, {
        upiId: settings?.upiId,
      })
    );
  }, [selectedSummary, templateType, msgLang, settings?.upiId]);

  const handleSendWhatsApp = async () => {
    if (!selectedSummary) return;
    const phone = selectedSummary.member.phone.replace(/\D/g, '');
    const intlPhone = phone.length === 10 ? `91${phone}` : phone;
    const url = `https://wa.me/${intlPhone}?text=${encodeURIComponent(customMessage)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    await createNotificationRecord({
      member: selectedSummary.member,
      title: `WhatsApp: ${templateType.toUpperCase()}`,
      message: customMessage,
      type: templateType === 'attendance' ? 'attendance' : templateType === 'advance' ? 'advance' : templateType === 'salary' ? 'salary' : 'payment',
      channel: 'whatsapp',
    }).catch(() => {});
    onToast(`WhatsApp chat opened for ${selectedSummary.member.fullName}.`);
  };

  const handleSendSmsGateway = async () => {
    if (!selectedSummary || !auth.currentUser) return;
    setSendingSms(true);
    try {
      if (shouldUseBackendApi()) {
        const idToken = await auth.currentUser.getIdToken();
        const resp = await fetch(apiUrl('/api/notifications/sms'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            phone: selectedSummary.member.phone,
            message: customMessage,
            providerEndpoint: settings?.smsProviderEndpoint,
            senderId: settings?.smsSenderId,
          }),
        });
        const contentType = resp.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = (await resp.json()) as { ok?: boolean; error?: string };
          if (!resp.ok || !data.ok) {
            onToast(data.error || 'SMS gateway not configured. Use Open Phone SMS App.', 'error');
          } else {
            await createNotificationRecord({
              member: selectedSummary.member,
              title: `SMS: ${templateType.toUpperCase()}`,
              message: customMessage,
              type: 'system',
              channel: 'sms',
            }).catch(() => {});
            onToast(`SMS dispatched to ${selectedSummary.member.phone}.`);
          }
          return;
        }
      }

      if (settings?.smsProviderEndpoint) {
        const phoneDigits = selectedSummary.member.phone.replace(/\D/g, '').slice(-10);
        const smsResp = await fetch(settings.smsProviderEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: phoneDigits,
            message: customMessage,
            senderId: settings.smsSenderId || 'SAGARM',
          }),
        });
        if (!smsResp.ok) {
          throw new Error(`SMS Gateway error (${smsResp.status}). Use Open Phone SMS App.`);
        }
        await createNotificationRecord({
          member: selectedSummary.member,
          title: `SMS: ${templateType.toUpperCase()}`,
          message: customMessage,
          type: 'system',
          channel: 'sms',
        }).catch(() => {});
        onToast(`SMS dispatched to ${selectedSummary.member.phone}.`);
      } else {
        handleDeviceSms();
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'SMS send failed. Use Open Phone SMS App.', 'error');
    } finally {
      setSendingSms(false);
    }
  };

  const handleDeviceSms = () => {
    if (!selectedSummary) return;
    const phone = selectedSummary.member.phone.replace(/\D/g, '');
    window.location.href = `sms:${phone}?body=${encodeURIComponent(customMessage)}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
          {t.accounting}
        </h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Complete member-by-member financial accounting and bilingual WhatsApp / SMS communication
        </p>
      </div>

      {/* Complete Financial Ledger Table */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Complete Worker Financial Ledger
          </h3>
        </div>
        {summaries.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No member records available.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3 font-bold">Member</th>
                  <th className="px-3 py-3 text-right font-bold">Salary Earned</th>
                  <th className="px-3 py-3 text-right font-bold">OT Earned</th>
                  <th className="px-3 py-3 text-right font-bold">Normal Adv</th>
                  <th className="px-3 py-3 text-right font-bold">Cooking Adv</th>
                  <th className="px-3 py-3 text-right font-bold">Total Adv</th>
                  <th className="px-3 py-3 text-right font-bold">Paid Given</th>
                  <th className="px-3 py-3 text-right font-bold">Paid Recv</th>
                  <th className="px-3 py-3 text-right font-bold">Prev Bal</th>
                  <th className="px-4 py-3 text-right font-bold">Final Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {summaries.map((s) => {
                  const balVisual = getBalanceVisuals(s.balanceDirection);
                  return (
                    <tr
                      key={s.member.memberId}
                      onClick={() => setSelectedMemberId(s.member.memberId)}
                      className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                        selectedSummary?.member.memberId === s.member.memberId ? 'bg-slate-50 dark:bg-slate-800/40' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900 dark:text-white">{s.member.fullName}</p>
                        <p className="text-[11px] text-slate-500">{s.member.memberCode}</p>
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">{formatCurrency(s.totalSalaryEarned)}</td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">{formatCurrency(s.totalOtEarned)}</td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-amber-600">{formatCurrency(s.normalAdvanceNet)}</td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-amber-600">{formatCurrency(s.cookingAdvanceNet)}</td>
                      <td className="px-3 py-3 text-right font-mono font-semibold tabular-nums text-amber-700">{formatCurrency(s.totalAdvanceOutstanding)}</td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">{formatCurrency(s.salaryPaymentsGiven)}</td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">{formatCurrency(s.salaryPaymentsReceived)}</td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">{formatCurrency(s.previousBalance)}</td>
                      <td className="px-4 py-3 text-right">
                        <p className={`font-mono font-bold tabular-nums ${balVisual.amountTextClass}`}>
                          {formatCurrency(s.absBalance)}
                        </p>
                        <div className="mt-1 flex justify-end">
                          <BalanceStatusBadge direction={s.balanceDirection} lang={lang} />
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

      {/* WhatsApp & SMS Composer */}
      {selectedSummary && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  WhatsApp &amp; SMS Dispatch — {selectedSummary.member.fullName}
                </h3>
                <BalanceStatusBadge direction={selectedSummary.balanceDirection} lang={lang} />
              </div>
              <p className="text-xs text-slate-500">
                Mobile: {selectedSummary.member.phone} · Closing Balance:{' '}
                <span
                  className={`font-mono font-bold ${
                    getBalanceVisuals(selectedSummary.balanceDirection).amountTextClass
                  }`}
                >
                  {formatCurrency(selectedSummary.absBalance)}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedSummary.member.memberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {members.map((m) => (
                  <option key={m.memberId} value={m.memberId}>
                    {m.fullName} ({m.phone})
                  </option>
                ))}
              </select>
              <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setMsgLang('en')}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                    msgLang === 'en' ? 'bg-[#0B1F3A] text-white' : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => setMsgLang('bn')}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                    msgLang === 'bn' ? 'bg-[#0B1F3A] text-white' : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  বাংলা
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => setTemplateType(tpl.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  templateType === tpl.id
                    ? 'bg-emerald-600 text-white'
                    : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {tpl.label}
              </button>
            ))}
          </div>

          <textarea
            rows={6}
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm leading-relaxed outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSendWhatsApp}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 min-h-[42px]"
            >
              <MessageCircle className="h-4 w-4" />
              <span>{t.sendWhatsApp}</span>
            </button>
            <button
              type="button"
              disabled={sendingSms}
              onClick={handleSendSmsGateway}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0B1F3A] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#132E54] disabled:opacity-50 min-h-[42px]"
            >
              <Send className="h-4 w-4" />
              <span>{sendingSms ? 'Sending...' : 'Send via SMS Gateway'}</span>
            </button>
            <button
              type="button"
              onClick={handleDeviceSms}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 min-h-[42px]"
            >
              <Smartphone className="h-4 w-4" />
              <span>Open Phone SMS App</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

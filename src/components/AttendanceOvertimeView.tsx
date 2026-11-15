import React, { useMemo, useState } from 'react';
import { Calendar, CheckCircle2, Clock, XCircle } from 'lucide-react';
import {
  formatCurrency,
  getMonthRange,
  getWeekRange,
  safeNumber,
  todayISO,
} from '../lib/accounting';
import { saveOvertimeRecord, upsertAttendanceRecord } from '../lib/firestoreApi';
import { TRANSLATIONS } from '../lib/i18n';
import type {
  AppSettings,
  AttendanceRecord,
  Language,
  Member,
  OvertimeRecord,
} from '../types';

interface AttendanceOvertimeViewProps {
  lang: Language;
  members: Member[];
  attendance: AttendanceRecord[];
  overtime: OvertimeRecord[];
  settings: AppSettings | null;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}

export const AttendanceOvertimeView: React.FC<AttendanceOvertimeViewProps> = ({
  lang,
  members,
  attendance,
  overtime,
  settings,
  onToast,
}) => {
  const t = TRANSLATIONS[lang];
  const today = todayISO();
  const [mode, setMode] = useState<'weekly' | 'monthly'>('weekly');
  const [anchorDate, setAnchorDate] = useState(today);
  const [selectedMonth, setSelectedMonth] = useState(today.slice(0, 7)); // YYYY-MM
  const [bulkDate, setBulkDate] = useState(today);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Overtime Modal
  const [otTarget, setOtTarget] = useState<{ member: Member; date: string } | null>(null);
  const [otHours, setOtHours] = useState('2');
  const [otRate, setOtRate] = useState('80');
  const [otNotes, setOtNotes] = useState('');

  const standardHours = settings?.standardWorkHours || 8;

  const activeRange = useMemo(() => {
    if (mode === 'weekly') {
      return getWeekRange(anchorDate);
    }
    const [yStr, mStr] = selectedMonth.split('-');
    const year = Number(yStr) || new Date().getFullYear();
    const month0 = (Number(mStr) || 1) - 1;
    return getMonthRange(year, month0);
  }, [mode, anchorDate, selectedMonth]);

  const activeMembers = useMemo(
    () => members.filter((m) => m.status === 'active'),
    [members]
  );

  const attendanceMap = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    attendance.forEach((rec) => {
      map.set(`${rec.memberId}_${rec.date}`, rec);
    });
    return map;
  }, [attendance]);

  const otMap = useMemo(() => {
    const map = new Map<string, OvertimeRecord>();
    overtime.forEach((rec) => {
      map.set(`${rec.memberId}_${rec.date}`, rec);
    });
    return map;
  }, [overtime]);

  const toggleCell = async (member: Member, date: string) => {
    const key = `${member.memberId}_${date}`;
    const existing = attendanceMap.get(key);
    const nextStatus: 'P' | 'A' = existing?.status === 'P' ? 'A' : 'P';
    setSavingKey(key);
    try {
      await upsertAttendanceRecord({
        member,
        date,
        status: nextStatus,
        workingHours: nextStatus === 'P' ? standardHours : 0,
        otHours: existing?.otHours || 0,
        existing,
      });
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to update attendance', 'error');
    } finally {
      setSavingKey(null);
    }
  };

  const handleBulkMark = async (status: 'P' | 'A') => {
    if (activeMembers.length === 0) return;
    setSavingKey('bulk');
    try {
      await Promise.all(
        activeMembers.map((member) => {
          const existing = attendanceMap.get(`${member.memberId}_${bulkDate}`);
          return upsertAttendanceRecord({
            member,
            date: bulkDate,
            status,
            workingHours: status === 'P' ? standardHours : 0,
            otHours: existing?.otHours || 0,
            existing,
          });
        })
      );
      onToast(`Marked all ${activeMembers.length} active workers as ${status === 'P' ? 'Present' : 'Absent'} for ${bulkDate}.`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Bulk update failed', 'error');
    } finally {
      setSavingKey(null);
    }
  };

  const openOtModal = (member: Member, date: string) => {
    const existingOt = otMap.get(`${member.memberId}_${date}`);
    setOtTarget({ member, date });
    setOtHours(String(existingOt?.hours ?? 2));
    setOtRate(String(existingOt?.rate ?? member.otRate ?? settings?.defaultOtRate ?? 80));
    setOtNotes(existingOt?.notes || '');
  };

  const handleSaveOt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otTarget) return;
    setSavingKey('ot');
    try {
      await saveOvertimeRecord({
        member: otTarget.member,
        date: otTarget.date,
        hours: Number(otHours) || 0,
        rate: Number(otRate) || 0,
        notes: otNotes,
        existingId: otMap.get(`${otTarget.member.memberId}_${otTarget.date}`)?.recordId,
      });
      onToast(`Overtime saved for ${otTarget.member.fullName}.`);
      setOtTarget(null);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to save overtime', 'error');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Mode Switch */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
            {t.attendance} &amp; Overtime
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Standard shift: {standardHours}h/day · Period: {activeRange.startDate} to {activeRange.endDate} ({activeRange.days.length} days)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setMode('weekly')}
              className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                mode === 'weekly'
                  ? 'bg-[#0B1F3A] text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              {t.weeklyMode}
            </button>
            <button
              type="button"
              onClick={() => setMode('monthly')}
              className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                mode === 'monthly'
                  ? 'bg-[#0B1F3A] text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              {t.monthlyMode}
            </button>
          </div>

          {mode === 'weekly' ? (
            <input
              type="date"
              value={anchorDate}
              onChange={(e) => setAnchorDate(e.target.value || today)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900 dark:text-white min-h-[40px]"
            />
          ) : (
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value || today.slice(0, 7))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900 dark:text-white min-h-[40px]"
            />
          )}
        </div>
      </div>

      {/* Bulk Daily Attendance Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
          <Calendar className="h-4 w-4 text-[#0B1F3A] dark:text-emerald-400" />
          <span>Quick Bulk Mark for Date:</span>
          <input
            type="date"
            value={bulkDate}
            onChange={(e) => setBulkDate(e.target.value || today)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={savingKey === 'bulk'}
            onClick={() => handleBulkMark('P')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 min-h-[38px]"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Mark All Present (P)</span>
          </button>
          <button
            type="button"
            disabled={savingKey === 'bulk'}
            onClick={() => handleBulkMark('A')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300 min-h-[38px]"
          >
            <XCircle className="h-3.5 w-3.5" />
            <span>Mark All Absent (A)</span>
          </button>
        </div>
      </div>

      {/* Attendance Matrix Table */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {activeMembers.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No active members found. Add members first to mark attendance.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                <tr>
                  <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 font-bold dark:bg-slate-900 min-w-[170px]">
                    Worker
                  </th>
                  {activeRange.days.map((day) => (
                    <th key={day} className="px-1.5 py-3 text-center font-mono min-w-[44px]">
                      <div>{day.slice(8)}</div>
                      <div className="text-[10px] font-normal text-slate-400">
                        {new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { weekday: 'narrow' })}
                      </div>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-right font-bold">P / A</th>
                  <th className="px-3 py-3 text-right font-bold">%</th>
                  <th className="px-3 py-3 text-right font-bold">OT Hrs</th>
                  <th className="px-4 py-3 text-right font-bold">Combined Pay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {activeMembers.map((m) => {
                  let presentDays = 0;
                  let absentDays = 0;
                  let totalOtHours = 0;
                  let totalOtPay = 0;

                  activeRange.days.forEach((day) => {
                    const rec = attendanceMap.get(`${m.memberId}_${day}`);
                    if (rec?.status === 'P') presentDays += 1;
                    if (rec?.status === 'A') absentDays += 1;
                    const ot = otMap.get(`${m.memberId}_${day}`);
                    if (ot) {
                      totalOtHours += safeNumber(ot.hours);
                      totalOtPay += safeNumber(ot.amount);
                    } else if (rec && safeNumber(rec.otHours) > 0) {
                      const hrs = safeNumber(rec.otHours);
                      totalOtHours += hrs;
                      totalOtPay += hrs * safeNumber(m.otRate);
                    }
                  });

                  const marked = presentDays + absentDays;
                  const pct = marked > 0 ? Math.round((presentDays / marked) * 100) : 0;
                  const normalSalary = presentDays * safeNumber(m.dailySalaryRate);
                  const combined = normalSalary + totalOtPay;

                  return (
                    <tr key={m.memberId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="sticky left-0 z-10 bg-white px-4 py-2.5 dark:bg-slate-900 border-r border-slate-100 dark:border-slate-800">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900 dark:text-white">
                              {m.fullName}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {formatCurrency(m.dailySalaryRate)}/d · OT {formatCurrency(m.otRate)}/h
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => openOtModal(m, bulkDate)}
                            title="Log Overtime"
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 shrink-0"
                          >
                            <Clock className="h-3 w-3 text-emerald-600" />
                            <span>OT</span>
                          </button>
                        </div>
                      </td>
                      {activeRange.days.map((day) => {
                        const key = `${m.memberId}_${day}`;
                        const rec = attendanceMap.get(key);
                        const ot = otMap.get(key);
                        const status = rec?.status;
                        return (
                          <td key={day} className="px-1 py-2 text-center">
                            <button
                              type="button"
                              disabled={savingKey === key}
                              onClick={() => toggleCell(m, day)}
                              className={`relative inline-flex h-9 w-9 items-center justify-center rounded-lg font-mono text-xs font-bold transition ${
                                status === 'P'
                                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                  : status === 'A'
                                    ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-950/60 dark:text-red-300'
                                    : 'border border-slate-200 bg-slate-50 text-slate-400 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800'
                              }`}
                            >
                              {status || '·'}
                              {ot && ot.hours > 0 && (
                                <span className="absolute -right-1 -top-1 rounded bg-[#0B1F3A] px-1 text-[9px] text-white">
                                  +{ot.hours}
                                </span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                        <span className="font-bold text-emerald-600">{presentDays}</span>
                        {' / '}
                        <span className="text-red-600">{absentDays}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {pct}%
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {totalOtHours}h
                      </td>
                      <td className="px-4 py-2 text-right font-mono font-bold tabular-nums text-[#0B1F3A] dark:text-white whitespace-nowrap">
                        {formatCurrency(combined)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Overtime Entry Modal */}
      {otTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Overtime Entry — {otTarget.member.fullName}
            </h3>
            <form onSubmit={handleSaveOt} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Date
                </label>
                <input
                  type="date"
                  required
                  value={otTarget.date}
                  onChange={(e) => setOtTarget({ ...otTarget, date: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    OT Hours
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="24"
                    step="0.5"
                    required
                    value={otHours}
                    onChange={(e) => setOtHours(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    OT Rate (₹/hr)
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
              </div>
              <div className="rounded-xl bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                OT Amount: {formatCurrency((Number(otHours) || 0) * (Number(otRate) || 0))}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Notes
                </label>
                <input
                  type="text"
                  value={otNotes}
                  onChange={(e) => setOtNotes(e.target.value)}
                  placeholder="Optional reason or task"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOtTarget(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingKey === 'ot'}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  Save OT
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

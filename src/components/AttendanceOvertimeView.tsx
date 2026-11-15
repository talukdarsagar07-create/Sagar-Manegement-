import React, { useMemo, useState } from 'react';
import { Calendar, CheckCircle2, Clock, SlidersHorizontal, XCircle } from 'lucide-react';
import {
  formatCurrency,
  formatHoursShort,
  getAttendanceCode,
  getAttendanceDayFactor,
  getMonthRange,
  getStandardWorkHours,
  getWeekRange,
  isPartialAttendance,
  safeNumber,
  todayISO,
} from '../lib/accounting';
import {
  deleteOvertimeRecord,
  saveOvertimeRecord,
  upsertAttendanceRecord,
} from '../lib/firestoreApi';
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
  const [tapAction, setTapAction] = useState<'toggle' | 'hours'>('toggle');
  const [anchorDate, setAnchorDate] = useState(today);
  const [selectedMonth, setSelectedMonth] = useState(today.slice(0, 7)); // YYYY-MM
  const [bulkDate, setBulkDate] = useState(today);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Unified Daily Work Hours (P1, P2, P) & Overtime Modal
  const [cellTarget, setCellTarget] = useState<{ member: Member; date: string } | null>(null);
  const [editStatus, setEditStatus] = useState<'P' | 'A'>('P');
  const [editWorkHours, setEditWorkHours] = useState('8');
  const [editOtHours, setEditOtHours] = useState('0');
  const [editOtRate, setEditOtRate] = useState('80');
  const [editNotes, setEditNotes] = useState('');

  const standardHours = getStandardWorkHours(settings?.standardWorkHours);

  const partialHourPresets = useMemo(() => {
    const base = [1, 2, 3, 4, 6].filter((h) => h < standardHours);
    if (base.length === 0 && standardHours > 1) {
      return [Math.max(1, Math.floor(standardHours / 2))];
    }
    return base;
  }, [standardHours]);

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

  const openCellEditor = (member: Member, date: string) => {
    const key = `${member.memberId}_${date}`;
    const existingAtt = attendanceMap.get(key);
    const existingOt = otMap.get(key);

    const status: 'P' | 'A' = existingAtt?.status === 'A' ? 'A' : 'P';
    const workHrs =
      existingAtt?.status === 'A'
        ? 0
        : existingAtt
          ? safeNumber(existingAtt.workingHours, standardHours)
          : standardHours;
    const otHrs = existingOt
      ? safeNumber(existingOt.hours, 0)
      : safeNumber(existingAtt?.otHours, 0);

    setCellTarget({ member, date });
    setEditStatus(status);
    setEditWorkHours(String(workHrs));
    setEditOtHours(String(otHrs));
    setEditOtRate(String(existingOt?.rate ?? member.otRate ?? settings?.defaultOtRate ?? 80));
    setEditNotes(existingOt?.notes || existingAtt?.notes || '');
  };

  const toggleCell = async (member: Member, date: string) => {
    if (tapAction === 'hours') {
      openCellEditor(member, date);
      return;
    }

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
      onToast(
        `Marked all ${activeMembers.length} active workers as ${
          status === 'P' ? `Present (${standardHours}h)` : 'Absent'
        } for ${bulkDate}.`
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Bulk update failed', 'error');
    } finally {
      setSavingKey(null);
    }
  };

  const handleSaveCellEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cellTarget) return;

    const parsedWork = Math.max(0, Math.min(24, Number(editWorkHours) || 0));
    const parsedOt = Math.max(0, Math.min(24, Number(editOtHours) || 0));
    const parsedOtRate = Math.max(0, Number(editOtRate) || 0);

    // If marked Absent or 0 work hours with Absent selected
    const finalStatus: 'P' | 'A' = editStatus === 'A' || parsedWork <= 0 ? 'A' : 'P';
    const finalWorkHours = finalStatus === 'P' ? parsedWork : 0;

    // If user typed work hours greater than standardHours without splitting OT, keep workHours capped or split?
    // Pro-rata day pay caps regular work at 1 full day, so keep exact hours entered on record for visibility while salary factor caps at 1.0, OR split if user clicks auto-split.
    const key = `${cellTarget.member.memberId}_${cellTarget.date}`;
    const existingAtt = attendanceMap.get(key);
    const existingOt = otMap.get(key);

    setSavingKey('cell_modal');
    try {
      await upsertAttendanceRecord({
        member: cellTarget.member,
        date: cellTarget.date,
        status: finalStatus,
        workingHours: finalWorkHours,
        otHours: parsedOt,
        notes: editNotes,
        existing: existingAtt,
      });

      if (parsedOt > 0) {
        await saveOvertimeRecord({
          member: cellTarget.member,
          date: cellTarget.date,
          hours: parsedOt,
          rate: parsedOtRate,
          notes: editNotes,
          existingId: existingOt?.recordId,
        });
      } else if (existingOt) {
        await deleteOvertimeRecord(existingOt);
      }

      const code = getAttendanceCode(
        { status: finalStatus, workingHours: finalWorkHours },
        standardHours
      );
      onToast(
        `Saved ${cellTarget.member.fullName} (${cellTarget.date}): ${code}${
          parsedOt > 0 ? ` + ${formatHoursShort(parsedOt)}h OT` : ''
        }`
      );
      setCellTarget(null);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to save attendance hours', 'error');
    } finally {
      setSavingKey(null);
    }
  };

  // Live preview calculations inside modal
  const modalWorkNum = Math.max(0, Math.min(24, Number(editWorkHours) || 0));
  const modalOtNum = Math.max(0, Math.min(24, Number(editOtHours) || 0));
  const modalOtRateNum = Math.max(0, Number(editOtRate) || 0);
  const modalFinalStatus: 'P' | 'A' = editStatus === 'A' || modalWorkNum <= 0 ? 'A' : 'P';
  const modalPreviewCode = getAttendanceCode(
    { status: modalFinalStatus, workingHours: modalFinalStatus === 'P' ? modalWorkNum : 0 },
    standardHours
  );
  const modalDayFactor = getAttendanceDayFactor(
    { status: modalFinalStatus, workingHours: modalFinalStatus === 'P' ? modalWorkNum : 0 },
    standardHours
  );
  const modalBaseWage = cellTarget
    ? Math.round(modalDayFactor * safeNumber(cellTarget.member.dailySalaryRate) * 100) / 100
    : 0;
  const modalOtWage = Math.round(modalOtNum * modalOtRateNum * 100) / 100;
  const modalTotalWage = Math.round((modalBaseWage + modalOtWage) * 100) / 100;

  return (
    <div className="space-y-6">
      {/* Header & Mode Switch */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
            {t.attendance} &amp; Overtime
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Standard shift: {standardHours}h/day · Partial hours show as P1, P2, etc. · Period: {activeRange.startDate} to {activeRange.endDate} ({activeRange.days.length} days)
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

      {/* Bulk Daily Attendance + Cell Tap Mode Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
          <Calendar className="h-4 w-4 text-[#0B1F3A] dark:text-emerald-400" />
          <span>Quick Bulk Date:</span>
          <input
            type="date"
            value={bulkDate}
            onChange={(e) => setBulkDate(e.target.value || today)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Cell Tap Action Mode Switch */}
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setTapAction('toggle')}
              className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition ${
                tapAction === 'toggle'
                  ? 'bg-[#0B1F3A] text-white'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Tap: Quick P/A
            </button>
            <button
              type="button"
              onClick={() => setTapAction('hours')}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition ${
                tapAction === 'hours'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <SlidersHorizontal className="h-3 w-3" />
              <span>Tap: Hours (P1, P2, OT)</span>
            </button>
          </div>

          <button
            type="button"
            disabled={savingKey === 'bulk'}
            onClick={() => handleBulkMark('P')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 min-h-[38px]"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Mark All P ({standardHours}h)</span>
          </button>
          <button
            type="button"
            disabled={savingKey === 'bulk'}
            onClick={() => handleBulkMark('A')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300 min-h-[38px]"
          >
            <XCircle className="h-3.5 w-3.5" />
            <span>Mark All A</span>
          </button>
        </div>
      </div>

      {/* Attendance Legend */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex h-5 w-6 items-center justify-center rounded bg-emerald-600 font-mono text-[10px] font-bold text-white">P</span>
          Full Day ({standardHours}h)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex h-5 w-7 items-center justify-center rounded bg-sky-600 font-mono text-[10px] font-bold text-white">P2</span>
          Partial Hours (Pro-rata Salary)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex h-5 w-6 items-center justify-center rounded bg-red-100 font-mono text-[10px] font-bold text-red-700 dark:bg-red-950/60 dark:text-red-300">A</span>
          Absent (0h)
        </span>
        <span className="text-slate-400">· Switch to &ldquo;Tap: Hours (P1, P2, OT)&rdquo; or right-click any cell to enter custom work hours &amp; overtime.</span>
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
                  <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 font-bold dark:bg-slate-900 min-w-[180px]">
                    Worker
                  </th>
                  {activeRange.days.map((day) => (
                    <th key={day} className="px-1.5 py-3 text-center font-mono min-w-[46px]">
                      <div>{day.slice(8)}</div>
                      <div className="text-[10px] font-normal text-slate-400">
                        {new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { weekday: 'narrow' })}
                      </div>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-right font-bold whitespace-nowrap">P (Eq) / A</th>
                  <th className="px-3 py-3 text-right font-bold">%</th>
                  <th className="px-3 py-3 text-right font-bold">OT Hrs</th>
                  <th className="px-4 py-3 text-right font-bold">Combined Pay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {activeMembers.map((m) => {
                  let rawPresentDays = 0;
                  let absentDays = 0;
                  let markedDays = 0;
                  let totalWorkHours = 0;
                  let totalOtHours = 0;
                  let totalOtPay = 0;

                  activeRange.days.forEach((day) => {
                    const rec = attendanceMap.get(`${m.memberId}_${day}`);
                    if (rec) {
                      markedDays += 1;
                      const factor = getAttendanceDayFactor(rec, standardHours);
                      rawPresentDays += factor;
                      if (rec.status === 'P') {
                        totalWorkHours += safeNumber(rec.workingHours, standardHours);
                      }
                      if (rec.status === 'A' || (rec.status === 'P' && factor === 0)) {
                        absentDays += 1;
                      }
                    }

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

                  const presentEq = Math.round(rawPresentDays * 100) / 100;
                  const pct = markedDays > 0 ? Math.min(100, Math.round((rawPresentDays / markedDays) * 100)) : 0;
                  const normalSalary = Math.round(rawPresentDays * safeNumber(m.dailySalaryRate) * 100) / 100;
                  const combined = Math.round((normalSalary + totalOtPay) * 100) / 100;

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
                            onClick={() => openCellEditor(m, bulkDate)}
                            title="Edit Work Hours (P1/P2) & Overtime"
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 shrink-0"
                          >
                            <Clock className="h-3 w-3 text-emerald-600" />
                            <span>Hrs/OT</span>
                          </button>
                        </div>
                      </td>
                      {activeRange.days.map((day) => {
                        const key = `${m.memberId}_${day}`;
                        const rec = attendanceMap.get(key);
                        const ot = otMap.get(key);
                        const otHoursVal = ot ? safeNumber(ot.hours, 0) : safeNumber(rec?.otHours, 0);
                        const code = getAttendanceCode(rec, standardHours);
                        const partial = isPartialAttendance(rec, standardHours);

                        return (
                          <td key={day} className="px-1 py-2 text-center">
                            <button
                              type="button"
                              disabled={savingKey === key}
                              onClick={() => toggleCell(m, day)}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                openCellEditor(m, day);
                              }}
                              title={`${m.fullName} (${day}): ${
                                rec ? `${code} · ${safeNumber(rec.workingHours, standardHours)}h work` : 'Unmarked'
                              }${otHoursVal > 0 ? ` + ${otHoursVal}h OT` : ''}`}
                              className={`relative inline-flex h-9 min-w-[36px] px-1 items-center justify-center rounded-lg font-mono text-[11px] font-bold transition ${
                                partial
                                  ? 'bg-sky-600 text-white hover:bg-sky-700'
                                  : code === 'P'
                                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                    : code === 'A'
                                      ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-950/60 dark:text-red-300'
                                      : 'border border-slate-200 bg-slate-50 text-slate-400 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800'
                              }`}
                            >
                              {code}
                              {otHoursVal > 0 && (
                                <span className="absolute -right-1 -top-1 rounded bg-[#0B1F3A] px-1 text-[9px] text-white">
                                  +{formatHoursShort(otHoursVal)}
                                </span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                        <div>
                          <span className="font-bold text-emerald-600">{presentEq}</span>
                          {' / '}
                          <span className="text-red-600">{absentDays}</span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {formatHoursShort(totalWorkHours)}h work
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {pct}%
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {formatHoursShort(totalOtHours)}h
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

      {/* Unified Work Hours (P / P1 / P2 / A) & Overtime Modal */}
      {cellTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="my-6 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Hours &amp; Overtime — {cellTarget.member.fullName}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Daily Rate: {formatCurrency(cellTarget.member.dailySalaryRate)} / {standardHours}h shift (
              {formatCurrency(safeNumber(cellTarget.member.dailySalaryRate) / standardHours)}/hr)
            </p>

            <form onSubmit={handleSaveCellEntry} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Date
                </label>
                <input
                  type="date"
                  required
                  value={cellTarget.date}
                  onChange={(e) => {
                    const nextDate = e.target.value || today;
                    openCellEditor(cellTarget.member, nextDate);
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              {/* Quick Attendance & Partial-Hour Buttons */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Quick Select Attendance / Partial Hours
                </label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEditStatus('P');
                      setEditWorkHours(String(standardHours));
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                      editStatus === 'P' && Number(editWorkHours) >= standardHours
                        ? 'bg-emerald-600 text-white'
                        : 'border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    Full P ({standardHours}h)
                  </button>

                  {partialHourPresets.map((hrs) => (
                    <button
                      key={hrs}
                      type="button"
                      onClick={() => {
                        setEditStatus('P');
                        setEditWorkHours(String(hrs));
                      }}
                      className={`rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold transition ${
                        editStatus === 'P' && Number(editWorkHours) === hrs
                          ? 'bg-sky-600 text-white'
                          : 'border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                      }`}
                    >
                      P{hrs} ({hrs}h)
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => {
                      setEditStatus('A');
                      setEditWorkHours('0');
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                      editStatus === 'A' || Number(editWorkHours) <= 0
                        ? 'bg-red-600 text-white'
                        : 'border border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300'
                    }`}
                  >
                    Absent (A)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Work Hrs
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="24"
                    step="0.5"
                    required
                    value={editWorkHours}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditWorkHours(val);
                      setEditStatus((Number(val) || 0) > 0 ? 'P' : 'A');
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
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
                    value={editOtHours}
                    onChange={(e) => setEditOtHours(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    OT ₹/hr
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={editOtRate}
                    onChange={(e) => setEditOtRate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              {modalWorkNum > standardHours && (
                <button
                  type="button"
                  onClick={() => {
                    const extraOt = Math.round((modalWorkNum - standardHours) * 100) / 100;
                    setEditWorkHours(String(standardHours));
                    setEditOtHours(String(Math.round((modalOtNum + extraOt) * 100) / 100));
                  }}
                  className="w-full rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-left text-[11px] font-semibold text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
                >
                  Work hours exceed {standardHours}h shift. Tap to split extra{' '}
                  {formatHoursShort(modalWorkNum - standardHours)}h into Overtime (OT).
                </button>
              )}

              {/* Live Pay & Code Preview */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-800/50">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">
                    Recorded Code:
                  </span>
                  <span
                    className={`rounded-md px-2 py-0.5 font-mono font-bold ${
                      modalPreviewCode === 'A'
                        ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                        : modalPreviewCode === 'P'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-sky-600 text-white'
                    }`}
                  >
                    {modalPreviewCode} ({Math.round(modalDayFactor * 100) / 100}d)
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-slate-600 dark:text-slate-300">
                  <span>Base Wage ({formatHoursShort(modalFinalStatus === 'P' ? Math.min(modalWorkNum, standardHours) : 0)}h/{standardHours}h):</span>
                  <span className="font-mono font-semibold">{formatCurrency(modalBaseWage)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-slate-600 dark:text-slate-300">
                  <span>OT Wage ({formatHoursShort(modalOtNum)}h × {formatCurrency(modalOtRateNum)}):</span>
                  <span className="font-mono font-semibold">{formatCurrency(modalOtWage)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 font-bold text-[#0B1F3A] dark:border-slate-700 dark:text-white">
                  <span>Day Total:</span>
                  <span className="font-mono">{formatCurrency(modalTotalWage)}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Notes
                </label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Optional half-day / task / OT note"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCellTarget(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingKey === 'cell_modal'}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {savingKey === 'cell_modal' ? 'Saving...' : 'Save Attendance & OT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

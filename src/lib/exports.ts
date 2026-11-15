import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import logoUrl from '../assets/images/sagar_management_logo_1794727716847.jpg';
import type { SalarySlip } from '../types';

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const resp = await fetch(logoUrl);
    const blob = await resp.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function pdfCurrency(val: number): string {
  const safe = Number.isFinite(val) ? val : 0;
  return `INR ${safe.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function buildSalarySlipPDF(slip: SalarySlip): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const logoData = await loadLogoDataUrl();

  // Header band (Navy #0B1F3A)
  doc.setFillColor(11, 31, 58);
  doc.rect(0, 0, 210, 38, 'F');

  // Accent bar (Green #16A34A)
  doc.setFillColor(22, 163, 74);
  doc.rect(0, 38, 210, 2.5, 'F');

  if (logoData) {
    doc.addImage(logoData, 'JPEG', 14, 7, 24, 24);
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('SAGAR MANAGEMENT', 44, 17);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(186, 210, 235);
  doc.text('SMART ATTENDANCE • SALARY • WORKER MANAGEMENT', 44, 23);
  doc.text(`SALARY SLIP ID: ${slip.slipId}`, 44, 29);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text('SALARY SLIP', 196, 17, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(slip.periodLabel, 196, 24, { align: 'right' });
  doc.text(`${slip.startDate} to ${slip.endDate}`, 196, 30, { align: 'right' });

  // Member Details Box
  doc.setTextColor(15, 23, 42);
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, 48, 182, 28, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('WORKER INFORMATION', 19, 55);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Member Name: ${slip.memberName}`, 19, 62);
  doc.text(`Member ID: ${slip.memberCode}`, 19, 69);
  doc.text(`Mobile Number: ${slip.memberPhone}`, 110, 62);
  doc.text(`Salary Period: ${slip.startDate} — ${slip.endDate}`, 110, 69);

  // Attendance & Work Table
  autoTable(doc, {
    startY: 82,
    head: [['ATTENDANCE & WORK METRICS', 'VALUE', 'RATE', 'AMOUNT']],
    body: [
      ['Present Days', `${slip.presentDays} Days`, pdfCurrency(slip.dailyRate) + ' / day', pdfCurrency(slip.baseSalary)],
      ['Absent Days', `${slip.absentDays} Days`, '—', '—'],
      ['Standard Working Hours', `${slip.workingHours} Hrs`, 'Included in Base', '—'],
      ['Overtime (OT) Hours', `${slip.otHours} Hrs`, pdfCurrency(slip.otRate) + ' / hr', pdfCurrency(slip.otSalary)],
      ['GROSS SALARY (Base + OT)', '', '', pdfCurrency(slip.grossSalary)],
    ],
    theme: 'grid',
    headStyles: { fillColor: [11, 31, 58], textColor: 255, fontSize: 9, fontStyle: 'bold' },
    styles: { fontSize: 9.5, cellPadding: 3.5 },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right', fontStyle: 'bold' },
    },
  });

  const afterEarningsY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // Deductions & Final Balance Table
  autoTable(doc, {
    startY: afterEarningsY,
    head: [['DEDUCTIONS, ADVANCES & SETTLEMENT', 'AMOUNT']],
    body: [
      ['Normal Advance Deducted', pdfCurrency(slip.normalAdvance)],
      ['Cooking Advance Deducted', pdfCurrency(slip.cookingAdvance)],
      ['Previous Salary Payments', pdfCurrency(slip.previousPayments)],
      ['FINAL NET BALANCE', pdfCurrency(Math.abs(slip.finalBalance))],
    ],
    theme: 'grid',
    headStyles: { fillColor: [22, 163, 74], textColor: 255, fontSize: 9, fontStyle: 'bold' },
    styles: { fontSize: 9.5, cellPadding: 3.5 },
    columnStyles: {
      1: { halign: 'right', fontStyle: 'bold' },
    },
  });

  const afterDeductY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // Balance Direction Callout
  const isOweMember = slip.balanceDirection === 'YOU OWE MEMBER';
  const isMemberOwes = slip.balanceDirection === 'MEMBER OWES YOU';
  doc.setFillColor(isOweMember ? 236 : isMemberOwes ? 254 : 241, isOweMember ? 253 : isMemberOwes ? 242 : 245, isOweMember ? 245 : isMemberOwes ? 242 : 249);
  doc.setDrawColor(isOweMember ? 22 : isMemberOwes ? 220 : 100, isOweMember ? 163 : isMemberOwes ? 38 : 116, isOweMember ? 74 : isMemberOwes ? 38 : 139);
  doc.roundedRect(14, afterDeductY, 182, 18, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`BALANCE STATUS: ${slip.balanceDirection}`, 20, afterDeductY + 8);
  doc.setFontSize(12);
  doc.text(pdfCurrency(Math.abs(slip.finalBalance)), 190, afterDeductY + 11, { align: 'right' });

  // Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Generated by SAGAR MANAGEMENT • Computer-generated salary statement', 14, 278);
  doc.text('Authorized Signature', 196, 278, { align: 'right' });

  return doc;
}

export async function downloadSalarySlipPDF(slip: SalarySlip) {
  const doc = await buildSalarySlipPDF(slip);
  doc.save(`Salary_Slip_${slip.memberCode}_${slip.startDate}_to_${slip.endDate}.pdf`);
}

export async function printSalarySlipPDF(slip: SalarySlip) {
  const doc = await buildSalarySlipPDF(slip);
  doc.autoPrint();
  const blobUrl = String(doc.output('bloburl'));
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = blobUrl;
  document.body.appendChild(iframe);
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      doc.save(`Salary_Slip_${slip.memberCode}_${slip.startDate}_to_${slip.endDate}.pdf`);
    }
    setTimeout(() => {
      iframe.remove();
      URL.revokeObjectURL(blobUrl);
    }, 60000);
  };
}

export async function shareSalarySlipPDF(slip: SalarySlip): Promise<boolean> {
  const doc = await buildSalarySlipPDF(slip);
  const blob = doc.output('blob');
  const fileName = `Salary_Slip_${slip.memberCode}_${slip.startDate}.pdf`;
  const file = new File([blob], fileName, { type: 'application/pdf' });

  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: `Salary Slip - ${slip.memberName}`,
        text: `SAGAR MANAGEMENT Salary Slip (${slip.periodLabel}) - Final Balance: ${pdfCurrency(Math.abs(slip.finalBalance))} (${slip.balanceDirection})`,
        files: [file],
      });
      return true;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return false;
      }
    }
  }
  doc.save(fileName);
  return false;
}

export async function exportTablePDF(
  title: string,
  subtitle: string,
  headers: string[],
  rows: (string | number)[][],
  fileName: string
) {
  const doc = new jsPDF({ orientation: headers.length > 6 ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const logoData = await loadLogoDataUrl();
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(11, 31, 58);
  doc.rect(0, 0, pageWidth, 28, 'F');
  if (logoData) doc.addImage(logoData, 'JPEG', 12, 5, 18, 18);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(`SAGAR MANAGEMENT — ${title}`, 34, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(186, 210, 235);
  doc.text(subtitle, 34, 20);

  autoTable(doc, {
    startY: 34,
    head: [headers],
    body: rows.map((r) => r.map((c) => String(c))),
    theme: 'striped',
    headStyles: { fillColor: [11, 31, 58], textColor: 255, fontSize: 8.5 },
    styles: { fontSize: 8, cellPadding: 2.5 },
  });

  doc.save(`${fileName}.pdf`);
}

export function exportExcel(
  sheetName: string,
  headers: string[],
  rows: (string | number)[][],
  fileName: string
) {
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 30));
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
}

export function exportCSV(headers: string[], rows: (string | number)[][], fileName: string) {
  const escapeCell = (val: string | number) => {
    const str = String(val ?? '');
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };
  const csv = [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

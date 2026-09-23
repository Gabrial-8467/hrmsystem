import PDFDocument from 'pdfkit';

export interface PayslipPdfData {
  payslip: {
    id: string;
    basicSalary: number;
    allowances: number;
    deductions: number;
    taxDeducted: number;
    netPay: number;
    status: string;
    paymentDate: Date | null;
    employee: {
      firstName: string;
      lastName: string;
      email: string;
      employeeCode: string;
      bankName: string | null;
      accountNumber: string | null;
      taxId: string | null;
      joiningDate: Date | null;
      department: { name: string } | null;
      designation: { title: string } | null;
      branch: { name: string } | null;
    };
    payrollRun: { month: number; year: number; startDate: Date; endDate: Date };
  };
  org: {
    name: string;
    currency: string;
    address: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
  };
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  GBP: '\u00A3',
  EUR: '\u20AC',
  NGN: '\u20A6',
  INR: '\u20B9',
  AED: 'AED ',
  SAR: 'SAR ',
  KES: 'KES ',
  CAD: 'CAD ',
  AUD: 'AUD ',
  GHS: 'GHS ',
  ZAR: 'R ',
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function symbolFor(currency: string): string {
  return CURRENCY_SYMBOLS[currency?.toUpperCase?.()] ?? `${currency} `;
}

function money(value: number, symbol: string): string {
  return `${symbol}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateWithTimezone(value: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone, dateStyle: 'medium' }).format(value);
}

function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

function sized(doc: PDFKit.PDFDocument, text: string, fontSize: number, options?: PDFKit.Mixins.TextOptions): PDFKit.PDFDocument {
  doc.fontSize(fontSize);
  if (options) return doc.text(text, options);
  return doc.text(text);
}

export async function renderPayslipPdf(data: PayslipPdfData, timezone = 'UTC'): Promise<Buffer> {
  const { payslip, org } = data;
  const symbol = symbolFor(org.currency);
  const period = `${MONTH_NAMES[payslip.payrollRun.month - 1]} ${payslip.payrollRun.year}`;
  const payDate = payslip.paymentDate ? dateWithTimezone(payslip.paymentDate, timezone) : '—';
  const gross = payslip.basicSalary + payslip.allowances;
  const totalDeductions = payslip.deductions + payslip.taxDeducted;
  const moneyColor = '#1F2937';
  const labelColor = '#6B7280';
  const accent = '#2563EB';

  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  const done = collect(doc);

  // Header band
  doc.rect(0, 0, 595.28, 96).fill('#0F172A');
  doc.fill('#FFFFFF').font('Helvetica-Bold').fontSize(20).text(org.name || 'Organization', 48, 24);
  doc.font('Helvetica').fontSize(10);
  sized(doc, [org.address, org.email, org.phone, org.website].filter(Boolean).join('  ·  '), 9, { width: 360, link: undefined }).moveDown(0.4);

  doc.fill(accent).font('Helvetica-Bold').fontSize(11).text('PAYSLIP', 48, 58, { align: 'right', width: 499 });
  doc.fill('#CBD5E1').font('Helvetica').fontSize(10).text(period, 48, 72, { align: 'right', width: 499 });

  doc.fill(moneyColor).fontSize(9);
  sized(doc, `${payslip.employee.firstName} ${payslip.employee.lastName}`, 13, { continued: false });
  doc.font('Helvetica');
  sized(doc, `${payslip.employee.employeeCode}  ·  ${payslip.employee.email}`, 9, { width: 260 });
  sized(doc, `${payslip.employee.department?.name ?? '—'}${payslip.employee.designation ? ` · ${payslip.employee.designation.title}` : ''}${payslip.employee.branch ? ` · ${payslip.employee.branch.name}` : ''}`, 9, { width: 260 });

  // Employee meta grid
  doc.y = 150;
  const metaLeft = [
    ['Employee code', payslip.employee.employeeCode],
    ['Department', payslip.employee.department?.name ?? '—'],
    ['Designation', payslip.employee.designation?.title ?? '—'],
    ['Joining date', payslip.employee.joiningDate ? dateWithTimezone(payslip.employee.joiningDate, timezone) : '—'],
  ];
  const metaRight = [
    ['Bank', payslip.employee.bankName ?? '—'],
    ['Account number', payslip.employee.accountNumber ?? '—'],
    ['Tax ID', payslip.employee.taxId ?? '—'],
    ['Payment date', payDate],
  ];
  const rows = Math.max(metaLeft.length, metaRight.length);
  for (let i = 0; i < rows; i += 1) {
    const y = 150 + i * 16;
    doc.font('Helvetica-Bold').fontSize(8).fill(labelColor);
    sized(doc, metaLeft[i]?.[0] ?? '', 8).moveDown(-0.7);
    doc.fill('#334155');
    sized(doc, metaLeft[i]?.[1] ?? '—', 8).moveDown(0);
    doc.fill(labelColor);
    sized(doc, metaRight[i]?.[0] ?? '', 8, { align: 'right', width: 499 }).moveDown(-0.7);
    doc.fill('#334155');
    sized(doc, metaRight[i]?.[1] ?? '—', 8, { align: 'right', width: 499 });
    doc.y = y + 16;
  }

  doc.fill(accent).rect(48, 232, 499, 2).fill();

  // Earnings
  doc.fill(moneyColor).font('Helvetica-Bold').fontSize(11);
  sized(doc, 'Earnings', 11).moveDown(0);
  const earnRows: Array<[string, string, boolean]> = [
    ['Basic salary', money(payslip.basicSalary, symbol), false],
    ['Allowances', money(payslip.allowances, symbol), false],
    ['Gross earnings', money(gross, symbol), true],
  ];
  for (const [label, value, bold] of earnRows) {
    const y = doc.y;
    doc.font('Helvetica').fontSize(9);
    if (bold) doc.fill(accent);
    sized(doc, label, 9).moveDown(0);
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fill(colorFor(bold, moneyColor));
    sized(doc, value, 9, { align: 'right', width: 499 });
    doc.y = y + 18;
  }

  // Deductions
  doc.moveDown(0.4);
  doc.fill(moneyColor).font('Helvetica-Bold').fontSize(11);
  sized(doc, 'Deductions', 11).moveDown(0);
  const dedRows: Array<[string, string, boolean]> = [
    ['Deductions', money(payslip.deductions, symbol), false],
    ['Income tax', money(payslip.taxDeducted, symbol), false],
    ['Total deductions', `-${money(totalDeductions, symbol)}`, true],
  ];
  for (const [label, value, bold] of dedRows) {
    const y = doc.y;
    doc.font('Helvetica').fontSize(9);
    if (bold) doc.fill('#DC2626');
    sized(doc, label, 9).moveDown(0);
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fill(bold ? '#DC2626' : moneyColor);
    sized(doc, value, 9, { align: 'right', width: 499 });
    doc.y = y + 18;
  }

  // Net pay band
  doc.moveDown(0.6);
  const netY = doc.y;
  doc.rect(48, netY, 499, 30).fill('#EFF6FF');
  doc.fill('#0F172A').font('Helvetica-Bold').fontSize(10).text('NET PAY', 68, netY + 8);
  doc.fill('#0F172A').font('Helvetica-Bold').fontSize(14).text(money(payslip.netPay, symbol), 68, netY + 4, { align: 'right', width: 459 });
  doc.y = netY + 40;

  doc.fill('#6B7280').font('Helvetica').fontSize(8);
  doc.moveDown(0.4).text(
    `This payslip reflects an automated payroll computation for ${period} and is subject to final verification by the accounting team. ` +
      `It is a computer-generated document and does not require a signature. ${org.email ? `Questions? Contact ${org.email}.` : ''}`,
    { width: 499 },
  );

  doc.end();
  return done;
}

function colorFor(bold: boolean, base: string): string {
  return bold ? '#2563EB' : base;
}
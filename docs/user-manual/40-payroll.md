# Module 4 — Payroll

This module covers payroll runs, salary structures, and employee payslips with PDF download.

## Pages in this module

| Page | URL | Required permission |
|------|-----|---------------------|
| Payroll Processing | `/payroll` | `payroll.view` |
| Salary Structures | `/payroll/salary` | `salary.view` |
| Payslips Directory | `/payroll/payslips` | `payslips.view` |

---

## 1. Payroll — `/payroll`

Header: eyebrow `FINANCIAL OPERATIONS`, title **"Payroll Processing & Payslips"**, description *"Automated payroll calculations, tax deductions, salary structures, and immutable payslip distribution."*

### Run payroll

The header button **▶ Run October Payroll** processes the current cycle. While running it is disabled; on completion you see *"Payroll run calculated and created!"* and both tables refresh.

### KPI cards (3)

1. **Total Monthly Gross** — e.g. `$485,000`
2. **Total Net Payout** — emerald value, e.g. `$423,000`
3. **Tax & Statutory Deductions** — amber value, e.g. `$62,000`

### Payroll Cycles table — "Payroll Cycles"

| Column | Content |
|--------|---------|
| **Cycle Period** | e.g. `October 2026` (month + year, bold) |
| **Gross Salary** | `$` formatted |
| **Deductions** | rose, e.g. `-$12,400` |
| **Net Pay** | emerald, bold |
| **Status** | Badge — `PAID` = primary tint; other statuses (`DRAFT`, `CALCULATED`, `REVIEWED`, `APPROVED`, `PROCESSED`) = gray |

### Employee Payslips table — "Employee Payslips" (first 15 rows)

| Column | Content |
|--------|---------|
| **Employee** | `{first} {last}` |
| **Department** | name or `—` |
| **Basic Pay** | `$` formatted |
| **Allowances** | emerald, `+$` |
| **Deductions** | rose, `-$` |
| **Net Pay** | bold |
| **Status** | Badge `PAID` (primary) or gray |
| **Actions** | **Preview** (eye icon) and **PDF** (download icon) buttons — both open the payslip modal |

---

## 2. Salary Structures — `/payroll/salary`

Header: eyebrow `PAYROLL & FINANCIALS`, title **"Salary Structures & Pay Components"**, description *"Define base pay, allowances, recurring earnings, statutory tax deductions, and PF components."*

### Pay components table

| Column | Content |
|--------|---------|
| **Component Name** | Banknote icon + name (bold) |
| **Code** | monospaced, e.g. `BASIC` |
| **Type** | Badge — `EARNING` = primary tint, `DEDUCTION` = red tint |
| **Calculation Method** | e.g. `FIXED` or `PERCENTAGE (40%)` |
| **Taxable** | `Taxable` (outline badge) or `Exempt` (muted text) |

The catalog currently shows: Basic Salary (`BASIC`), House Rent Allowance (`HRA`, 40%), Special Allowance (`SPECIAL`), Provident Fund (`PF`, 12%), Professional Tax (`TAX`, 8%).
> ⚠️ **Currently not implemented:** the **Add Component** button is inert and the table is static display data.

---

## 3. Payslips Directory — `/payroll/payslips`

Header: eyebrow `PAYROLL & FINANCIALS`, title **"Employee Payslips Directory"**, description *"View and download individual monthly payslips with detailed earnings and tax deductions breakdown."*

### Payslip table

| Column | Content |
|--------|---------|
| **Employee** | `{first} {last}` |
| **Period** | e.g. `Month 10 / 2026` |
| **Basic Salary** | `$` formatted |
| **Allowances** | emerald `+$` |
| **Deductions** | rose `-$` |
| **Net Disbursed** | emerald, bold |
| **Status** | Badge `PAID` (primary) or gray |
| **Actions** | **Preview** / **PDF** buttons → payslip modal |

---

## 4. Payslip modal & PDF download (shared component)

Opened from any **Preview** or **PDF** button:

- **Title** — organization name, subtitle **"Official Employee Payslip Statement"**, and a status badge (`PAID` = primary, else gray).
- **Summary grid** — Employee Name, Employee Code, Pay Period (e.g. `Month 8 / 2026`), Department.
- **Earnings & Deductions table**
  - Earnings: **Basic Salary**, **Allowances (HRA & Benefits)**
  - Deductions: **Tax / TDS**, **PF & Other Deductions**
  - Totals row: **Total Gross Salary** / **Total Deductions**
- **NET PAYABLE AMOUNT** — highlighted box with the dollar amount.
- **Download PDF / Print** button — opens a printable A4 payslip in a new window (company header, employee details, earnings/deductions table, net amount box, computer-generated footer) and triggers the print dialog.
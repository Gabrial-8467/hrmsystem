# Module 6 — Operations

This module covers the day-to-day operational HR activities: performance, expenses, company assets, documents, and announcements.

## Pages in this module

| Page | URL | Required permission |
|------|-----|---------------------|
| Performance | `/performance` | `performance.view` |
| Expenses | `/expenses` | `expenses.view` |
| Assets | `/assets` | `assets.view` |
| Documents | `/documents` | `documents.view` |
| Announcements | `/announcements` | `announcements.view` |

---

## 1. Performance — `/performance`

Header: eyebrow `PERFORMANCE & TALENT`, title **"Performance Cycles, Goals & Reviews"**, description *"Track employee KPIs, individual goals, self-assessments, and quarterly manager reviews."*

Two side-by-side cards:

### Active Performance Cycles
Each cycle row shows the **cycle title** (bold), a **date range** (`{start} - {end}`), and a **status badge** (`ACTIVE`/`DRAFT`/`COMPLETED`; active = primary tint).

### Target Goals & Milestones
Each goal shows:
- **Goal title** (bold) with a value badge `{current}{unit}` (e.g. `80%`).
- **Description** (muted).
- A **progress bar** filled to the current value (e.g. 80%).

> ⚠️ **Currently not implemented:** the **Create Goal** button is inert.

---

## 2. Expenses — `/expenses`

Header: eyebrow `FINANCIAL OPERATIONS`, title **"Employee Expense Claims"**, description *"Submit, approve, and reimburse employee business expenses with receipt verification."*

### Expense table

| Column | Content |
|--------|---------|
| **Employee** | `{first} {last}` |
| **Category** | e.g. `TRAVEL` (semibold) |
| **Merchant / Details** | Merchant (bold) or `N/A`, description (small) below |
| **Date** | locale date |
| **Amount** | `$X.XX` (bold) |
| **Status** | Badge — `APPROVED` = primary tint; `SUBMITTED`, `REJECTED`, `PAID`, `DRAFT` = gray |

> ⚠️ **Currently not implemented:** the **Submit Expense** button is inert; there are no approve/pay actions on this page (submissions surface in the Approval Center — see Module 3).

---

## 3. Assets — `/assets`

Header: eyebrow `ASSET MANAGEMENT`, title **"Company Assets & IT Hardware"**, description *"Track company computers, monitors, mobile devices, serial numbers, and employee assignments."*

### Asset table

| Column | Content |
|--------|---------|
| **Asset Name** | Laptop icon + name (bold) |
| **Asset Tag** | Monospaced, e.g. `AST-0001` |
| **Category** | e.g. `LAPTOP` (small semibold) |
| **Serial Number** | Monospaced, or `N/A` |
| **Assigned To** | `{first} {last}`, or `Unassigned` |
| **Status** | Badge — `ASSIGNED` = primary tint; `AVAILABLE`, `UNDER_MAINTENANCE`, `RETIRED` = gray |

> ⚠️ **Currently not implemented:** the **Add Asset** button and assign/return flows are not yet available.

---

## 4. Documents — `/documents`

Header: eyebrow `CENTRAL REPOSITORY`, title **"Organization Documents & Files"**, description *"Centralized document storage for company policies, contracts, tax files, and compliance guides."*

### Document table

| Column | Content |
|--------|---------|
| **Document Title** | File icon + filename |
| **Category** | Secondary badge (`CONTRACT`, `OTHER`, `TAX`, …) |
| **File Size** | e.g. `2.4 MB` |
| **Uploaded Date** | locale date |
| **Actions** | **Download** button (ghost) |

Example rows: Employee Code of Conduct 2026.pdf, Standard Employment Agreement Template.docx, Group Health Insurance Policy Guide.pdf, Annual Tax Deduction & Compliance Certificate.pdf.
> ⚠️ **Currently not implemented:** the **Upload Document** button is inert and the list (including download) is static sample data.

---

## 5. Announcements — `/announcements`

Header: eyebrow `COMPANY COMMUNICATION`, title **"Announcements & Broadcasts"**, description *"Publish company-wide announcements, department updates, and operational notices."*

### Announcement cards

Announcements render as a vertical list of cards. Each card shows:

- **Megaphone icon tile**, the **title** (bold), and **"Published on {date}"** (muted).
- A secondary **target-audience badge** on the right (e.g. a department/role label, or `ALL`).
- The **content** as the card body (muted text).

> ⚠️ **Currently not implemented:** the **New Announcement** button is inert; publishing/composing is not yet available.
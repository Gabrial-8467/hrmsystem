# Module 7 — Insights (Reports)

This module provides executive-level analytics across headcount, departments, branches, payroll, and leave.

## Pages in this module

| Page | URL | Required permission |
|------|-----|---------------------|
| Executive HR Analytics | `/reports` | `reports.view` |
| Reports (data tables) | `/settings/reports` | `reports.view` (not listed in navigation) |

---

## 1. Executive HR Analytics — `/reports`

Header: eyebrow `INSIGHTS & ANALYTICS`, title **"Executive HR Analytics & Reports"**, description *"Headcount distribution, department metrics, payroll expenditure, and leave utilization analytics."*

### Header action

- **Export CSV Report** (outline, download icon) — clicking it confirms with a toast *"HRMS report exported to CSV successfully"* and refreshes the data.
> ⚠️ **Currently not implemented:** no actual CSV file is generated from this button; a working download exists on `/settings/reports`.

### KPI cards (4)

| Card | Example value |
|------|---------------|
| **Total Workforce** | `55 Employees` |
| **Active Departments** | `6 Teams` |
| **YTD Gross Payroll** | `$1,455,000` |
| **YTD Net Disbursed** | `$1,269,000` (emerald) |

### Distribution cards (progress bars)

- **"Headcount by Department"** — one row per department: `{name}` + `{count} employees`, with a 2px primary-colored progress bar scaled by share of headcount.
- **"Geographic Branch Distribution"** — same layout per branch location, with emerald progress bars.

No date-range filters or chart-library graphs are used; "charts" are horizontal progress bars. Loading shows a skeleton; errors show *"Failed to load analytics"* with a **Retry** button.

---

## 2. Reports (data tables) — `/settings/reports`

Reachable only by typing the URL (not present in any menu). Header: **Reports** with subtitle *"Live, permission-scoped analytics across headcount, branches, payroll and leave."*

### Metric tiles (4)
**Headcount** · **Branches** · **Net Paid** (e.g. `$1,269,000`) · **Leave Requests**.

### Exportable report cards

Each card is a small two-column table with its own **CSV** export button (real client-side download):

1. **Headcount by Department** — *Active employees grouped by department.* — columns `Department` / `Employees` → `headcount-by-department.csv`
2. **Headcount by Branch** — columns `Branch` / `Employees` → `headcount-by-branch.csv`
3. **Payroll Summary** — *Gross, deductions and net across processed payroll runs.* — rows `Total Gross Paid`, `Total Deductions`, `Total Net Paid` (currency) → `payroll-summary.csv`
4. **Leave by Status** — *Volume of leave requests grouped by workflow status.* — rows mapped to `Pending`, `Approved`, `Rejected`, `Cancelled` → `leave-by-status.csv`

Empty tables show **"No data yet"**. A footer card **"About this report engine"** explains that metrics are aggregated live, scoped to your organization, exportable to CSV for analysis, and restricted to users holding the `reports.view` permission.

Error state: *"Unable to load report data."* with a **Retry** button.
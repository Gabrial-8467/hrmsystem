# Appendix — Statuses, Badges & Permissions

## 1. Badge color conventions

| Badge style | Visual | Used for |
|-------------|--------|----------|
| **default** | Soft primary-tinted, borderless | `ACTIVE` employees, `PRESENT`, `APPROVED` (leave), `PAID` (payroll/payslips), `OPEN` (jobs), `HIRED`, `ASSIGNED`, `SCHEDULED`, `EARNING`, `Paid Leave`, `Active` roles/cycles |
| **secondary** | Muted gray | Anything not in a highlighted state — `DRAFT`, `SUBMITTED`, `PENDING`-like values, categories, status dots |
| **outline** | Bordered, regular text | `LATE`, `PENDING` (leave), `Taxable`, `invited`/`suspended` (users), action badges |
| **destructive** | Red tint | `REJECTED` (leave), `DEDUCTION` (salary), negative/danger indicators |
| **success** | Emerald | `Active` user status, positive confirmations |
| **warning** | Amber | `Inactive` role badge, attention items |
| **info** | Sky | Informational badges |

## 2. Core status values

### Employee status
`ACTIVE` · `ON_LEAVE` · `TERMINATED` · `RESIGNED`

### Employment type
`FULL_TIME` · `PART_TIME` · `CONTRACT` · `INTERN`

### User status
`ACTIVE` · `INVITED` · `SUSPENDED` · `DEACTIVATED`

### Attendance status
`PRESENT` · `ABSENT` · `HALF_DAY` · `LATE` · `ON_LEAVE` · `HOLIDAY` · `WEEK_OFF` · `WORK_FROM_HOME`

### Leave status
`PENDING` · `APPROVED` · `REJECTED` · `CANCELLED`

### Payroll run / payslip status
Run: `DRAFT` · `CALCULATED` · `REVIEWED` · `APPROVED` · `PROCESSED` · `PAID`
Payslip: `DRAFT` · `GENERATED` · `PAID`

### Recruitment statuses
Job: `DRAFT` · `OPEN` · `CLOSED` · `ON_HOLD`
Candidate (pipeline stages): `APPLIED` · `SCREENING` · `INTERVIEW` · `OFFER` · `HIRED` (+ `REJECTED`)
Interview: `SCHEDULED` · `COMPLETED` · `CANCELLED`

### Asset & expense statuses
Asset: `AVAILABLE` · `ASSIGNED` · `UNDER_MAINTENANCE` · `RETIRED`
Expense: `DRAFT` · `SUBMITTED` · `APPROVED` · `REJECTED` · `PAID`

### Performance statuses
Cycle/Review: `DRAFT` · `ACTIVE` · `COMPLETED` · `IN_PROGRESS`

### Document category
`IDENTIFICATION` · `CONTRACT` · `RESUME` · `CERTIFICATE` · `TAX` · `OTHER`

## 3. Permissions registry (67 permissions)

Organization plan/admin shows the human-readable names in the role builder. `*` = super-admin wildcard.

| Module | Permissions |
|--------|-------------|
| organization | `organization.view` View organization, `organization.update` Update organization |
| platform | `platform.manage` Manage platform (tenants, plans, config), `analytics.view` View platform analytics |
| users | `users.view`, `users.create`, `users.update`, `users.delete` |
| roles | `roles.view`, `roles.manage` Create and update roles |
| employees | `employees.view`, `employees.create`, `employees.update`, `employees.delete` |
| departments | `departments.view`, `departments.manage` |
| branches | `branches.view`, `branches.manage` |
| designations | `designations.view`, `designations.manage` |
| attendance | `attendance.view`, `attendance.self` Mark own attendance, `attendance.manage`, `attendance.correct` Request/approve correction, `attendance.approve` |
| shifts | `shifts.view`, `shifts.manage` |
| holidays | `holidays.view`, `holidays.manage` |
| leave | `leave.view`, `leave.create` Apply for leave, `leave.approve`, `leave.manage` Manage leave types and policies |
| payroll | `payroll.view`, `payroll.process`, `payroll.approve` |
| salary | `salary.view`, `salary.manage` |
| payslips | `payslips.view`, `payslips.self` View own payslip |
| recruitment | `jobs.view`, `jobs.manage`, `candidates.view`, `candidates.manage`, `interviews.view`, `interviews.manage` Schedule and manage interviews |
| onboarding | `onboarding.view`, `onboarding.manage` |
| performance | `performance.view`, `performance.manage`, `performance.self` Self assessment |
| expenses | `expenses.view`, `expenses.create` Submit, `expenses.approve`, `expenses.pay` Mark as paid |
| assets | `assets.view`, `assets.manage` Manage assets and assignments |
| documents | `documents.view`, `documents.upload`, `documents.manage` Verify/delete |
| announcements | `announcements.view`, `announcements.manage` Create announcements |
| reports | `reports.view` |
| audit | `audit.view` |
| settings | `settings.view`, `settings.manage` |
| notifications | `notifications.view` |

## 4. What each permission unlocks in the UI

- **Sidebar visibility** — `employees.view`, `departments.view`, `designations.view`, `attendance.view`, `shifts.view`, `holidays.view`, `leave.view`, `leave.approve` (Approval Center), `leave.manage` (Leave Policies), `payroll.view`, `salary.view`, `payslips.view`, `jobs.view`, `candidates.view`, `interviews.view`, `performance.view`, `expenses.view`, `assets.view`, `documents.view`, `announcements.view`, `reports.view`, `users.view`, `audit.view`. Dashboard and Settings are always visible.
- **Users & Roles page** — New Role + role edit/delete require `roles.manage`; Invite User requires `users.create`; edit requires `users.update`; delete requires `users.delete` (never your own account).
- **Reports page** — data and exports limited to `reports.view`.

## 5. Predefined system roles

| Role | Scope | Note |
|------|-------|------|
| `SUPER_ADMIN` | Platform | Holds the wildcard `*` (all permissions) |
| `ORG_ADMIN` | Organization | Organization-wide superset `*` |
| `HR_MANAGER` | Organization | Full HR management |
| `HR_ADMIN` | Organization | Legacy alias of HR Manager |
| `MANAGER` | Organization | Department manager (approvals, team views) |
| `ACCOUNTANT` | Organization | Payroll/payroll-manager duties |
| `EMPLOYEE` | Organization | Self-service (own attendance, leave, payslips) |

## 6. Keyboard shortcuts & tips

| Action | How |
|--------|-----|
| Global search / command palette | `Ctrl/Cmd + K` or click the topbar search box |
| Navigate to any module | Sidebar items, or type a page in the command palette |
| Theme | Topbar moon/sun toggle (remembers your choice) |
| Sign out | Profile menu (top-right) → **Sign out** |
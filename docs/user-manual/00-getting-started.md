# Module 0 — Getting Started & App Overview

This module explains how to sign in, recover your account, and navigate the application shell.

## Pages in this module

| Page | URL | Access |
|------|-----|--------|
| Sign in | `/login` | Public |
| Forgot password | `/forgot-password` | Public |
| Reset password | `/reset-password` | Public (needs email link token) |
| Dashboard (Home) | `/dashboard` | Any authenticated user |
| App shell components | Every authenticated page | Any authenticated user |

---

## 1. Sign In (`/login`)

A centered card in the middle of a full-viewport screen.

- **Brand header** — a rounded primary-colored square with a grid icon, the product name **Hrmsify**, and the tagline *"HR operations, simplified"*.
- **Work email field** — labelled **Work email**, placeholder `you@company.com`, with a mail icon.
  - Validation: *"Email is required"* if empty; *"Enter a valid email"* if malformed.
- **Password field** — labelled **Password**, placeholder `••••••••`, with a lock icon.
  - Validation: *"Password is required"* if empty.
  - **Show / Hide toggle** — an eye button on the right toggles between visible and masked text.
- **Forgot password?** link — right-aligned on the password row; takes you to `/forgot-password`.
- **Keep me signed in** checkbox — remember-your-session option sent to the server as `rememberMe`.
- **Sign in** button — full-width; shows **"Signing in…"** with a spinner while processing.

On success you get the toast *"Signed in successfully"* and are taken to the page you originally requested (the `?next=` destination) or, failing that, to the **Dashboard**. On failure, a red toast *"Sign in failed"* shows the reason.

> **Route protection** — Typing a protected URL while signed out silently redirects you to `/login?next=<that URL>` so you return to where you were after signing in. Signing in while on a public page bounces you to the Dashboard.

## 2. Forgot Password (`/forgot-password`)

Card titled **"Reset your password"** with the subtitle *"Enter your Hrmsify work email and we'll send you a reset link."*

- **Work email** field (same validation as sign in).
- **Send reset link** button (shows **"Sending…"** while in flight).
- After submitting you always see a success screen: a green check icon, **"Check your inbox"**, and the message *"If an account exists for that address, we've emailed you a reset link. The link expires in 30 minutes."* (This message is shown even for unknown addresses for security.)
- Link **"Back to sign in"** returns to `/login`.

## 3. Reset Password (`/reset-password?token=…`)

Opened from the email link (token read from the URL). If the token is missing you get a toast *"Missing reset token"*.

Card titled **"Set a new password"** with subtitle *"Choose a strong password you don't use elsewhere."*

- **New password** field with five live validation rules:
  - *At least 8 characters*
  - *Include an uppercase letter*
  - *Include a lowercase letter*
  - *Include a number*
  - *Include a symbol*
- **Confirm password** field — *"Confirm your password"* if empty, *"Passwords do not match"* if different.
- **Update password** button (disabled without a token; shows **"Updating…"** in flight).
- On success the form is replaced by **"Password updated"** — *"Your password has been changed. You can now sign in with your new password."* — with a **Sign in** button.

## 4. The Application Shell (every logged-in page)

After signing in you land in the shared app shell: a **sidebar** on the left, a **topbar** across the top, and the **page content** below.

### 4.1 Topbar

- **Mobile menu** (hamburger) — only on small screens; opens the sidebar as an overlay.
- **Global search** — an input-looking button with placeholder *"Search employees, departments, commands..."* and a **⌘K** chip. Clicking it (or pressing `Ctrl/Cmd + K`) opens the **command palette** (see §4.3).
- **Organization badge** — a pill on the right showing your organization name (e.g. *Enterprise Organization*).
- **Theme toggle** — switches between light and dark mode (moon/sun icon). Your choice is remembered.
- **Notifications** — a bell button with a red pulsing dot. Opening it shows a panel titled **Notifications** with a *"2 New"* badge and notification cards (leave requests, pending expense claims, etc.).
- **Profile menu** — your avatar initials, name and role. Clicking opens a menu with:
  - Your **full name and email** (header block)
  - **Settings** → `/settings`
  - **Users & Permissions** → `/settings/users`
  - **Sign out** — clears your session and returns to `/login`.

### 4.2 Sidebar navigation

The sidebar is grouped into sections. Every item is **permission-gated** — you only see items your role allows; sections that have no visible items are hidden entirely.

| Section | Items → URL |
|---------|-------------|
| **Overview** | Dashboard → `/dashboard` |
| **People** | Employees → `/employees` · Departments → `/departments` · Designations → `/designations` · Org Hierarchy → `/org-chart` |
| **Attendance** | Attendance → `/attendance` · Shifts → `/shifts` · Holidays → `/holidays` |
| **Leave & Approvals** | Leave Requests → `/leave` · Approval Center → `/approvals` · Leave Policies → `/leave/policies` |
| **Payroll** | Payroll → `/payroll` · Salary → `/payroll/salary` · Payslips → `/payroll/payslips` |
| **Recruitment** | Jobs → `/recruitment/jobs` · Candidates → `/recruitment/candidates` · Interviews → `/recruitment/interviews` |
| **Operations** | Performance → `/performance` · Expenses → `/expenses` · Assets → `/assets` · Documents → `/documents` · Announcements → `/announcements` |
| **Insights** | Reports → `/reports` |
| **Administration** | Users & Roles → `/settings/users` · Audit Logs → `/settings/audit` · Settings → `/settings` |

- The **active page** is highlighted with a sidebar background tint, semibold text, and a thin primary-colored indicator bar.
- The sidebar **collapse button** (bottom of the rail) reduces it to icons only; tooltips reveal labels.
- At the very bottom your avatar, name, and organization are shown.

### 4.3 Command palette (global search)

Open with `Ctrl/Cmd + K` or by clicking the search box.

A centered dialog with a search input (placeholder *"Type a command or search employees, pages, payroll... (Ctrl + K)"*). Results are grouped: **Navigation**, **People**, **Attendance**, **Leave**, **Payroll**, **Recruitment**, **Operations**, **Insights**, **Settings**. Selecting a result closes the palette and navigates. No matches shows *"No matching pages or commands found."*

### 4.4 Page headers (shared component)

Every module page opens with a shared header containing an uppercase **eyebrow** (e.g. `PEOPLE`), an **H1 title**, a one-line **description**, and optional **action buttons** on the right.

---

## 5. Dashboard (`/dashboard`)

The home screen gives at-a-glance health of the whole organization. The greeting changes with the time of day (*"Good morning/afternoon/evening, {name} 👋"*).

- **Hero banner** — an indigo→violet gradient with your **role · organization** chip, the time-based greeting, a contextual sub-line, a **time-range pill switcher** (**Today / This Month / Q4 2026**), and two buttons: **＋ Add Employee** (→ `/employees`) and **Check In** (→ `/attendance`).
- **KPI cards (4)**
  1. **Total Workforce** — employee count with a `+N new this month` chip.
  2. **Attendance Rate** — `%` of the workforce present today, with caption `{present} of {total} present today`.
  3. **Pending Approvals** — count, caption *"Requires manager action"*.
  4. **Payroll {period}** — net disbursement amount with a small area sparkline.
- **"Everything at a Glance"** — a row of 14 clickable module tiles (Employees, Departments, Designations, Shifts, Holidays, Attendance, Leave, Payroll, Recruitment, Performance, Expenses, Assets, Announcements, Documents). Each tile shows an icon, a bold value, and a caption. Clicking a tile opens that module.
- **"Today's Work Mode"** — a donut chart of today's workforce split: **Present On-Site**, **Work From Home**, **On Leave**, **Absent / Unexcused**, **Late Arrivals** (counts and percentages).
- **"Department Headcount"** — one progress bar per department with `{count} employees`, plus a **View Departments ↗** link.
- **"Live Audit Activity"** — the 5 most recent audit entries (`{actor} {action} {entity}` with relative time); **Full Audit Trail** link opens `/settings/audit`.
- **"Upcoming Milestones"** — anniversaries, holidays, and probation/completion reviews with dates, e.g. 🏅 *Ananya Sharma — 3 Years at Company — Tomorrow*.

> Data shown on the dashboard is a mix of live API metrics (where the backend returns them) and sample fallback values; a **"Live data"** badge is shown next to the glance section header.

---

## 6. Roles & Permissions (what you can see and do)

Two concepts control access:

- **Roles** — predefined system roles include **Super Admin**, **Organization Admin**, **HR Manager**, **HR Admin**, **Manager** (department manager), **Accountant/Payroll Manager**, and **Employee** (self-service). Organizations can also create **custom roles**.
- **User statuses** — `Active`, `Invited`, `Suspended`, `Deactivated`. Deactivated/suspended users cannot sign in.

The full list of 67 permission keys and what they gate is in the [Appendix](./90-appendix.md). In short:
- `*.view` shows the module in the navigation and lets you open it.
- `*.create`, `*.update`, `*.manage`, `*.approve`, `*.delete` unlock the corresponding actions on a page.
- Super administrators implicitly hold **all** permissions (the wildcard `*`).

**Security model:** navigation gating is an optimistic UX layer only; the backend enforces real authorization on every API call.
# Module 1 — People

This module manages the organizational structure: employee records, departments, designations (job titles), and the visual reporting hierarchy.

## Pages in this module

| Page | URL | Required permission |
|------|-----|---------------------|
| Employees directory | `/employees` | `employees.view` |
| Employee profile | `/employees/{id}` | `employees.view` |
| Departments | `/departments` | `departments.view` |
| Designations & Job Titles | `/designations` | `designations.view` |
| Org Hierarchy | `/org-chart` | `employees.view` |

---

## 1. Employees — `/employees`

Header: eyebrow `PEOPLE`, title **"Employees"**, description *"Manage your workforce, employee profiles, and organizational assignments."*

### Create an employee

Click **＋ Add Employee** (top-right of the header, or the empty-state card). A dialog titled **"Add New Employee"** opens with the form fields:

| Field | Label | Required | Placeholder / options |
|-------|-------|----------|------------------------|
| Employee Code | *Employee Code* | Yes | `EMP-101` |
| Employment Type | *Employment Type* | Yes | **Full Time** (default), **Part Time**, **Contract**, **Intern** |
| First Name | *First Name* | Yes | `Jane` |
| Last Name | *Last Name* | Yes | `Doe` |
| Work Email | *Work Email* | Yes | `jane.doe@acme.com` |
| Phone Number | *Phone Number* | No | `+1-555-0199` |

Buttons: **Cancel** and **Create Employee** (shows **"Creating..."** while saving). On success you get the toast *"Employee created successfully"* and the dialog closes. (Department/designation/branch are not part of this creation form and are added later from the profile module.)

### Search & filter

- **Search box** (magnifier icon) — placeholder *"Search by name, email or ID..."*; filters the list live as you type.
- **Department dropdown** — starts at **All Departments**; picking a department narrows the results.
- The directory shows up to **50 records** at a time (fixed page size).

### Employee list table

| Column | What it shows |
|--------|---------------|
| **Employee** | Circular avatar with initials, full name (bold), email underneath (muted, smaller) |
| **Code** | `employeeCode` in monospaced text |
| **Department** | Department name, or `—` |
| **Designation** | Job title, or `—` |
| **Branch** | Branch/location, or `—` |
| **Status** | Badge — `ACTIVE` in the primary color; any other status in muted/gray |
| **Actions** | **View Profile** button (eye icon) → opens `/employees/{id}` |

**States:** a 5-row skeleton while loading; *"Failed to load employees"* with a **Retry** button on error; *"No employees found — Add your first employee to start managing your organization's workforce."* when empty.

---

## 2. Employee Profile — `/employees/{id}`

Starts with a **← Back to Employees** link, then a header card.

### Header card

- 64px circular avatar with the employee's initials.
- **Full name** with a **status badge** (`ACTIVE` = primary tint, others muted).
- An **employment-type badge** (e.g. `FULL_TIME`).
- Sub-line: `{designation} • {department}`.
- Contact row: email (mail icon), phone (phone icon, only if present), and `ID: {employeeCode}` in monospaced text.
- Right side: **Joining Date**.

### Tabs (8)

`Overview · Personal · Employment · Attendance · Leave · Payroll · Career & Timeline · Documents`

The tab bar scrolls horizontally on narrow screens; the active tab has a primary underline.
> ⚠️ **Currently not implemented:** the **Employment** tab is declared but shows no content.

### Overview tab
- **"Employment Summary"** card — rows: **Department**, **Designation**, **Branch / Location** (defaults to *Main Office*), **Reporting Manager** (name, or *Self / Executive*), **Employment Type**.
- **"Compensation & Bank Info"** card — rows: **Annual Basic Salary** (highlighted, e.g. `$75,000`), **Pay Frequency** (defaults `MONTHLY`), **Bank Name** (defaults `HDFC Bank`), **Account Number** (masked, e.g. `•••• 8902`).

### Personal tab
**"Personal Information"** card — First Name, Last Name, Email Address, Phone Number in a two-column label/value grid.

### Attendance tab
**"Attendance Log"** card — each entry shows the **date**, a sub-line *"Work hours: {n} hrs"*, and a **status badge** (`PRESENT` = primary tint, others muted). Empty: *"No recent attendance records logged."*

### Leave tab
**"Leave Requests History"** card — each request shows the **reason** (bold), a range line `{start} - {end} ({totalDays} days)`, and a **status badge** (`APPROVED` = primary tint, others muted). Empty: *"No leave requests found."*

### Payroll tab
**"Salary & Monthly Payslips"** card:
- **Annual Basic Salary** — `$X / yr`.
- **Estimated Gross Payout** — a computed figure (basic ÷ 12 × 1.4).
- **Issued Payslips** — one **"Payslip Statement"** per payslip with *"Net Disbursed: $…"* and a small **PDF** button that opens the payslip preview modal (see Module 4).

### Career & Timeline tab
**"Employee Lifecycle Timeline"** card — a vertical timeline with events:
- **Joined Organization** — `{joiningDate}`, *"Appointed as {designation} in {department} department."*
- **Annual Salary Revision** — *"Compensation revised. Basic salary set to $X / yr."*
- **Completed Probation Period** — *"Confirmed full-time employment status upon successful performance evaluation."*

### Documents tab
**"Uploaded Documents & Verification"** card — currently a placeholder: *"Centralized document vault for identity proofs, employment contracts, and statutory forms."* No files are listed yet.

---

## 3. Departments — `/departments`

Header: eyebrow `ORGANIZATION`, title **"Departments"**, description *"Structure your organization into functional departments and teams."*

### Create a department

Click **＋ Add Department** → dialog **"Add Department"**:

| Field | Label | Notes |
|-------|-------|-------|
| Department Name | *Department Name* | required, placeholder `Engineering` |
| Department Code | *Department Code* | required, placeholder `ENG`, auto-uppercased |
| Description | *Description* | optional, placeholder `Software development and architecture` |

Buttons: **Cancel** / **Create**. On success: toast *"Department created successfully"*.

### Department cards

Departments render as a **responsive card grid** (1/2/3 columns). Each card:
- **Building icon** in a primary tile, the department **name**, and the **code** in monospaced text.
- **Description** (clamped to 2 lines) or *"No description provided."*
- Footer: **"{n} Employees"** (users icon) and **"{n} Roles"** (briefcase icon).

> Currently no edit/delete or manager-assignment UI exists; this page is view-and-create only.

---

## 4. Designations — `/designations`

Header: eyebrow `ORGANIZATION`, title **"Designations & Job Titles"**, description *"Define job titles, hierarchy levels, and departmental role structures."*

### Add a designation

Click **＋ Add Designation** → dialog **"Add Job Designation"**:

| Field | Label | Notes |
|-------|-------|-------|
| Job Title | *Job Title* | required, placeholder `Senior Frontend Architect` |
| Role Code | *Role Code* | required, placeholder `SR_FE_ARCH`, auto-uppercased |
| Department | *Select Department* | dropdown of departments (optional) |

> ⚠️ **Currently not implemented:** the dialog's **Create** button only displays a success toast — the record is not persisted.

### Designation table

| Column | Content |
|--------|---------|
| **Designation** | Briefcase icon + job title (bold) |
| **Role Code** | Monospaced, e.g. `VP_ENG` |
| **Department** | Plain text |
| **Level** | Outline badge `L{level}`, e.g. `L5` |
| **Employees** | `{n} members` with a users icon |

> The rows are currently static display data (e.g. VP of Engineering L5, Engineering Manager L4, Senior Software Engineer L3…). No search, edit, or delete is available.

---

## 5. Org Hierarchy — `/org-chart`

Header: eyebrow `ORGANIZATION`, title **"Interactive Organizational Hierarchy"**, description *"Visual reporting tree showing company leadership, department managers, and employee reporting relationships."*

- The tree renders inside a bordered, rounded box that **scrolls horizontally** on smaller screens.
- **Root** — a slightly larger card (tinted border): **HR Director & Platform Admin** — Priya Sharma `EMP-001`, Human Resources.
- **Three Level-1 managers**, each with their team beneath:
  - **VP of Engineering** — Alexander Smith `EMP-007` → Engineering Manager (Vikram Rao) → Senior Software Engineer (Sneha Iyer), Software Engineer (Arjun Nair), QA Engineer (Sophia Johnson).
  - **Financial Controller** — Anita Mehra `EMP-003` → Senior Accountant (Benjamin Williams).
  - **HR Manager** — Rahul Verma `EMP-002` → Talent Specialist (Emma Brown).
- Every **node card** shows a circular avatar with the person's initial, the **name** (bold), the **job title** (primary color), and a footer with an outline **employee-code badge** and `• Department`.

Interaction is currently limited to hover highlighting on cards; there is no click-through to profiles or expand/collapse.
> ⚠️ **Currently not implemented:** the hierarchy is a fixed demo chart (no live API data).
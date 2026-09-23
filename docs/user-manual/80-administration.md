# Module 8 — Administration

This module covers user & role management (RBAC), the security audit trail, and organization settings.

## Pages in this module

| Page | URL | Required permission |
|------|-----|---------------------|
| Users & Roles | `/settings/users` | `users.view` (plus `roles.manage`, `users.create`/`update`/`delete` for actions) |
| Audit Logs | `/settings/audit` | `audit.view` |
| Organization Settings | `/settings` | Always visible |

---

## 1. Users & Roles — `/settings/users`

Header: eyebrow `ADMINISTRATION`, title **"Users & RBAC Role Management"**, description *"Manage system access, assign roles, and configure permission policies."*

### Header actions (permission-gated)

- **＋ New Role** (outline) — requires `roles.manage`.
- **Invite User** (primary) — requires `users.create`.

### Stat cards (4)
1. **Total users** — hint `{n} active on the team`
2. **Active users** — hint `{n}% of all users`
3. **Suspended / deactivated** — hint `Not currently active`
4. **Roles configured** — hint `{n} custom · {n} system`

### Roles panel (left column)

Card **"Roles"** with a count badge and a **New Role** link.

- **System roles · n** (lock icon) — e.g. `SUPER_ADMIN`, `ORG_ADMIN`, `HR_MANAGER`, `HR_ADMIN`, `MANAGER`, `ACCOUNTANT`, `EMPLOYEE`. System roles cannot be edited or deleted.
- **Custom roles · n** (key icon) — empty state: *"No custom roles yet. Create one to grant tailored access."*

Each role card shows:
- a **ShieldCheck icon**, the **role name**, a **Lock icon** if system-only, and an **`Inactive`** warning badge if disabled;
- a **description** (or *"Built-in system role."* / *"Custom role."*);
- a mono **code chip**, and `{n} perm(s) · {n} user(s)`;
- a **permission-coverage progress bar** (tooltip `{n} of {totalPerms} permissions`);
- **Edit** (pencil) and **Delete** (red trash) buttons on custom roles (requires `roles.manage`). Delete confirms with *Delete role "{name}"?* then toasts *"Role deleted"*.

### User invite dialog (`Invite User`)

Description: *"Create a user account and assign one or more roles."*

| Field | Notes |
|-------|-------|
| **First Name** | required |
| **Last Name** | required |
| **Work Email** | required, email type |
| **Password** | optional — placeholder *Leave blank to auto-generate*, helper *A temporary password is generated when left blank.* |
| **Roles** | checkbox list with role name + mono code (and a `System` badge); selecting ≥1 role required |

Buttons: **Cancel** / **Create User** (spinner *"Creating..."*). Success: *"User created and role(s) assigned"*.

### Edit user dialog

Shows the user's email as the description. Fields: First Name, Last Name, **Status** dropdown (**Active / Suspended / Deactivated**), and the Roles checkbox list. Buttons: **Cancel** / **Save Changes**. Success: *"User updated"*.

### Role editor dialog ("Create Custom Role" / "Edit Role")

- **Role Name** — required.
- **Code** — required on create, auto-uppercased, placeholder `e.g. RECRUITER`; read-only on edit.
- **Description** — textarea, placeholder *What is this role responsible for?*
- **Permissions** — a grouped permission matrix. Each module group has a select-all header checkbox (with an indeterminate state when partially selected) showing `selected/total`; each permission row shows its human-readable name + mono key (e.g. *View employees* `employees.view`). Platform-scope permissions (`platform.manage`, `analytics.view`) are excluded from the builder.
- **Active** toggle — edit mode only.

Validation: *"Role name is required"*, *"Role code is required"*. Success toasts: *"Role created"* / *"Role updated"*.

### Users table (right columns)

| Column | Content |
|--------|---------|
| **User** | Avatar with initials + status dot (emerald = ACTIVE, amber = otherwise), name, email |
| **Roles** | One badge per assigned role (gray) |
| **Status** | `Active` (green) badge for ACTIVE; otherwise an outline badge (`suspended`, `deactivated`, `invited`) |
| **Actions** | **Edit** pencil (`users.update`) and **Delete** trash (`users.delete`; hidden for your own account) |

- **Search box** — placeholder *"Search by name or email..."*.
- **Status filter** — segmented buttons **All / Active / Suspended / Deactivated**.
- Delete shows *Deactivate {First} {Last}?* and toasts *"User deactivated"* — i.e., deleting deactivates, it does not hard-remove.
- Empty state: *"No matching users"* / *"Try adjusting the search or status filter."*

---

## 2. Audit Logs — `/settings/audit`

Header: eyebrow `ADMINISTRATION`, title **"Immutable Security Audit Trail"**, description *"Immutable logs tracking user actions, logins, salary modifications, leave approvals, and role updates."*

### Log table (latest 50 entries)

| Column | Content |
|--------|---------|
| **Timestamp** | locale date-time, small monospaced muted text |
| **Actor / User** | User icon + actor name (falls back to `System Admin`) |
| **Action** | Outline mono badge, e.g. `create`, `update`, `login`, `delete` |
| **Target Entity** | Title-cased entity (e.g. `Employee`) + `#` + first 8 id characters (or `N/A`) |
| **IP Address** | Mono, e.g. `127.0.0.1` |

Recorded events include user actions, sign-ins, salary modifications, leave approvals, and role updates, with old/new values and metadata captured server-side.
> No search or filter controls are currently shown on this page.

---

## 3. Organization & Platform Settings — `/settings`

Header: eyebrow `ADMINISTRATION`, title **"Organization & Platform Settings"**, description *"Configure company preferences, timezone, currency standards, and security policies."*

### Card A — Company Profile

| Field | Notes |
|-------|-------|
| **Organization Legal Name** | editable (defaults to session org name, e.g. `Acme Technologies`) |
| **Company Domain Identifier** | read-only, mono (e.g. `acme-technologies`) |
| **Timezone** | editable (default `America/New_York`) |
| **Base Currency** | editable (default `USD`) |

**Save Settings** button shows the toast *"Organization settings saved!"*.
> ⚠️ **Currently not implemented:** the form is local-only (no backend persistence yet).

### Card B — Security & Authentication Policy (read-only)

| Policy | Value |
|--------|-------|
| **Session Timeout** | `15 mins` — *Auto logout after 15 minutes of inactivity* |
| **Password Throttling** | `Enabled` — *Lock account after 5 failed login attempts* |
| **HTTP-only Secure Cookies** | `Enforced` (emerald) — *JWT Access & Refresh tokens in HTTP-only cookies* |

---

## Unknown routes

Any other URL inside the app (e.g. `/foo`) shows a placeholder page: title-case header of the slug, description *"This module is under active development."*, and an empty state **"{Title} is coming soon"** — *"We're building this feature for the next phase of the platform. Check back shortly."*
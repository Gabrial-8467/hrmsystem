# Module 3 — Leave & Approvals

This module covers applying for leave, defining leave entitlement policies, and reviewing approvals in one central place.

## Pages in this module

| Page | URL | Required permission |
|------|-----|---------------------|
| Leave Requests | `/leave` | `leave.view` |
| Leave Policies | `/leave/policies` | `leave.manage` |
| Approval Center | `/approvals` | `leave.approve` |

---

## 1. Leave Requests — `/leave`

Header: eyebrow `LEAVE MANAGEMENT`, title **"Leave Requests & Approval Workflows"**, description *"Apply for leave, manage leave balances, and review pending approval requests."*

### Apply for leave

Click **＋ Apply for Leave** → dialog **"Submit Leave Application"**:

| Field | Label | Notes |
|-------|-------|-------|
| Leave Type | *Select Leave Type* | dropdown of leave types, each shown as `{Name} ({days} days/yr)`; required |
| Start Date | *Start Date* | native date picker; required |
| End Date | *End Date* | native date picker; required (Start/End sit side-by-side) |
| Total Days | *Total Days* | number input, `min 0.5`, `step 0.5` — half days are entered as `0.5`; default `1`; required |
| Reason for Leave | *Reason for Leave* | text, placeholder `Family vacation or medical appointment...`; required |

Buttons: **Cancel** / **Submit Request** (disabled while submitting). Success toast: *"Leave request submitted!"*. Failure: *"Failed to submit leave request"*.

### Leave applications table — "Leave Applications"

| Column | Content |
|--------|---------|
| **Employee** | `{first} {last}` |
| **Leave Type** | e.g. `Annual Leave` |
| **Dates** | `{start} - {end}`, small gray text |
| **Duration** | bold, e.g. `5 days` |
| **Reason** | small text, truncated |
| **Status** | Badge — `APPROVED` = primary tint, `REJECTED` = red tint, `PENDING` = bordered outline |
| **Actions** | Shown **only for PENDING rows**: **Approve** (green check icon) and **Reject** (rose X icon). Each updates the status and shows *"Leave request status updated"*. |

There are no filter controls; the table lists all requests. Leave balances appear on the Dashboard and in Reports rather than this page.

---

## 2. Leave Policies — `/leave/policies`

Header: eyebrow `LEAVE MANAGEMENT`, title **"Leave Types & Quota Policies"**, description *"Configure annual leave entitlements, carry-forward limits, and paid leave rules."*

### Policy cards

Five entitlement policies are shown as a card grid. Each card contains:

- a **file-text icon tile**, the **policy name**, and its **code** in monospaced text;
- **Entitlement** — bold value, e.g. `18 days/yr`;
- **Type** — badge: `Paid Leave` (primary tint) or `Unpaid` (gray);
- **Carry Forward** — rule text.

| Policy | Code | Entitlement | Type | Carry Forward |
|--------|------|-------------|------|---------------|
| Annual Paid Leave | `AL` | 18 days/yr | Paid | Up to 5 days |
| Sick Leave | `SL` | 10 days/yr | Paid | Non-accumulative |
| Casual Leave | `CL` | 6 days/yr | Paid | Lapses Dec 31 |
| Maternity Leave | `ML` | 90 days | Paid | N/A |
| Paternity Leave | `PL` | 10 days | Paid | N/A |

> ⚠️ **Currently not implemented:** the **Add Policy** button is inert; policies are static data with no edit capability.

---

## 3. Approval Center — `/approvals`

Header: eyebrow `WORKFLOW OPERATIONS`, title **"Centralized Approval Center"**, description *"Review and act on pending leave requests, expense reimbursements, and attendance regularization requests."*

### Filter tabs

A tab row filters the queue:
- **All Requests (n)** — default
- **Leave (n)**
- **Expenses (n)**
- **Attendance (n)**

Counts update live; filtering is client-side.

### Approval cards

Each pending item is a card showing a badge, requester name (bold), a title, a date/detail line, and the reason, with **Approve** (green, check icon) and **Reject** (outline, rose X icon) buttons on the right.

1. **Leave** — badge `LEAVE` · title `Leave Request: {type} ({n} days)` · dates line · reason.
2. **Expense** — badge `EXPENSE` · title `Expense Claim: {category} (${amount})` · `Merchant: {merchant or N/A}` · payment description.
3. **Attendance** — badge `ATTENDANCE` · title `Attendance Correction (Check-In Override)` · `Requested Time: … (Original: …)` · reason.

Clicking **Approve** / **Reject** shows the toast `{Type} approval granted successfully!` or `{Type} approval request rejected.` and refreshes the list.
> ⚠️ **Currently not implemented:** approval actions are UI-only for now (toast + cache refresh) and do not call a server-side approve/reject endpoint yet.

### Empty state

When nothing is pending you see a full-width card: ✔ **"All approvals cleared!"** with *"There are no pending manager approvals at this time."*
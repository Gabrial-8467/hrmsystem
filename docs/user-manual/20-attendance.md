# Module 2 — Attendance

This module covers daily time tracking, self check-in/check-out, shift templates, and the holiday calendar.

## Pages in this module

| Page | URL | Required permission |
|------|-----|---------------------|
| Daily Attendance | `/attendance` | `attendance.view` |
| Shifts | `/shifts` | `shifts.view` |
| Holidays | `/holidays` | `holidays.view` |

---

## 1. Daily Attendance — `/attendance`

Header: eyebrow `ATTENDANCE`, title **"Daily Attendance & Time Tracking"**, description *"Track check-ins, check-outs, work hours, overtime, and late arrivals."*

### Self check-in / check-out

Two buttons at the top-right:

- **Check In Now** (green filled button, log-in icon) — records your attendance for today. On success you see *"Checked in successfully!"*.
- **Check Out** (outline button, log-out icon) — closes your attendance for the day. On success you see *"Checked out successfully!"*.

Both actions refresh the attendance list and dashboard summary automatically.

### Summary KPI cards

Four cards at the top of the page:
1. **Present Today**
2. **Late Arrivals**
3. **Avg. Work Hours** (e.g. `8.5 hrs`)
4. **Absent / On Leave**

> These KPI values are currently sample numbers displayed in the UI.

### Attendance log table — "Recent Attendance Log"

| Column | Content |
|--------|---------|
| **Employee** | `{first} {last}` name |
| **Date** | locale-formatted date |
| **Check In** | monospaced `HH:MM`, or `—` if none |
| **Check Out** | monospaced `HH:MM`, or `—` if none |
| **Work Hours** | `{n} hrs` |
| **Status** | Badge — `PRESENT` = primary tint, `LATE` = bordered outline, other values (e.g. `ABSENT`) = muted gray |

There are no date filters or manual record-entry dialogs; records are created via the self check-in/check-out buttons and corrections are handled in the Approval Center (Module 3).

---

## 2. Shifts — `/shifts`

Header: eyebrow `ATTENDANCE & SCHEDULES`, title **"Work Shifts & Timings"**, description *"Configure shift timings, break durations, grace periods, and overtime rules."*

### Shift cards

Three shift templates are displayed as a responsive card grid. Each card shows:

| Shift | Code | Timing | Break | Grace | Assigned |
|-------|------|--------|-------|-------|----------|
| Regular Morning Shift | `SH_MORN` | 09:00 AM – 06:00 PM | 60 mins | 15 mins | 38 members |
| Evening Shift | `SH_EVE` | 02:00 PM – 11:00 PM | 60 mins | 15 mins | 12 members |
| Night Shift | `SH_NIGHT` | 10:00 PM – 07:00 AM | 60 mins | 15 mins | 5 members |

Each card contains:
- A **calendar-clock icon tile**, the **shift name**, and the **code** in monospaced text.
- A primary-colored **timing line** (clock icon + e.g. `09:00 AM - 06:00 PM`).
- A two-column row: `Break: 60 mins` and `Grace: 15 mins`.
- A footer: **Assigned Employees** with a `38 members`-style badge.

> ⚠️ **Currently not implemented:** the **Create Shift** button has no dialog or API action; no editing exists. The cards are static display data.

---

## 3. Holidays — `/holidays`

Header: eyebrow `ATTENDANCE & SCHEDULES`, title **"Official Holiday Calendar 2026"**, description *"Public, regional, and company holidays for attendance and leave calculation."*

### Holiday table

| Column | Content |
|--------|---------|
| **Holiday Name** | Amber sun icon + name |
| **Date** | e.g. `Jan 1, 2026` |
| **Day of Week** | e.g. `Thursday` |
| **Type** | Secondary badge, e.g. `NATIONAL` |

Example rows: New Year's Day (Jan 1), Memorial Day (May 25), Independence Day (Jul 4), Labor Day (Sep 7), Thanksgiving Day (Nov 26), Christmas Day (Dec 25).

> ⚠️ **Currently not implemented:** the **Add Holiday** button is inert and the rows are static data for 2026. No edit/delete exists.
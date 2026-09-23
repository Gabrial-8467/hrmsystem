# Module 5 — Recruitment

This module covers job requisitions, the candidate pipeline (ATS), and interview scheduling.

## Pages in this module

| Page | URL | Required permission |
|------|-----|---------------------|
| Job Openings | `/recruitment/jobs` | `jobs.view` |
| Candidates | `/recruitment/candidates` | `candidates.view` |
| Interviews | `/recruitment/interviews` | `interviews.view` |

---

## 1. Job Openings — `/recruitment/jobs`

Header: eyebrow `RECRUITMENT & ATS`, title **"Job Openings & Requisitions"**, description *"Manage open requisitions, job descriptions, location requirements, and candidate pipelines."*

### Job cards

Jobs render as a responsive 1/2/3-column grid of cards. Each card shows:

- **Job title** (bold) with the **code** in monospaced text underneath.
- **Status badge** — `OPEN` = primary tint; `DRAFT` / `CLOSED` / `ON_HOLD` = gray.
- **Description** (clamped to 2 lines).
- A footer row:
  - **MapPin icon + location** (or `Remote` if none)
  - **Users icon + `{n} Applicants`** (candidate count)

> ⚠️ **Currently not implemented:** the **Post New Job** button is inert; no create/edit/close actions exist yet.

---

## 2. Candidate Pipeline — `/recruitment/candidates`

Header: eyebrow `RECRUITMENT & ATS`, title **"Candidate Pipeline & ATS"**, description *"Track job applicants through screening, interviews, technical evaluations, offers, and hiring."*

### View switcher

A segmented toggle in the header switches between **Board** (Kanban, default) and **Table** views. A **＋ Add Candidate** button sits beside it.
> ⚠️ **Currently not implemented:** Add Candidate is inert.

### Board (Kanban) view

Five stage columns, each with an uppercase header and a count badge:

`APPLIED · SCREENING · INTERVIEW · OFFER · HIRED`

Each candidate card shows:

- **Name** (bold) and **email** (small, truncated).
- The **job title** they applied for and a **★ rating** (amber, e.g. `4`).
- A **Move Next →** button (primary, full-width) that advances the candidate one stage (hidden for HIRED candidates). Moving shows the toast *"Moved candidate to {stage} stage!"*.
- Empty columns show a dashed *"No candidates"* box.

### Table view

| Column | Content |
|--------|---------|
| **Candidate** | Full name + email |
| **Applied Position** | Job title, or `General Application` |
| **Rating** | `★ {n} / 5` |
| **Pipeline Stage** | Badge — `HIRED` = primary tint, all other stages = gray |
| **Applied Date** | locale date |

---

## 3. Interviews — `/recruitment/interviews`

Header: eyebrow `RECRUITMENT & ATS`, title **"Interviews & Assessment Schedule"**, description *"Schedule candidate interviews, record scorecard feedback, and track hiring stages."*

### Interview cards

A 3-column grid of cards, one per interview:

| Candidate | Position | Stage | Time |
|-----------|----------|-------|------|
| David Chen | Senior React / Next.js Engineer | Technical Deep Dive | Tomorrow at 02:00 PM EST |
| Sarah Jenkins | Backend Specialist (Node/Fastify) | System Design | Sep 22, 2026 at 11:00 AM EST |
| Michael Scott | HR Business Partner | Culture & HR Sync | Sep 20, 2026 at 04:00 PM EST |

Each card shows the candidate name (bold) with a `SCHEDULED` badge (primary tint), the position under it, a primary **clock line** with the date/time, and a footer `Stage: {stage}`.

> ⚠️ **Currently not implemented:** the **Schedule Interview** button is inert and the list is static sample data.
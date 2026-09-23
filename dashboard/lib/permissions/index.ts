/**
 * Centralized permission keys. Mirrors the backend permission registry
 * (`backend/src/config/permissions.ts`). The frontend uses these ONLY for UI
 * decisions — the backend always re-enforces authorization.
 */
export const P = {
  organizationView: "organization.view",
  organizationUpdate: "organization.update",
  platformManage: "platform.manage",
  analyticsView: "analytics.view",

  usersView: "users.view",
  usersCreate: "users.create",
  usersUpdate: "users.update",
  usersDelete: "users.delete",
  rolesView: "roles.view",
  rolesManage: "roles.manage",

  employeesView: "employees.view",
  employeesCreate: "employees.create",
  employeesUpdate: "employees.update",
  employeesDelete: "employees.delete",

  departmentsView: "departments.view",
  departmentsManage: "departments.manage",
  branchesView: "branches.view",
  branchesManage: "branches.manage",
  designationsView: "designations.view",
  designationsManage: "designations.manage",

  attendanceView: "attendance.view",
  attendanceSelf: "attendance.self",
  attendanceManage: "attendance.manage",
  attendanceCorrect: "attendance.correct",
  attendanceApprove: "attendance.approve",

  shiftsView: "shifts.view",
  shiftsManage: "shifts.manage",
  holidaysView: "holidays.view",
  holidaysManage: "holidays.manage",

  leaveView: "leave.view",
  leaveCreate: "leave.create",
  leaveApprove: "leave.approve",
  leaveManage: "leave.manage",

  payrollView: "payroll.view",
  payrollProcess: "payroll.process",
  payrollApprove: "payroll.approve",
  salaryView: "salary.view",
  salaryManage: "salary.manage",
  payslipsView: "payslips.view",
  payslipsSelf: "payslips.self",

  jobsView: "jobs.view",
  jobsManage: "jobs.manage",
  candidatesView: "candidates.view",
  candidatesManage: "candidates.manage",
  interviewsView: "interviews.view",
  interviewsManage: "interviews.manage",

  onboardingView: "onboarding.view",
  onboardingSelf: "onboarding.self",
  onboardingManage: "onboarding.manage",

  performanceView: "performance.view",
  performanceManage: "performance.manage",
  performanceSelf: "performance.self",

  expensesView: "expenses.view",
  expensesCreate: "expenses.create",
  expensesApprove: "expenses.approve",
  expensesPay: "expenses.pay",

  assetsView: "assets.view",
  assetsManage: "assets.manage",

  documentsView: "documents.view",
  documentsUpload: "documents.upload",
  documentsManage: "documents.manage",

  announcementsView: "announcements.view",
  announcementsManage: "announcements.manage",

  helpdeskTicketView: "helpdesk.ticket.view",
  helpdeskTicketCreate: "helpdesk.ticket.create",
  helpdeskTicketManage: "helpdesk.ticket.manage",

  reportsView: "reports.view",
  auditView: "audit.view",
  settingsView: "settings.view",
  settingsManage: "settings.manage",

  notificationsView: "notifications.view",
} as const;

export function can(permissions: string[] | undefined, required: string): boolean {
  return permissions?.includes(required) ?? false;
}

export function canAny(permissions: string[] | undefined, required: string[]): boolean {
  return required.some((r) => permissions?.includes(r) ?? false);
}
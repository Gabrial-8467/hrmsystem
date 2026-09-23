/**
 * Centralized permission registry.
 *
 * Every permission in the entire application is declared here. Permissions are
 * synced into the database and assigned to roles. Authorization checks always
 * reference these keys — never free-form strings.
 */

export interface PermissionDefinition {
  key: string;
  module: string;
  name: string;
  description?: string;
}

export const PERMISSIONS: readonly PermissionDefinition[] = [
  // ----- Organization / platform -----
  perm('organization', 'organization.view', 'View organization'),
  perm('organization', 'organization.update', 'Update organization'),
  perm('platform', 'platform.manage', 'Manage platform (tenants, plans, config)'),
  perm('platform', 'analytics.view', 'View platform analytics'),

  // ----- Users / Roles -----
  perm('users', 'users.view', 'View users'),
  perm('users', 'users.create', 'Create users'),
  perm('users', 'users.update', 'Update users'),
  perm('users', 'users.delete', 'Delete users'),
  perm('roles', 'roles.view', 'View roles'),
  perm('roles', 'roles.manage', 'Create and update roles'),

  // ----- Employees -----
  perm('employees', 'employees.view', 'View employees'),
  perm('employees', 'employees.create', 'Create employees'),
  perm('employees', 'employees.update', 'Update employees'),
  perm('employees', 'employees.delete', 'Delete employees'),

  // ----- Organization structure -----
  perm('departments', 'departments.view', 'View departments'),
  perm('departments', 'departments.manage', 'Manage departments'),
  perm('branches', 'branches.view', 'View branches'),
  perm('branches', 'branches.manage', 'Manage branches'),
  perm('designations', 'designations.view', 'View designations'),
  perm('designations', 'designations.manage', 'Manage designations'),

  // ----- Attendance -----
  perm('attendance', 'attendance.view', 'View attendance'),
  perm('attendance', 'attendance.self', 'Mark own attendance'),
  perm('attendance', 'attendance.manage', 'Manage attendance records'),
  perm('attendance', 'attendance.correct', 'Request/approve attendance correction'),
  perm('attendance', 'attendance.approve', 'Approve attendance'),

  // ----- Shifts & Holidays -----
  perm('shifts', 'shifts.view', 'View shifts'),
  perm('shifts', 'shifts.manage', 'Manage shifts'),
  perm('holidays', 'holidays.view', 'View holidays'),
  perm('holidays', 'holidays.manage', 'Manage holidays'),

  // ----- Leave -----
  perm('leave', 'leave.view', 'View leave requests'),
  perm('leave', 'leave.create', 'Apply for leave'),
  perm('leave', 'leave.approve', 'Approve leave'),
  perm('leave', 'leave.manage', 'Manage leave types and policies'),

  // ----- Payroll -----
  perm('payroll', 'payroll.view', 'View payroll'),
  perm('payroll', 'payroll.process', 'Process payroll'),
  perm('payroll', 'payroll.approve', 'Approve payroll'),
  perm('salary', 'salary.view', 'View salary structures'),
  perm('salary', 'salary.manage', 'Manage salary structures'),
  perm('payslips', 'payslips.view', 'View payslips'),
  perm('payslips', 'payslips.self', 'View own payslip'),

  // ----- Recruitment -----
  perm('recruitment', 'jobs.view', 'View job openings'),
  perm('recruitment', 'jobs.manage', 'Manage job openings'),
  perm('recruitment', 'candidates.view', 'View candidates'),
  perm('recruitment', 'candidates.manage', 'Manage candidates'),
  perm('recruitment', 'interviews.view', 'View interviews'),
  perm('recruitment', 'interviews.manage', 'Schedule and manage interviews'),

  // ----- Onboarding -----
  perm('onboarding', 'onboarding.view', 'View onboarding progress'),
  perm('onboarding', 'onboarding.self', 'Complete your own onboarding tasks'),
  perm('onboarding', 'onboarding.manage', 'Manage onboarding workflows'),

  // ----- Performance -----
  perm('performance', 'performance.view', 'View performance reviews'),
  perm('performance', 'performance.manage', 'Manage performance reviews'),
  perm('performance', 'performance.self', 'Self assessment'),

  // ----- Expenses -----
  perm('expenses', 'expenses.view', 'View expenses'),
  perm('expenses', 'expenses.create', 'Submit expenses'),
  perm('expenses', 'expenses.approve', 'Approve expenses'),
  perm('expenses', 'expenses.pay', 'Mark expenses as paid'),

  // ----- Assets -----
  perm('assets', 'assets.view', 'View assets'),
  perm('assets', 'assets.manage', 'Manage assets and assignments'),

  // ----- Documents -----
  perm('documents', 'documents.view', 'View documents'),
  perm('documents', 'documents.upload', 'Upload documents'),
  perm('documents', 'documents.manage', 'Manage documents (verify, delete)'),

  // ----- Announcements -----
  perm('announcements', 'announcements.view', 'View announcements'),
  perm('announcements', 'announcements.manage', 'Create announcements'),

  // ----- Helpdesk -----
  perm('helpdesk', 'helpdesk.ticket.view', 'View helpdesk tickets'),
  perm('helpdesk', 'helpdesk.ticket.create', 'Create helpdesk tickets'),
  perm('helpdesk', 'helpdesk.ticket.manage', 'Assign and resolve helpdesk tickets'),

  // ----- Reports & Audit -----
  perm('reports', 'reports.view', 'View reports'),
  perm('audit', 'audit.view', 'View audit logs'),
  perm('settings', 'settings.view', 'View organization settings'),
  perm('settings', 'settings.manage', 'Manage organization settings'),

  // ----- Notifications -----
  perm('notifications', 'notifications.view', 'View notifications'),
];

function perm(module: string, key: string, name: string, description?: string): PermissionDefinition {
  return { module, key, name, description };
}

/** Set of all permission keys for fast membership checks. */
export const PERMISSION_KEYS: ReadonlySet<string> = new Set(
  PERMISSIONS.map((p) => p.key),
);

/** Group permissions by module for UI / role editors. */
export function permissionsByModule(): Record<string, PermissionDefinition[]> {
  return PERMISSIONS.reduce<Record<string, PermissionDefinition[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {});
}

/**
 * System role definitions. `code` is stable and used when an organization is
 * provisioned. Platform roles have scope PLATFORM and no organizationId.
 */
export interface SystemRoleDefinition {
  code: string;
  name: string;
  description: string;
  scope: 'PLATFORM' | 'ORGANIZATION';
  permissions: string[];
}

export const SUPERSET_KEY = '*';

export const SYSTEM_ROLES: readonly SystemRoleDefinition[] = [
  {
    code: 'SUPER_ADMIN',
    name: 'Super Admin',
    description: 'Platform-level administrator with full access.',
    scope: 'PLATFORM',
    permissions: [SUPERSET_KEY],
  },
  {
    code: 'ORG_ADMIN',
    name: 'Organization Admin',
    description: 'Full administrative access within an organization.',
    scope: 'ORGANIZATION',
    permissions: [SUPERSET_KEY],
  },
  {
    code: 'HR_MANAGER',
    name: 'HR Manager',
    description: 'Operational HR access across the organization.',
    scope: 'ORGANIZATION',
    permissions: [
      'employees.view', 'employees.create', 'employees.update', 'employees.delete',
      'departments.view', 'departments.manage',
      'branches.view', 'branches.manage',
      'designations.view', 'designations.manage',
      'attendance.view', 'attendance.manage', 'attendance.correct', 'attendance.approve',
      'shifts.view', 'shifts.manage',
      'holidays.view', 'holidays.manage',
      'leave.view', 'leave.create', 'leave.approve', 'leave.manage',
      'jobs.view', 'jobs.manage',
      'candidates.view', 'candidates.manage',
      'interviews.view', 'interviews.manage',
      'onboarding.view', 'onboarding.manage',
      'performance.view', 'performance.manage',
      'expenses.view', 'expenses.approve',
      'assets.view', 'assets.manage',
      'documents.view', 'documents.upload', 'documents.manage',
      'announcements.view', 'announcements.manage',
      'helpdesk.ticket.view', 'helpdesk.ticket.manage',
      'reports.view', 'audit.view',
      'settings.view', 'settings.manage',
      'notifications.view',
      'users.view', 'users.create', 'users.update',
      'roles.view',
      'organization.view', 'organization.update',
      'payroll.view', 'salary.view', 'payslips.view',
    ],
  },
  {
    code: 'HR_ADMIN',
    name: 'HR Admin',
    description: 'HR-specific operational access (legacy alias of HR Manager).',
    scope: 'ORGANIZATION',
    permissions: [
      'employees.view', 'employees.create', 'employees.update', 'employees.delete',
      'departments.view', 'departments.manage',
      'branches.view', 'branches.manage',
      'designations.view', 'designations.manage',
      'attendance.view', 'attendance.manage', 'attendance.correct', 'attendance.approve',
      'shifts.view', 'shifts.manage',
      'holidays.view', 'holidays.manage',
      'leave.view', 'leave.create', 'leave.approve', 'leave.manage',
      'jobs.view', 'jobs.manage',
      'candidates.view', 'candidates.manage',
      'interviews.view', 'interviews.manage',
      'onboarding.view', 'onboarding.manage',
      'performance.view', 'performance.manage',
      'expenses.view', 'expenses.approve',
      'assets.view', 'assets.manage',
      'documents.view', 'documents.upload', 'documents.manage',
      'announcements.view', 'announcements.manage',
      'helpdesk.ticket.view', 'helpdesk.ticket.manage',
      'reports.view', 'audit.view',
      'settings.view', 'settings.manage',
      'users.view', 'users.create', 'users.update',
      'roles.view',
      'organization.view', 'organization.update',
      'payroll.view', 'salary.view', 'payslips.view',
    ],
  },
  {
    code: 'MANAGER',
    name: 'Department Manager',
    description: 'Can manage employees in their department.',
    scope: 'ORGANIZATION',
    permissions: [
      'employees.view', 'employees.update',
      'attendance.view',
      'onboarding.self',
      'leave.view', 'leave.create', 'leave.approve',
      'expenses.view', 'expenses.approve',
      'performance.view', 'performance.manage', 'performance.self',
      'reports.view',
      'helpdesk.ticket.view', 'helpdesk.ticket.create',
      'announcements.view', 'notifications.view',
      'payslips.view', 'payslips.self',
      'attendance.self',
      'documents.view',
    ],
  },
  {
    code: 'ACCOUNTANT',
    name: 'Accountant / Payroll Manager',
    description: 'Access to payroll, salary, expenses, loans and financial reports.',
    scope: 'ORGANIZATION',
    permissions: [
      'payroll.view', 'payroll.process', 'payroll.approve',
      'salary.view', 'salary.manage',
      'payslips.view', 'payslips.self',
      'expenses.view', 'expenses.approve', 'expenses.pay',
      'employees.view',
      'reports.view',
      'attendance.view',
      'leave.view',
      'announcements.view', 'notifications.view',
    ],
  },
  {
    code: 'EMPLOYEE',
    name: 'Employee',
    description: 'Employee self-service access.',
    scope: 'ORGANIZATION',
    permissions: [
      'employees.view',
      'onboarding.self',
      'attendance.self',
      'leave.view',
      'leave.create',
      'expenses.create',
      'payslips.self',
      'performance.self',
      'documents.view', 'documents.upload',
      'helpdesk.ticket.view', 'helpdesk.ticket.create',
      'announcements.view', 'notifications.view',
    ],
  },
];

/** Roles whose permission set is fully open within their scope. */
export function isSupersetRole(def: SystemRoleDefinition): boolean {
  return def.permissions.includes(SUPERSET_KEY);
}
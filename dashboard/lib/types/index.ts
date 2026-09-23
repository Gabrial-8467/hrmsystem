export interface OrganizationInfo {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  timezone: string;
  currency: string;
  logoUrl: string | null;
}

export interface UserRole {
  id: string;
  code: string;
  name: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
  title: string | null;
  locale: string;
  emailVerified: boolean;
  organization: OrganizationInfo | null;
  roles: UserRole[];
  permissions: string[];
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
}

export interface AuthSession {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    organizationId: string;
    status: string;
    roles: UserRole[];
    permissions: string[];
    isSuperAdmin: boolean;
    mustChangePassword: boolean;
  };
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
  refreshToken: string;
}

export type LoginResponse = AuthSession;

export interface ListResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type PageQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
};

export interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  title: string | null;
  phone: string | null;
  status: string;
  avatarUrl: string | null;
  lastLoginAt: string | null;
  roles: UserRole[];
  createdAt: string;
  updatedAt: string;
}

export interface RoleSummary {
  id: string;
  name: string;
  code: string;
  description: string | null;
  scope: string;
  isSystem: boolean;
  isActive: boolean;
  userCount: number;
  permissions: string[];
}

export interface RoleDraft {
  name: string;
  code: string;
  description?: string | null;
  permissions: string[];
}

export interface PermissionInfo {
  id: string;
  key: string;
  module: string;
  name: string;
  description: string | null;
}

export interface PermissionGroup {
  module: string;
  permissions: { key: string; name: string; description?: string | null }[];
}

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  logoUrl: string | null;
  timezone: string;
  currency: string;
  userCount: number;
  roleCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  oldValue: unknown;
  newValue: unknown;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  user: { id: string; name: string; email: string } | null;
  createdAt: string;
}

/** Dashboard summary feed (matches backend /api/v1/dashboard/summary). */
export interface DashboardSummary {
  generatedAt: string;
  kpi: {
    totalEmployees: number;
    activeEmployees: number;
    newEmployees: number;
    presentToday: number;
    lateToday: number;
    pendingLeaves: number;
    payrollDue: number;
  };
  departmentDistribution: {
    name: string;
    count: number;
  }[];
  branchDistribution?: {
    name: string;
    city?: string;
    count: number;
  }[];
  attendanceTrend: {
    date: string;
    present: number;
    late: number;
    workFromHome: number;
    absent: number;
  }[];
  payrollTrend: {
    period: string;
    year: number;
    status: string;
    totalGross: number;
    totalDeductions: number;
    totalNet: number;
  }[];
  recruitmentFunnel: Record<string, number>;
  leaveStatus: Record<string, number>;
  assetBreakdown: Record<string, number>;
  expenseBreakdown: Record<string, { count: number; amount: number }>;
  hiringTrend: {
    month: string;
    count: number;
  }[];
  employmentMix: {
    type: string;
    label: string;
    count: number;
  }[];
  expenseCategories: {
    category: string;
    count: number;
    amount: number;
  }[];
  leaveUsageByType: {
    name: string;
    days: number;
    requests: number;
  }[];
  workHoursTrend: {
    month: string;
    hours: number;
  }[];
  attendanceRateByDept: {
    name: string;
    rate: number;
  }[];
  activity: {
    id: string;
    actor: string;
    action: string;
    label: string | null;
    entity: string;
    entityId: string | null;
    createdAt: string;
  }[];
  overview: {
    headcount: {
      total: number;
      active: number;
      newThisMonth: number;
    };
    designationCount: number;
    branchCount: number;
    shiftCount: number;
    holidays: {
      total: number;
      upcoming: { id: string; name: string; date: string; type: string }[];
    };
    attendance: {
      today: Record<string, number>;
      month: Record<string, number>;
    };
    leave: {
      leaveTypes: number;
      pending: number;
      approved: number;
      onLeaveToday: number;
    };
    payroll: {
      runs: number;
      payslips: number;
      latest: { month: number; year: number; status: string; totalNet: number } | null;
    };
    recruitment: {
      openJobs: number;
      candidates: number;
      upcomingInterviews: {
        id: string;
        candidate: string;
        job: string;
        scheduledAt: string;
        stage: string;
      }[];
    };
    performance: {
      cycles: number;
      reviews: number;
      goals: number;
    };
    assets: {
      total: number;
      allocated: number;
      available: number;
    };
    expenses: {
      total: number;
      pending: number;
      pendingAmount: number;
    };
    announcements: number;
    documents: number;
  };
}

/** Self-scoped dashboard for the signed-in user (matches /api/v1/dashboard/me). */
export interface MyDashboard {
  generatedAt: string;
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    joiningDate: string;
    employmentType: string;
    status: string;
    email: string | null;
    department: string | null;
    designation: string | null;
    manager: { id: string; name: string } | null;
  } | null;
  attendance: {
    today: {
      status: string;
      checkIn: string | null;
      checkOut: string | null;
      workHours: number;
    } | null;
    month: Record<string, number>;
    monthWorkHours: number;
  } | null;
  leave: {
    balances: {
      id: string;
      name: string;
      code: string;
      allocated: number;
      used: number;
      pending: number;
      carriedOver: number;
      available: number;
    }[];
  } | null;
  payslip: {
    id: string;
    month: number;
    year: number;
    status: string;
    payslipStatus: string;
    basicSalary: number;
    allowances: number;
    deductions: number;
    netPay: number;
  } | null;
  holidays: { id: string; name: string; date: string; type: string }[];
  announcements: { id: string; title: string; content: string; publishedAt: string }[];
  pendingRequests: number;
  pendingExpenses: number;
  assetCount: number;
}
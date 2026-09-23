import {
  LayoutDashboard,
  Users,
  Building2,
  Briefcase,
  Fingerprint,
  CalendarClock,
  Sun,
  CalendarDays,
  FileText,
  Wallet,
  Banknote,
  CreditCard,
  UserPlus,
  Network,
  CalendarCheck2,
  TrendingUp,
  Receipt,
  Package,
  FolderOpen,
  BarChart3,
  Megaphone,
  LifeBuoy,
  Settings,
  ShieldCheck,
  UserCog,
  Network as HierarchyIcon,
  CheckSquare,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { P } from "@/lib/permissions";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Permission or permissions required to see the item. Omit = always visible. */
  permission?: string | string[];
  badge?: string;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "People",
    items: [
      { label: "Employees", href: "/employees", icon: Users, permission: P.employeesView },
      { label: "Departments", href: "/departments", icon: Building2, permission: P.departmentsView },
      { label: "Designations", href: "/designations", icon: Briefcase, permission: P.designationsView },
      { label: "Org Hierarchy", href: "/org-chart", icon: HierarchyIcon, permission: P.employeesView },
      {
        label: "Onboarding",
        href: "/onboarding",
        icon: UserCheck,
        permission: [P.onboardingView, P.onboardingSelf],
      },
    ],
  },
  {
    label: "Attendance",
    items: [
      { label: "Attendance", href: "/attendance", icon: Fingerprint, permission: P.attendanceView },
      { label: "Shifts", href: "/shifts", icon: CalendarClock, permission: P.shiftsView },
      { label: "Holidays", href: "/holidays", icon: Sun, permission: P.holidaysView },
    ],
  },
  {
    label: "Leave & Approvals",
    items: [
      { label: "Leave Requests", href: "/leave", icon: CalendarDays, permission: P.leaveView },
      { label: "Approval Center", href: "/approvals", icon: CheckSquare, permission: P.leaveApprove },
      { label: "Leave Policies", href: "/leave/policies", icon: FileText, permission: P.leaveManage },
    ],
  },
  {
    label: "Payroll",
    items: [
      { label: "Payroll", href: "/payroll", icon: Wallet, permission: P.payrollView },
      { label: "Salary", href: "/payroll/salary", icon: Banknote, permission: P.salaryView },
      { label: "Payslips", href: "/payroll/payslips", icon: CreditCard, permission: P.payslipsView },
    ],
  },
  {
    label: "Recruitment",
    items: [
      { label: "Jobs", href: "/recruitment/jobs", icon: UserPlus, permission: P.jobsView },
      { label: "Candidates", href: "/recruitment/candidates", icon: Network, permission: P.candidatesView },
      { label: "Interviews", href: "/recruitment/interviews", icon: CalendarCheck2, permission: P.interviewsView },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Performance", href: "/performance", icon: TrendingUp, permission: P.performanceView },
      { label: "Expenses", href: "/expenses", icon: Receipt, permission: P.expensesView },
      { label: "Assets", href: "/assets", icon: Package, permission: P.assetsView },
      { label: "Documents", href: "/documents", icon: FolderOpen, permission: P.documentsView },
      { label: "Announcements", href: "/announcements", icon: Megaphone, permission: P.announcementsView },
      { label: "Helpdesk", href: "/helpdesk", icon: LifeBuoy, permission: P.helpdeskTicketView },
    ],
  },
  {
    label: "Insights",
    items: [{ label: "Reports", href: "/reports", icon: BarChart3, permission: P.reportsView }],
  },
  {
    label: "Administration",
    items: [
      { label: "Users & Roles", href: "/settings/users", icon: UserCog, permission: P.usersView },
      { label: "Audit Logs", href: "/settings/audit", icon: ShieldCheck, permission: P.auditView },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];
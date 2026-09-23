"use client";

import {
  Sparkles,
  Plus,
  LogIn,
  TrendingUp,
  CheckCircle2,
  Clock,
  Wallet,
  LayoutGrid,
  Building2,
  Briefcase,
  CalendarClock,
  CalendarDays,
  Activity,
  StickyNote,
  UserPlus,
  Receipt,
  Package,
  Megaphone,
  FolderOpen,
  ArrowUpRight,
  ShieldCheck,
  CalendarCheck2,
  Users,
  PieChart as PieChartIcon,
  HeartPulse,
  CheckSquare,
  Network,
} from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { useSession } from "@/lib/auth/session";
import { fetchDashboardSummary } from "@/lib/api/auth";
import type { DashboardSummary } from "@/lib/types";
import { P } from "@/lib/permissions";
import { EmployeeDashboard } from "./employee-dashboard";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { timeAgo, slugToTitle, cn } from "@/lib/utils";
import {
  CHART_COLORS,
  currencySymbol,
  DonutCard,
  HeadcountCard,
  SectionHeading,
  type DonutSlice,
  type HeadcountRow,
} from "./charts/shared";
import { KpiCard } from "./charts/kpi-card";
import { AttendanceTrendCard } from "./charts/attendance-trend";
import { PayrollTrendCard } from "./charts/payroll-trend";
import { OperationalHealthCard } from "./charts/operational-health";
import { RecruitmentFunnelCard } from "./charts/recruitment-funnel";
import { HiringTrendCard } from "./charts/hiring-trend";
import { EmploymentMixCard } from "./charts/employment-mix";
import { ExpenseCategoriesCard } from "./charts/expense-categories";
import { LeaveUsageCard } from "./charts/leave-usage";
import { WorkHoursTrendCard } from "./charts/work-hours-trend";
import { AttendanceRateCard } from "./charts/attendance-rate";

function buildDonut(
  map: Record<string, number>,
  defs: { key: string; label: string; color: string }[],
  total: number,
): DonutSlice[] {
  return defs
    .map((d) => ({
      label: d.label,
      count: map[d.key] ?? 0,
      color: d.color,
      percent: total > 0 ? Math.round(((map[d.key] ?? 0) / total) * 100) : 0,
    }))
    .filter((item) => item.count > 0);
}

export function DashboardView() {
  const { user, orgName, roleName, hasPermission } = useSession();
  const reportsView = hasPermission(P.reportsView);
  const [timeRange, setTimeRange] = useState<"today" | "month" | "quarter">("month");

  const { data, isPending, isError, refetch } = useQuery<DashboardSummary>({
    queryKey: ["dashboard", "summary"],
    queryFn: fetchDashboardSummary,
    enabled: reportsView,
    staleTime: 60_000,
  });

  if (!reportsView) {
    return <EmployeeDashboard />;
  }

  if (isPending) {
    return <DashboardSkeleton />;
  }

  if (isError || !data) {
    return (
      <div className="page-container">
        <ErrorState
          title="Couldn't load your dashboard"
          error={undefined}
          retry={() => void refetch()}
        />
      </div>
    );
  }

  const kpi = data.kpi;
  const overview = data.overview;
  const symbol = currencySymbol(user?.organization?.currency);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const todayMap = overview.attendance.today;
  const todayTotal = Object.values(todayMap).reduce((sum, v) => sum + (v ?? 0), 0);

  const todaySlices = buildDonut(
    todayMap,
    [
      { key: "PRESENT", label: "Present On-Site", color: "#10b981" },
      { key: "WORK_FROM_HOME", label: "Work From Home", color: "#3b82f6" },
      { key: "LATE", label: "Late Arrivals", color: "#a855f7" },
      { key: "ABSENT", label: "Absent / Leave", color: "#f43f5e" },
    ],
    todayTotal,
  );

  const upcomingEvents = [
    ...overview.holidays.upcoming.map((h) => ({
      type: "HOLIDAY" as const,
      name: h.name,
      title: `${h.type} holiday`,
      date: format(new Date(h.date), "MMM d, yyyy"),
    })),
    ...overview.recruitment.upcomingInterviews.map((i) => ({
      type: "INTERVIEW" as const,
      name: i.candidate,
      title: `${i.job} · ${i.stage}`,
      date: format(new Date(i.scheduledAt), "MMM d"),
    })),
  ];

  const periodLabel =
    timeRange === "today"
      ? "Today"
      : timeRange === "month"
        ? format(new Date(), "MMM yyyy")
        : `Q${Math.floor(new Date().getMonth() / 3) + 1} ${new Date().getFullYear()}`;

  const presentRatio = Math.round((kpi.presentToday / (kpi.totalEmployees || 1)) * 100);

  const workforceSpark = (data.attendanceTrend ?? []).map((d) => d.present ?? 0);
  const attendanceSpark = (data.attendanceTrend ?? []).map((d) => d.present + d.late + d.workFromHome);
  const approvalsSpark = Object.values(data.leaveStatus ?? {});
  const payrollSpark = [...(data.payrollTrend ?? [])]
    .sort((a, b) => a.year - b.year || a.period.localeCompare(b.period))
    .map((p) => p.totalNet ?? 0);

  const deptRows: HeadcountRow[] = (data.departmentDistribution ?? []).map((d) => ({
    name: d.name,
    count: d.count,
    caption: "employees",
  }));

  const headcountCap = Math.max(0, ...deptRows.map((r) => r.count)) || 1;

  const totalHires = (data.hiringTrend ?? []).reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="page-container space-y-6">
      {/* ============ Executive Welcome Hero ============ */}
      <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-br from-indigo-600 via-primary to-violet-600 p-6 sm:p-8 shadow-lg shadow-primary/10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle, rgb(255 255 255 / 0.18) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            maskImage: "radial-gradient(ellipse at top left, black 20%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse at top left, black 20%, transparent 75%)",
          }}
        />
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-20 -right-10 size-64 rounded-full bg-white/15 blur-3xl" />
          <div className="absolute -bottom-24 left-1/4 size-72 rounded-full bg-fuchsia-400/25 blur-3xl" />
          <div className="absolute top-1/2 left-1/2 size-40 -translate-x-1/2 rounded-full bg-sky-300/20 blur-3xl" />
        </div>

        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                <Sparkles className="size-3 text-amber-300" /> {roleName}
              </span>
              <span className="text-xs text-white/70">• {orgName}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white [text-shadow:0_1px_20px_rgb(0_0_0/0.15)]">
              {getGreeting()}, {user?.firstName ?? "Admin"} <span className="ml-0.5">👋</span>
            </h1>
            <p className="text-xs sm:text-sm text-white/80 max-w-xl">
              Here is your workforce analytics, attendance breakdown, payroll trend, and
              operational health summary for {periodLabel.toLowerCase()}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="flex items-center gap-0.5 rounded-lg border border-white/25 bg-white/10 p-0.5 backdrop-blur-sm">
              {(
                [
                  ["today", "Today"],
                  ["month", "This Month"],
                  ["quarter", `Q${Math.floor(new Date().getMonth() / 3) + 1} ${new Date().getFullYear()}`],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setTimeRange(val)}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                    timeRange === val
                      ? "bg-white text-indigo-700 shadow-sm"
                      : "text-white/80 hover:text-white hover:bg-white/10",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {hasPermission(P.employeesCreate) && (
              <Link href="/employees">
                <Button size="sm" className="gap-1.5 bg-white text-indigo-700 shadow-sm hover:bg-white/90">
                  <Plus className="size-4" /> Add Employee
                </Button>
              </Link>
            )}
            <Link href="/attendance">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-white/35 bg-white/10 text-white shadow-sm hover:bg-white/20 hover:text-white"
              >
                <LogIn className="size-4 text-emerald-300" /> Check In
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* ============ Workforce KPI Grid ============ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Workforce"
          value={kpi.totalEmployees}
          icon={<Users className="size-5" />}
          chip="bg-gradient-to-br from-emerald-500 to-teal-600"
          delta={{ text: `+${kpi.newEmployees} new this month`, up: true }}
          glow="hover:shadow-emerald-500/10"
          sparkline={workforceSpark}
          sparkColor={CHART_COLORS.PRESENT}
        />
        <KpiCard
          label="Attendance Rate"
          value={presentRatio}
          suffix="%"
          icon={<CheckCircle2 className="size-5" />}
          chip="bg-gradient-to-br from-blue-500 to-indigo-600"
          caption={`${kpi.presentToday} of ${kpi.totalEmployees} present today`}
          glow="hover:shadow-blue-500/10"
          sparkline={attendanceSpark}
          sparkColor={CHART_COLORS.WORK_FROM_HOME}
        />
        <KpiCard
          label="Pending Approvals"
          value={kpi.pendingLeaves}
          icon={<Clock className="size-5" />}
          chip="bg-gradient-to-br from-amber-500 to-orange-600"
          delta={{ text: "Requires manager action", up: false }}
          glow="hover:shadow-amber-500/10"
          sparkline={approvalsSpark}
          sparkColor={CHART_COLORS.PENDING}
        />
        <KpiCard
          label={`Payroll · ${periodLabel}`}
          value={kpi.payrollDue}
          currency
          currencySymbol={symbol}
          icon={<Wallet className="size-5" />}
          chip="bg-gradient-to-br from-violet-500 to-fuchsia-600"
          caption="Net disbursement"
          glow="hover:shadow-violet-500/10"
          sparkline={payrollSpark}
          sparkColor="#8b5cf6"
        />
      </div>

      {/* ============ Module Overview ============ */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
              <LayoutGrid className="size-4 text-primary" /> Everything at a Glance
            </h2>
            <p className="text-xs text-muted-foreground">
              Real-time overview across every HRMS module — click any tile to deep-dive.
            </p>
          </div>
          <Badge variant="outline" className="text-[10px] shrink-0">
            <span className="relative flex size-1.5">
              <span aria-hidden className="absolute inline-flex size-full rounded-full bg-emerald-400 opacity-50 animate-ping" />
              <span aria-hidden className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
            </span>
            Live data
          </Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <ModuleTile
            href="/employees"
            icon={<Users className="size-4" />}
            title="Employees"
            value={String(kpi.totalEmployees)}
            caption={`${overview.headcount.active} active · ${overview.headcount.newThisMonth} new/mo`}
            tone="from-emerald-500 to-teal-600"
          />
          <ModuleTile
            href="/departments"
            icon={<Building2 className="size-4" />}
            title="Departments"
            value={String(data.departmentDistribution?.length ?? 0)}
            caption="Structural units"
            tone="from-blue-500 to-indigo-600"
          />
          <ModuleTile
            href="/designations"
            icon={<Briefcase className="size-4" />}
            title="Designations"
            value={String(overview.designationCount)}
            caption="Job titles defined"
            tone="from-violet-500 to-purple-600"
          />
          <ModuleTile
            href="/shifts"
            icon={<CalendarClock className="size-4" />}
            title="Shifts"
            value={String(overview.shiftCount)}
            caption="Shift templates"
            tone="from-cyan-500 to-sky-600"
          />
          <ModuleTile
            href="/holidays"
            icon={<CalendarDays className="size-4" />}
            title="Holidays"
            value={String(overview.holidays.total)}
            caption={
              overview.holidays.upcoming[0]?.name
                ? `Next: ${overview.holidays.upcoming[0].name}`
                : "None scheduled"
            }
            tone="from-amber-500 to-orange-600"
          />
          <ModuleTile
            href="/attendance"
            icon={<Activity className="size-4" />}
            title="Attendance"
            value={String(kpi.presentToday)}
            caption={`${kpi.lateToday} late · ${kpi.totalEmployees} total emp.`}
            tone="from-emerald-500 to-green-600"
          />
          <ModuleTile
            href="/leave"
            icon={<StickyNote className="size-4" />}
            title="Leave"
            value={String(overview.leave.onLeaveToday)}
            caption={`${overview.leave.pending} pending · ${overview.leave.approved} approved`}
            tone="from-rose-500 to-pink-600"
          />
          <ModuleTile
            href="/payroll"
            icon={<Wallet className="size-4" />}
            title="Payroll"
            value={
              typeof overview.payroll.latest?.totalNet === "number"
                ? `${symbol}${Math.round(overview.payroll.latest.totalNet).toLocaleString()}`
                : `${overview.payroll.runs} runs`
            }
            caption={`${overview.payroll.payslips} payslips generated`}
            tone="from-sky-500 to-blue-600"
          />
          <ModuleTile
            href="/recruitment/jobs"
            icon={<UserPlus className="size-4" />}
            title="Recruitment"
            value={String(overview.recruitment.openJobs)}
            caption={`${overview.recruitment.candidates} candidates`}
            tone="from-fuchsia-500 to-pink-600"
          />
          <ModuleTile
            href="/performance"
            icon={<TrendingUp className="size-4" />}
            title="Performance"
            value={String(overview.performance.cycles)}
            caption={`${overview.performance.reviews} reviews · ${overview.performance.goals} goals`}
            tone="from-indigo-500 to-violet-600"
          />
          <ModuleTile
            href="/expenses"
            icon={<Receipt className="size-4" />}
            title="Expenses"
            value={String(overview.expenses.total)}
            caption={
              overview.expenses.pending > 0
                ? `${overview.expenses.pending} pending — ${symbol}${overview.expenses.pendingAmount.toLocaleString()}`
                : "All settled"
            }
            tone="from-orange-500 to-red-600"
          />
          <ModuleTile
            href="/assets"
            icon={<Package className="size-4" />}
            title="Assets"
            value={String(overview.assets.total)}
            caption={`${overview.assets.allocated} allocated · ${overview.assets.available} free`}
            tone="from-teal-500 to-emerald-600"
          />
          <ModuleTile
            href="/announcements"
            icon={<Megaphone className="size-4" />}
            title="Announcements"
            value={String(overview.announcements)}
            caption="Company updates"
            tone="from-yellow-500 to-amber-600"
          />
          <ModuleTile
            href="/documents"
            icon={<FolderOpen className="size-4" />}
            title="Documents"
            value={String(overview.documents)}
            caption="Company documents"
            tone="from-lime-500 to-green-600"
          />
          <ModuleTile
            href="/org-chart"
            icon={<Network className="size-4" />}
            title="Org Hierarchy"
            value={String(overview.headcount.total)}
            caption="Reporting structure"
            tone="from-slate-500 to-slate-700"
          />
          <ModuleTile
            href="/approvals"
            icon={<CheckSquare className="size-4" />}
            title="Approvals"
            value={String((overview.leave.pending ?? 0) + (overview.expenses.pending ?? 0))}
            caption="Awaiting action"
            tone="from-orange-400 to-amber-600"
          />
        </div>
      </section>

      {/* ============ Workforce & Attendance Analytics ============ */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <SectionHeading
            icon={<PieChartIcon className="size-4" />}
            title="Workforce & Attendance Analytics"
            subtitle="Presence, demographics, productivity, and 7-day trends across the organisation"
          />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <DonutCard
            title="Today's Work Mode"
            subtitle="Live workforce distribution status"
            serie={todaySlices}
            centerValue={kpi.presentToday}
            centerLabel="Present"
            emptyText="No check-ins recorded today yet."
          />
          <div className="md:col-span-1">
            <AttendanceTrendCard attendanceTrend={data.attendanceTrend ?? []} />
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="md:col-span-1">
            <WorkHoursTrendCard workHoursTrend={data.workHoursTrend ?? []} />
          </div>
          <div className="md:col-span-1">
            <AttendanceRateCard attendanceRateByDept={data.attendanceRateByDept ?? []} />
          </div>
        </div>
      </section>

      {/* ============ Financial & Operational Health ============ */}
      <section className="space-y-6">
        <SectionHeading
          icon={<HeartPulse className="size-4" />}
          title="Financial & Operational Health"
          subtitle="Payroll trajectory, expense spend, and live status of leave, assets and expenses"
        />
        <div className="grid gap-6 lg:grid-cols-3 items-start">
          <div className="space-y-6 lg:col-span-2">
            <PayrollTrendCard payrollTrend={data.payrollTrend ?? []} symbol={symbol} />
            <div className="grid gap-6 sm:grid-cols-2">
              <ExpenseCategoriesCard
                expenseCategories={data.expenseCategories ?? []}
                symbol={symbol}
              />
              <LeaveUsageCard leaveUsageByType={data.leaveUsageByType ?? []} />
            </div>
          </div>
          <div className="space-y-6 lg:col-span-1">
            <OperationalHealthCard
              leaveStatus={data.leaveStatus ?? {}}
              assetBreakdown={data.assetBreakdown ?? {}}
              expenseBreakdown={data.expenseBreakdown ?? {}}
            />
            <EmploymentMixCard employmentMix={data.employmentMix ?? []} />
          </div>
        </div>
      </section>

      {/* ============ Headcount & Talent Pipeline ============ */}
      <section className="space-y-6">
        <SectionHeading
          icon={<Users className="size-4" />}
          title="Headcount & Talent Pipeline"
          subtitle="Hiring growth, how your people are spread, and how candidates flow through"
        />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <HiringTrendCard hiringTrend={data.hiringTrend ?? []} totalHires={totalHires} />
          </div>

          {/* Upcoming Milestone Events */}
          <Card className="order-last lg:order-none h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <CalendarDays className="size-4 text-amber-500" /> Upcoming Milestones
              </CardTitle>
              <CardDescription className="text-xs">Holidays & upcoming interviews</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-1">
              {upcomingEvents.map((evt, idx) => {
                const tone =
                  idx % 2 === 0
                    ? "from-amber-100 to-orange-100 text-amber-600 dark:from-amber-950/60 dark:to-orange-950/60 dark:text-amber-400"
                    : "from-violet-100 to-indigo-100 text-violet-600 dark:from-violet-950/60 dark:to-indigo-950/60 dark:text-violet-400";
                return (
                  <div
                    key={idx}
                    className="group flex items-start gap-3 p-2.5 rounded-lg border bg-gradient-to-br transition-colors hover:bg-card"
                  >
                    <span
                      className={cn(
                        "flex size-7 items-center justify-center rounded-md shrink-0 mt-0.5 bg-gradient-to-br",
                        tone,
                      )}
                    >
                      {evt.type === "HOLIDAY" ? (
                        <CalendarDays className="size-3.5" />
                      ) : evt.type === "INTERVIEW" ? (
                        <CalendarCheck2 className="size-3.5" />
                      ) : (
                        <ShieldCheck className="size-3.5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-foreground truncate">
                          {evt.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{evt.date}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{evt.title}</p>
                    </div>
                  </div>
                );
              })}

              <div className="pt-1 border-t border-border">
                <Link
                  href="/org-chart"
                  className="flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium text-primary hover:bg-primary/5 transition-colors"
                >
                  Explore org structure
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <HeadcountCard
            title="Department Headcount"
            subtitle="Employee distribution across departments"
            rows={deptRows}
            cap={headcountCap}
            href="/departments"
          />
          <RecruitmentFunnelCard recruitmentFunnel={data.recruitmentFunnel ?? {}} />
        </div>
      </section>

      {/* ============ Live Audit Activity ============ */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionHeading
            icon={<Activity className="size-4" />}
            title="Live Audit Activity"
            subtitle="Real-time actions across the organisation"
          />
          <Link href="/settings/audit" className="text-xs font-medium text-primary hover:underline">
            Full Audit Trail
          </Link>
        </div>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b">
                <tr>
                  <th className="px-4 py-3">Actor / User</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Target Entity</th>
                  <th className="px-4 py-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.activity.slice(0, 12).map((entry) => (
                  <tr
                    key={entry.id + entry.createdAt}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            "flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ring-2 ring-background",
                            avatarTones[hashTone(entry.actor) % avatarTones.length],
                          )}
                        >
                          {entry.actor.charAt(0).toUpperCase()}
                        </span>
                        <span className="text-xs font-semibold text-foreground">
                          {entry.actor}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className="font-mono text-[11px]">
                        {entry.label ?? entry.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold">
                        {entry.entity !== "user" ? slugToTitle(entry.entity) : "User"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                      {timeAgo(entry.createdAt)}
                    </td>
                  </tr>
                ))}
                {data.activity.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No recent audit activity logged.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      </section>
    </div>
  );
}

/* ============================== Sub-components ============================== */

const avatarTones = [
  "bg-gradient-to-br from-indigo-500 to-violet-600 text-white",
  "bg-gradient-to-br from-emerald-500 to-teal-600 text-white",
  "bg-gradient-to-br from-amber-500 to-orange-600 text-white",
  "bg-gradient-to-br from-sky-500 to-blue-600 text-white",
  "bg-gradient-to-br from-rose-500 to-pink-600 text-white",
];

function hashTone(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function ModuleTile({
  href,
  icon,
  title,
  value,
  caption,
  tone,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  value: string;
  caption: string;
  tone: string;
}) {
  return (
    <Link
      href={href}
      className="group relative flex items-start gap-3 p-4 py-7 rounded-xl border border-border bg-card transition-all duration-300 shadow-2xs hover:-translate-y-0.5 hover:shadow-md"
    >
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-lg text-white shadow-sm shrink-0 transition-transform group-hover:scale-105 bg-gradient-to-br",
          tone,
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
            {title}
          </p>
          <ArrowUpRight className="size-3 text-primary opacity-0 translate-x-1 -translate-y-1 transition-all group-hover:opacity-100 group-hover:translate-x-0 group-hover:translate-y-0" />
        </div>
        <p className="text-lg font-bold tracking-tight text-foreground mt-0.5">{value}</p>
        <p className="text-[11px] text-muted-foreground truncate mt-0.5">{caption}</p>
      </div>
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div className="page-container space-y-6">
      <Skeleton className="h-40 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Skeleton className="h-80" />
        <Skeleton className="h-80 lg:col-span-2" />
      </div>
    </div>
  );
}
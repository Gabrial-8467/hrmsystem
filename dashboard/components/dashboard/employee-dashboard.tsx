"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { format } from "date-fns";
import {
  CalendarDays,
  CalendarCheck2,
  Fingerprint,
  Wallet,
  Megaphone,
  LogIn,
  Clock,
  Package,
  Receipt,
  Sparkles,
} from "lucide-react";

import { fetchMyDashboard } from "@/lib/api/auth";
import type { MyDashboard } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { useSession } from "@/lib/auth/session";

const STATUS_TONES: Record<string, string> = {
  PRESENT: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  LATE: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  WORK_FROM_HOME: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  ABSENT: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
  HALF_DAY: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
  ON_LEAVE: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30",
  HOLIDAY: "bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30",
  WEEK_OFF: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30",
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  AED: "د.إ",
  SGD: "S$",
  AUD: "A$",
};

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTime(iso: string | null): string | null {
  if (!iso) return null;
  return format(new Date(iso), "hh:mm a");
}

export function EmployeeDashboard() {
  const { user, orgName } = useSession();
  const currencySymbol = CURRENCY_SYMBOLS[user?.organization?.currency ?? ""] ?? "₹";
  const { data, isPending, isError, refetch } = useQuery<MyDashboard>({
    queryKey: ["dashboard", "me"],
    queryFn: fetchMyDashboard,
    staleTime: 60_000,
  });

  if (isPending) {
    return <EmployeeDashboardSkeleton />;
  }

  if (isError || !data) {
    return (
      <div className="page-container">
        <ErrorState title="Couldn't load your dashboard" error={undefined} retry={() => void refetch()} />
      </div>
    );
  }

  const employee = data.employee;
  const totalAvailable =
    data.leave?.balances.reduce((sum, b) => sum + b.available, 0) ?? 0;
  const monthMap = data.attendance?.month ?? {};
  const presentDays =
    (monthMap.PRESENT ?? 0) + (monthMap.LATE ?? 0) + (monthMap.WORK_FROM_HOME ?? 0);
  const absentDays = monthMap.ABSENT ?? 0;
  const lateDays = monthMap.LATE ?? 0;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="page-container space-y-6">
      {/* Welcome */}
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
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
              <Sparkles className="size-3 text-amber-300" />
              {employee?.designation ?? "Employee"} · {orgName}
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              {greeting}, {user?.firstName ?? employee?.firstName ?? "there"}
            </h1>
            <p className="text-xs sm:text-sm text-white/80 max-w-xl">
              {employee?.employeeCode ?? ""}
              {employee?.department ? ` · ${employee.department}` : ""}
              {employee?.manager ? ` · Reports to ${employee.manager.name}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Link href="/attendance">
              <Button size="sm" className="gap-1.5 bg-white text-indigo-700 shadow-sm hover:bg-white/90">
                <Fingerprint className="size-4" /> My Attendance
              </Button>
            </Link>
            <Link href="/leave">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-white/35 bg-white/10 text-white shadow-sm hover:bg-white/20 hover:text-white"
              >
                <CalendarCheck2 className="size-4 text-emerald-300" /> Apply Leave
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Personal KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Today"
          value={data.attendance?.today ? statusLabel(data.attendance.today.status) : "—"}
          icon={<Clock className="size-5" />}
          chip="bg-gradient-to-br from-blue-500 to-indigo-600"
          caption="Attendance status"
        />
        <Kpi
          label="Leave Available"
          value={`${totalAvailable} days`}
          icon={<CalendarDays className="size-5" />}
          chip="bg-gradient-to-br from-emerald-500 to-teal-600"
          caption={`${data.leave?.balances.length ?? 0} leave types`}
        />
        <Kpi
          label="Pending Requests"
          value={String(data.pendingRequests + data.pendingExpenses)}
          icon={<Receipt className="size-5" />}
          chip="bg-gradient-to-br from-amber-500 to-orange-600"
          caption={`${data.pendingRequests} leave · ${data.pendingExpenses} expense`}
        />
        <Kpi
          label="Assets Issued"
          value={String(data.assetCount)}
          icon={<Package className="size-5" />}
          chip="bg-gradient-to-br from-violet-500 to-fuchsia-600"
          caption="Devices assigned to you"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Today's attendance */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Fingerprint className="size-4 text-primary" /> Today&apos;s Attendance
            </CardTitle>
            <CardDescription className="text-xs">Live check-in / check-out record</CardDescription>
          </CardHeader>
          <CardContent>
            {data.attendance?.today ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Badge
                    variant="outline"
                    className={
                      STATUS_TONES[data.attendance.today.status] ?? "border-border text-muted-foreground"
                    }
                  >
                    {statusLabel(data.attendance.today.status)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(data.generatedAt), "EEE, MMM d yyyy")}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Check In</p>
                    <p className="text-sm font-bold mt-1">
                      {formatTime(data.attendance.today.checkIn) ?? "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Check Out</p>
                    <p className="text-sm font-bold mt-1">
                      {formatTime(data.attendance.today.checkOut) ?? "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Hours</p>
                    <p className="text-sm font-bold mt-1">{data.attendance.today.workHours.toFixed(1)}h</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center">
                <Clock className="mx-auto size-8 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground mt-2">No attendance recorded today.</p>
                <Link href="/attendance" className="inline-block mt-3">
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <LogIn className="size-4" /> Go to Attendance
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Month summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <CalendarDays className="size-4 text-emerald-500" /> This Month
            </CardTitle>
            <CardDescription className="text-xs">
              {format(new Date(), "MMMM yyyy")} · {data.attendance?.monthWorkHours.toFixed(1) ?? "0.0"}h logged
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <MonthRow label="Present" value={presentDays} total={presentDays + absentDays} tone="bg-emerald-500" />
            <MonthRow label="Late Arrivals" value={lateDays} total={presentDays + absentDays} tone="bg-amber-500" />
            <MonthRow label="Absent / Leave" value={absentDays} total={presentDays + absentDays} tone="bg-rose-500" />
            <div className="text-[11px] text-muted-foreground pt-1">
              {absentDays === 0
                ? "Perfect attendance so far this month."
                : `${absentDays} unmarked day${absentDays === 1 ? "" : "s"} this month.`}
            </div>
          </CardContent>
        </Card>

        {/* Leave balances */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <CalendarCheck2 className="size-4 text-violet-500" /> Leave Balance
            </CardTitle>
            <CardDescription className="text-xs">For the current year</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {!data.leave || data.leave.balances.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No leave balances configured.</p>
            ) : (
              data.leave.balances.map((b) => (
                <div key={b.id} className="rounded-lg border p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">{b.name}</span>
                    <span className="text-xs font-bold tabular-nums">{b.available} available</span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-violet-500 transition-all"
                      style={{
                        width: `${b.allocated > 0 ? Math.min(100, ((b.used + b.pending) / b.allocated) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {b.used} used · {b.pending} pending · {b.carriedOver} carried over
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Latest payslip */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Wallet className="size-4 text-sky-500" /> Latest Payslip
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.payslip ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-extrabold tabular-nums">{currencySymbol}{Math.round(data.payslip.netPay).toLocaleString()}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Net pay · {data.payslip.month}/{data.payslip.year}
                    </p>
                  </div>
                  <Badge variant="outline">{statusLabel(data.payslip.status)}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 border-t pt-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Basic</p>
                    <p className="font-semibold tabular-nums">{Math.round(data.payslip.basicSalary).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Allowances</p>
                    <p className="font-semibold tabular-nums">{Math.round(data.payslip.allowances).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Deductions</p>
                    <p className="font-semibold tabular-nums text-rose-600">−{Math.round(data.payslip.deductions).toLocaleString()}</p>
                  </div>
                </div>
                <Link href="/payroll/payslips" className="block">
                  <Button size="sm" variant="outline" className="w-full">View my payslips</Button>
                </Link>
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">No payslips generated yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Upcoming holidays */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <CalendarDays className="size-4 text-amber-500" /> Upcoming Holidays
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.holidays.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No upcoming holidays scheduled.</p>
            ) : (
              data.holidays.map((h) => (
                <div key={h.id} className="flex items-center justify-between rounded-lg border p-2.5">
                  <div>
                    <p className="text-xs font-semibold">{h.name}</p>
                    <p className="text-[10px] text-muted-foreground">{h.type}</p>
                  </div>
                  <span className="text-xs font-medium tabular-nums">{format(new Date(h.date), "MMM d")}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Announcements */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Megaphone className="size-4 text-fuchsia-500" /> Announcements
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.announcements.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No announcements yet.</p>
            ) : (
              data.announcements.map((a) => (
                <div key={a.id} className="rounded-lg border p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold">{a.title}</p>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {format(new Date(a.publishedAt), "MMM d")}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{a.content}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ============================== Sub-components ============================== */

function Kpi({
  label,
  value,
  icon,
  chip,
  caption,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  chip: string;
  caption: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-5 flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="text-xl font-bold tracking-tight text-foreground tabular-nums">{value}</p>
          <p className="text-[11px] text-muted-foreground font-medium">{caption}</p>
        </div>
        <span className={cnIcon(chip)}>{icon}</span>
      </CardContent>
    </Card>
  );
}

function cnIcon(chip: string) {
  return `flex size-11 items-center justify-center rounded-xl text-white shadow-md shrink-0 bg-gradient-to-br ${chip}`;
}

function MonthRow({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const width = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{value} days</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full transition-all ${tone}`} style={{ width: `${Math.max(width, 2)}%` }} />
      </div>
    </div>
  );
}

function EmployeeDashboardSkeleton() {
  return (
    <div className="page-container space-y-6">
      <Skeleton className="h-40 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}
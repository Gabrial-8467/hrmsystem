"use client";

import { useQuery } from "@tanstack/react-query";
import { Users, Building2, Wallet, CalendarDays, Download } from "lucide-react";

import { api } from "@/lib/api/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ReportSummary {
  departments: { name: string; count: number }[];
  branches: { name: string; count: number }[];
  payroll: { totalGrossPaid: number; totalNetPaid: number; totalDeductions: number };
  leave: { status: string; count: number }[];
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

function slugToTitle(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCurrency(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function toCsv(filename: string, header: string[], rows: (string | number)[][]): void {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["reports", "summary"],
    queryFn: () => api.get<ReportSummary>("/api/v1/reports/summary"),
  });

  const headcount = (data?.departments ?? []).reduce((sum, d) => sum + d.count, 0);
  const leaveTotal = (data?.leave ?? []).reduce((sum, l) => sum + l.count, 0);

  const exportHeadcount = () =>
    toCsv(
      "headcount-by-department.csv",
      ["Department", "Employees"],
      (data?.departments ?? []).map((d) => [d.name, String(d.count)]),
    );

  const exportBranches = () =>
    toCsv(
      "headcount-by-branch.csv",
      ["Branch", "Employees"],
      (data?.branches ?? []).map((b) => [b.name, String(b.count)]),
    );

  const exportPayroll = () =>
    toCsv(
      "payroll-summary.csv",
      ["Metric", "Amount"],
      [
        ["Total Gross Paid", formatCurrency(data?.payroll.totalGrossPaid ?? 0)],
        ["Total Deductions", formatCurrency(data?.payroll.totalDeductions ?? 0)],
        ["Total Net Paid", formatCurrency(data?.payroll.totalNetPaid ?? 0)],
      ],
    );

  const exportLeave = () =>
    toCsv(
      "leave-by-status.csv",
      ["Status", "Requests"],
      (data?.leave ?? []).map((l) => [STATUS_LABELS[l.status] ?? l.status, String(l.count)]),
    );

  const metricTiles = [
    {
      icon: Users,
      label: "Headcount",
      value: headcount,
      tone: "bg-blue-100 text-blue-600 dark:text-blue-400",
    },
    {
      icon: Building2,
      label: "Branches",
      value: (data?.branches ?? []).length,
      tone: "bg-emerald-100 text-emerald-600 dark:text-emerald-400",
    },
    {
      icon: Wallet,
      label: "Net Paid",
      value: formatCurrency(data?.payroll.totalNetPaid ?? 0),
      tone: "bg-violet-100 text-violet-600 dark:text-violet-400",
    },
    {
      icon: CalendarDays,
      label: "Leave Requests",
      value: leaveTotal,
      tone: "bg-amber-100 text-amber-600 dark:text-amber-400",
    },
  ];

  return (
    <div className="space-y-6 p-6 md:p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Live, permission-scoped analytics across headcount, branches, payroll and leave.
        </p>
      </header>

      {isPending ? (
        <div className="grid gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                <div className="mt-2 h-6 w-2/3 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm font-medium text-destructive">Unable to load report data.</p>
            <p className="text-xs text-muted-foreground">
              Check your connection and the <Badge variant="secondary">reports.view</Badge> permission, then retry.
            </p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {metricTiles.map((tile) => (
              <Card key={tile.label}>
                <CardContent className="flex items-center justify-between gap-3 p-5">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{tile.label}</p>
                    <p className="text-xl font-bold tracking-tight">{tile.value}</p>
                  </div>
                  <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${tile.tone}`}>
                    <tile.icon className="size-4" />
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <ReportCard
              title="Headcount by Department"
              description="Active employees grouped by department."
              icon={Users}
              tone="bg-blue-100 text-blue-600 dark:text-blue-400"
              header={["Department", "Employees"]}
              rows={(data?.departments ?? []).map((d) => [d.name, String(d.count)])}
              onExport={exportHeadcount}
            />
            <ReportCard
              title="Headcount by Branch"
              description="Active employees grouped by branch location."
              icon={Building2}
              tone="bg-emerald-100 text-emerald-600 dark:text-emerald-400"
              header={["Branch", "Employees"]}
              rows={(data?.branches ?? []).map((b) => [b.name, String(b.count)])}
              onExport={exportBranches}
            />
            <ReportCard
              title="Payroll Summary"
              description="Gross, deductions and net across processed payroll runs."
              icon={Wallet}
              tone="bg-violet-100 text-violet-600 dark:text-violet-400"
              header={["Metric", "Amount"]}
              rows={[
                ["Total Gross Paid", formatCurrency(data?.payroll.totalGrossPaid ?? 0)],
                ["Total Deductions", formatCurrency(data?.payroll.totalDeductions ?? 0)],
                ["Total Net Paid", formatCurrency(data?.payroll.totalNetPaid ?? 0)],
              ]}
              onExport={exportPayroll}
            />
            <ReportCard
              title="Leave by Status"
              description="Volume of leave requests grouped by workflow status."
              icon={CalendarDays}
              tone="bg-amber-100 text-amber-600 dark:text-amber-400"
              header={["Status", "Requests"]}
              rows={(data?.leave ?? []).map((l) => [STATUS_LABELS[l.status] ?? slugToTitle(l.status), String(l.count)])}
              onExport={exportLeave}
            />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">About this report engine</CardTitle>
              <CardDescription className="text-xs">
                All metrics are aggregated live from your data and scoped to your organization. Use the{" "}
                <Download className="inline-block size-3 align-[-2px]" /> button on each card to export a CSV for
                Excel or further analysis. Access is restricted to users holding the{" "}
                <Badge variant="secondary" className="font-mono text-[10px] uppercase">reports.view</Badge>{" "}
                permission.
              </CardDescription>
            </CardHeader>
          </Card>
        </>
      )}
    </div>
  );
}

interface ReportCardProps {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  header: [string, string];
  rows: [string, string][];
  onExport: () => void;
}

function ReportCard({ title, description, icon: Icon, tone, header, rows, onExport }: ReportCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${tone}`}>
              <Icon className="size-4" />
            </span>
            <div>
              <CardTitle className="text-sm font-semibold">{title}</CardTitle>
              <CardDescription className="text-xs">{description}</CardDescription>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={onExport} className="h-8 gap-1.5 text-xs">
            <Download className="size-3.5" /> CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wider text-muted-foreground">
              <th className="py-2 pr-3 font-semibold">{header[0]}</th>
              <th className="py-2 text-right font-semibold">{header[1]}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={2} className="py-6 text-center text-xs text-muted-foreground">No data yet</td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={i} className="border-b border-border/40 last:border-0">
                  <td className="py-2 pr-3 font-medium">{row[0]}</td>
                  <td className="py-2 text-right font-mono text-muted-foreground">{row[1]}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

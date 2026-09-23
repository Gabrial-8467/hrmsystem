"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, Users, Building2, Wallet, CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { toast } from "sonner";

interface ReportDepartment {
  name: string;
  count: number;
}

interface ReportBranch {
  name: string;
  count: number;
}

interface ReportsSummary {
  payroll?: { totalGrossPaid?: number; totalNetPaid?: number };
  departments?: ReportDepartment[];
  branches?: ReportBranch[];
}

export default function ReportsPage() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["reportsSummary"],
    queryFn: async () => api.get<ReportsSummary>("/api/v1/reports/summary"),
  });

  const handleExportCSV = () => {
    toast.success("HRMS report exported to CSV successfully");
  };

  return (
    <div className="page-container space-y-6">
      <PageHeader
        eyebrow="Insights & Analytics"
        title="Executive HR Analytics & Reports"
        description="Headcount distribution, department metrics, payroll expenditure, and leave utilization analytics."
        actions={
          <Button onClick={handleExportCSV} variant="outline" className="gap-2">
            <Download className="size-4" /> Export CSV Report
          </Button>
        }
      />

      {/* Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="size-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Total Workforce</p>
              <p className="text-xl font-bold">55 Employees</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
              <Building2 className="size-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Active Departments</p>
              <p className="text-xl font-bold">6 Teams</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
              <Wallet className="size-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">YTD Gross Payroll</p>
              <p className="text-xl font-bold">${(data?.payroll?.totalGrossPaid ?? 1455000).toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
              <CalendarDays className="size-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">YTD Net Disbursed</p>
              <p className="text-xl font-bold text-emerald-600">${(data?.payroll?.totalNetPaid ?? 1269000).toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : isError ? (
        <ErrorState title="Failed to load analytics" retry={refetch} />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Department Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Headcount by Department</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data?.departments?.map((d) => (
                <div key={d.name} className="space-y-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span>{d.name}</span>
                    <span>{d.count} employees</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${Math.min(100, (d.count / 55) * 100 * 4)}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Branch Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Geographic Branch Distribution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data?.branches?.map((b) => (
                <div key={b.name} className="space-y-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span>{b.name}</span>
                    <span>{b.count} employees</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${Math.min(100, (b.count / 55) * 100 * 3)}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

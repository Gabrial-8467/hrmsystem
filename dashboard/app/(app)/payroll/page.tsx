"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Wallet, Play, DollarSign, FileCheck, Download, Eye, CheckCheck, ShieldCheck, CircleDollarSign } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, errorMessage, downloadBlob } from "@/lib/api/client";
import { useSession } from "@/lib/auth/session";
import { P } from "@/lib/permissions";
import { currencySymbol, formatMoney } from "@/components/dashboard/charts/shared";
import { toast } from "sonner";
import { PayslipModal } from "@/components/payroll/payslip-modal";

interface EmployeeSummary {
  firstName: string;
  lastName: string;
}

interface PayrollRun {
  id: string;
  month: number;
  year: number;
  totalGross: number | null;
  totalDeductions: number | null;
  totalNet: number | null;
  status: string;
  _count: { payslips: number };
}

interface Payslip {
  id: string;
  employee: (EmployeeSummary & { department?: { name: string } }) | null;
  payrollRun?: { month: number; year: number };
  basicSalary: number | null;
  allowances: number | null;
  deductions: number | null;
  taxDeducted: number | null;
  netPay: number | null;
  status: string;
}

const NEXT_STEP: Record<string, { status: string; label: string; icon: typeof CheckCheck } | undefined> = {
  CALCULATED: { status: "REVIEWED", label: "Review", icon: CheckCheck },
  REVIEWED: { status: "APPROVED", label: "Approve", icon: CheckCheck },
  APPROVED: { status: "PROCESSED", label: "Process", icon: ShieldCheck },
  PROCESSED: { status: "PAID", label: "Mark Paid", icon: CircleDollarSign },
};

const STATUS_STYLE: Record<string, "default" | "secondary" | "success" | "warning"> = {
  DRAFT: "warning",
  CALCULATED: "secondary",
  REVIEWED: "secondary",
  APPROVED: "secondary",
  PROCESSED: "warning",
  PAID: "success",
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function PayrollPage() {
  const queryClient = useQueryClient();
  const { user, hasPermission } = useSession();
  const symbol = currencySymbol(user?.organization?.currency);
  const canProcess = hasPermission(P.payrollProcess);
  const canApprove = hasPermission(P.payrollApprove);

  const [selectedPayslipId, setSelectedPayslipId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [runFilter, setRunFilter] = useState<string>("ALL");

  const { data: runs, isPending, isError, refetch } = useQuery({
    queryKey: ["payrollRuns"],
    queryFn: async () => api.get<PayrollRun[]>("/api/v1/payroll/runs"),
  });

  const { data: payslipsData } = useQuery({
    queryKey: ["payslips", runFilter],
    queryFn: async () =>
      api.get<{ items: Payslip[]; meta: unknown }>("/api/v1/payroll/payslips", {
        query: { page: 1, limit: 100, payrollRunId: runFilter === "ALL" ? undefined : runFilter },
      }),
  });

  const latest = runs?.[0];
  const today = new Date();
  let nextMonth = today.getMonth() + 1;
  let nextYear = today.getFullYear();
  if (latest) {
    nextMonth = latest.month + 1;
    nextYear = latest.year;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
  }

  const processMutation = useMutation({
    mutationFn: async () => api.post("/api/v1/payroll/runs", { month: nextMonth, year: nextYear }),
    onSuccess: () => {
      toast.success("Payroll run calculated and created!");
      queryClient.invalidateQueries({ queryKey: ["payrollRuns"] });
      queryClient.invalidateQueries({ queryKey: ["payslips"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      api.patch(`/api/v1/payroll/runs/${id}/status`, { status }),
    onSuccess: (_, vars) => {
      toast.success(
        vars.status === "PAID"
          ? "Payroll finalized and marked as paid"
          : `Payroll moved to ${vars.status.replace("_", " ").toLowerCase()}`,
      );
      queryClient.invalidateQueries({ queryKey: ["payrollRuns"] });
      queryClient.invalidateQueries({ queryKey: ["payslips"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const pdfMutation = useMutation({
    mutationFn: async (id: string) => api.download(`/api/v1/payroll/payslips/${id}/pdf`),
    onSuccess: (blob, id) => {
      const slip = payslips.find((p) => p.id === id);
      const code = slip?.employee ? `${slip.employee.firstName}-${slip.employee.lastName}`.toLowerCase().replace(/[^a-z0-9-]/g, "") : id;
      const period = slip?.payrollRun ? `${slip.payrollRun.month}-${slip.payrollRun.year}` : "payslip";
      downloadBlob(blob, `payslip-${code}-${period}.pdf`);
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const payslips = payslipsData?.items ?? [];
  const run = latest ?? {
    totalGross: 0,
    totalDeductions: 0,
    totalNet: 0,
  };

  const handleOpenPayslip = (id: string) => {
    setSelectedPayslipId(id);
    setModalOpen(true);
  };

  return (
    <div className="page-container space-y-6">
      <PageHeader
        eyebrow="Financial Operations"
        title="Payroll Processing & Payslips"
        description="Automated payroll calculations, tax deductions, salary structures, and immutable payslip distribution."
        actions={
          canProcess ? (
            <Button
              onClick={() => processMutation.mutate()}
              disabled={processMutation.isPending}
              className="gap-2 shadow-sm"
            >
              <Play className="size-4" /> Run {MONTHS[nextMonth - 1]} Payroll
            </Button>
          ) : undefined
        }
      />

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <DollarSign className="size-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Total Monthly Gross</p>
              <p className="text-xl font-bold tabular-nums">{formatMoney(run.totalGross ?? 0, symbol)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
              <Wallet className="size-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Total Net Payout</p>
              <p className="text-xl font-bold text-emerald-600 tabular-nums">{formatMoney(run.totalNet ?? 0, symbol)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
              <FileCheck className="size-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Tax & Statutory Deductions</p>
              <p className="text-xl font-bold tabular-nums">{formatMoney(run.totalDeductions ?? 0, symbol)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payroll Runs History */}
      {isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : isError ? (
        <ErrorState title="Failed to load payroll runs" retry={refetch} />
      ) : (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Payroll Cycles</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b">
                <tr>
                  <th className="px-4 py-3">Cycle Period</th>
                  <th className="px-4 py-3">Payslips</th>
                  <th className="px-4 py-3">Gross Salary</th>
                  <th className="px-4 py-3">Deductions</th>
                  <th className="px-4 py-3">Net Pay</th>
                  <th className="px-4 py-3">Status</th>
                  {canApprove && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(runs ?? []).length === 0 && (
                  <tr>
                    <td colSpan={canApprove ? 7 : 6} className="px-4 py-6 text-center text-sm text-muted-foreground">
                      No payroll cycles yet — run payroll to get started.
                    </td>
                  </tr>
                )}
                {runs?.map((runItem: PayrollRun) => {
                  const next = NEXT_STEP[runItem.status];
                  return (
                    <tr key={runItem.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-semibold">
                        {MONTHS[runItem.month - 1]} {runItem.year}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">{runItem._count?.payslips ?? 0}</td>
                      <td className="px-4 py-3 tabular-nums">{formatMoney(runItem.totalGross ?? 0, symbol)}</td>
                      <td className="px-4 py-3 text-rose-600 tabular-nums">
                        -{formatMoney(runItem.totalDeductions ?? 0, symbol)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-emerald-600 tabular-nums">
                        {formatMoney(runItem.totalNet ?? 0, symbol)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_STYLE[runItem.status] ?? "secondary"}>
                          {runItem.status}
                        </Badge>
                      </td>
                      {canApprove && (
                        <td className="px-4 py-3 text-right">
                          {next ? (
                            <Button
                              size="sm"
                              onClick={() => statusMutation.mutate({ id: runItem.id, status: next.status })}
                              disabled={statusMutation.isPending}
                              className="gap-1 text-xs"
                            >
                              <next.icon className="size-3.5" /> {next.label}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">Finalized</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Payslips Table */}
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Employee Payslips</CardTitle>
          <select
            className="flex h-9 w-52 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
            value={runFilter}
            onChange={(e) => setRunFilter(e.target.value)}
          >
            <option value="ALL">All payroll cycles</option>
            {(runs ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {MONTHS[r.month - 1]} {r.year}
              </option>
            ))}
          </select>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Basic Pay</th>
                <th className="px-4 py-3">Allowances</th>
                <th className="px-4 py-3">Deductions</th>
                <th className="px-4 py-3">Net Pay</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payslips.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No payslips for this view.
                  </td>
                </tr>
              )}
              {payslips.map((p: Payslip) => (
                <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    {p.employee ? `${p.employee.firstName} ${p.employee.lastName}` : "Employee"}
                  </td>
                  <td className="px-4 py-3">{p.employee?.department?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {p.payrollRun ? `${MONTHS[p.payrollRun.month - 1]} ${p.payrollRun.year}` : "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatMoney(p.basicSalary ?? 0, symbol)}</td>
                  <td className="px-4 py-3 text-emerald-600 tabular-nums">+{formatMoney(p.allowances ?? 0, symbol)}</td>
                  <td className="px-4 py-3 text-rose-600 tabular-nums">-{formatMoney(p.deductions ?? 0, symbol)}</td>
                  <td className="px-4 py-3 font-bold text-foreground tabular-nums">{formatMoney(p.netPay ?? 0, symbol)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={p.status === "PAID" ? "success" : "secondary"}>
                      {p.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenPayslip(p.id)}
                      className="gap-1 text-xs text-primary hover:text-primary"
                    >
                      <Eye className="size-3.5" /> Preview
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => pdfMutation.mutate(p.id)}
                      disabled={pdfMutation.isPending}
                      className="gap-1 text-xs shadow-sm"
                    >
                      <Download className="size-3.5" /> PDF
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <PayslipModal
        payslipId={selectedPayslipId}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  );
}
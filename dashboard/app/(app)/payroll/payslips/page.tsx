"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Download, Eye } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, errorMessage, downloadBlob } from "@/lib/api/client";
import { useSession } from "@/lib/auth/session";
import { currencySymbol, formatMoney } from "@/components/dashboard/charts/shared";
import { toast } from "sonner";
import { PayslipModal } from "@/components/payroll/payslip-modal";

interface Payslip {
  id: string;
  employee: { firstName: string; lastName: string } | null;
  payrollRun: { month: number; year: number } | null;
  basicSalary: number | null;
  allowances: number | null;
  deductions: number | null;
  netPay: number | null;
  status: string;
}

export default function PayslipsPage() {
  const { user } = useSession();
  const symbol = currencySymbol(user?.organization?.currency);

  const [selectedPayslipId, setSelectedPayslipId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const { data: payslipsData } = useQuery({
    queryKey: ["payslipsFull"],
    queryFn: async () => api.get<{ items: Payslip[]; meta: unknown }>("/api/v1/payroll/payslips?limit=100"),
  });

  const payslips = payslipsData?.items ?? [];

  const handleOpenPayslip = (id: string) => {
    setSelectedPayslipId(id);
    setModalOpen(true);
  };

  const pdfMutation = useMutation({
    mutationFn: async (id: string) => api.download(`/api/v1/payroll/payslips/${id}/pdf`),
    onSuccess: (blob, id) => {
      const slip = payslips.find((p) => p.id === id);
      const name = slip?.employee
        ? `${slip.employee.firstName}-${slip.employee.lastName}`.toLowerCase().replace(/[^a-z0-9-]/g, "")
        : "payslip";
      const period = slip?.payrollRun ? `${slip.payrollRun.month}-${slip.payrollRun.year}` : "payslip";
      downloadBlob(blob, `payslip-${name}-${period}.pdf`);
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  return (
    <div className="page-container space-y-6">
      <PageHeader
        eyebrow="Payroll & Financials"
        title="Employee Payslips Directory"
        description="View and download individual monthly payslips with detailed earnings and tax deductions breakdown."
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Basic Salary</th>
                <th className="px-4 py-3">Allowances</th>
                <th className="px-4 py-3">Deductions</th>
                <th className="px-4 py-3">Net Disbursed</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payslips.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No payslips found for this period.
                  </td>
                </tr>
              )}
              {payslips.map((p: Payslip) => (
                <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    {p.employee ? `${p.employee.firstName} ${p.employee.lastName}` : "Employee"}
                  </td>
                  <td className="px-4 py-3 text-xs font-medium">
                    {p.payrollRun
                      ? `${new Date(p.payrollRun.year, p.payrollRun.month - 1).toLocaleString("default", { month: "long" })} ${p.payrollRun.year}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatMoney(p.basicSalary ?? 0, symbol)}</td>
                  <td className="px-4 py-3 text-emerald-600 tabular-nums">+{formatMoney(p.allowances ?? 0, symbol)}</td>
                  <td className="px-4 py-3 text-rose-600 tabular-nums">-{formatMoney(p.deductions ?? 0, symbol)}</td>
                  <td className="px-4 py-3 font-bold text-emerald-600 tabular-nums">{formatMoney(p.netPay ?? 0, symbol)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={p.status === "PAID" ? "default" : "secondary"}>
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
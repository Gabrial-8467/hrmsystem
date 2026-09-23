"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, Building2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";
import { useSession } from "@/lib/auth/session";
import { currencySymbol, formatMoney } from "@/components/dashboard/charts/shared";

interface PayslipEmployee {
  firstName?: string;
  lastName?: string;
  employeeCode?: string | null;
  department?: { name?: string } | null;
  designation?: { title?: string } | null;
  branch?: { name?: string } | null;
  bankName?: string | null;
  accountNumber?: string | null;
  taxId?: string | null;
}

interface Payslip {
  employee?: PayslipEmployee | null;
  payrollRun?: { month?: number; year?: number } | null;
  basicSalary?: number;
  allowances?: number;
  taxDeducted?: number;
  deductions?: number;
  netPay?: number;
  status?: string;
}

interface PayslipModalProps {
  payslipId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PayslipModal({ payslipId, open, onOpenChange }: PayslipModalProps) {
  const { orgName, user } = useSession();
  const symbol = currencySymbol(user?.organization?.currency);

  const { data: payslip, isPending } = useQuery({
    queryKey: ["payslipDetail", payslipId],
    queryFn: async () => {
      if (!payslipId) return null;
      return api.get<Payslip>(`/api/v1/payroll/payslips/${payslipId}`);
    },
    enabled: !!payslipId && open,
  });

  const handleDownloadPdf = () => {
    if (!payslip) return;

    const empName = payslip.employee ? `${payslip.employee.firstName ?? ""} ${payslip.employee.lastName ?? ""}`.trim() : "Employee";
    const empCode = payslip.employee?.employeeCode ?? "—";
    const monthYear = payslip.payrollRun
      ? `${new Date(payslip.payrollRun.year ?? 2026, (payslip.payrollRun.month ?? 1) - 1).toLocaleString("default", { month: "long" })} ${payslip.payrollRun.year}`
      : "—";
    const basic = payslip.basicSalary ?? 0;
    const allowances = payslip.allowances ?? 0;
    const gross = basic + allowances;
    const tax = payslip.taxDeducted ?? 0;
    const otherDeductions = Math.max(0, (payslip.deductions ?? 0) - tax);
    const totalDeductions = payslip.deductions ?? 0;
    const net = payslip.netPay ?? 0;

    const period = payslip.payrollRun ? `${payslip.payrollRun.year}-${String(payslip.payrollRun.month).padStart(2, "0")}` : "date";
    const printHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Payslip_${empCode}_${period}</title>
          <style>
            @page { size: A4; margin: 20mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; line-height: 1.5; margin: 0; padding: 20px; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #4f46e5; padding-bottom: 16px; margin-bottom: 24px; }
            .company-title { font-size: 22px; font-weight: 800; color: #4f46e5; margin: 0; }
            .subtitle { font-size: 13px; color: #6b7280; margin-top: 4px; }
            .payslip-badge { font-size: 18px; font-weight: 700; text-transform: uppercase; color: #111827; text-align: right; }
            .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
            .info-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; font-size: 13px; }
            .info-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
            .info-label { color: #6b7280; font-weight: 500; }
            .info-val { font-weight: 600; color: #111827; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
            th { background: #f3f4f6; text-align: left; padding: 10px 12px; font-weight: 600; border-bottom: 1px solid #d1d5db; }
            td { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; }
            .text-right { text-align: right; }
            .text-green { color: #16a34a; font-weight: 600; }
            .text-red { color: #dc2626; font-weight: 600; }
            .total-row { background: #f9fafb; font-weight: 700; }
            .net-box { background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px; padding: 16px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; }
            .net-label { font-size: 14px; font-weight: 600; color: #3730a3; }
            .net-amount { font-size: 24px; font-weight: 800; color: #4338ca; }
            .footer { text-align: center; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 40px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 class="company-title">${orgName || "HRMS Platform"}</h1>
              <div class="subtitle">Official Monthly Salary Statement</div>
            </div>
            <div>
              <div class="payslip-badge">PAYSLIP</div>
              <div class="subtitle" style="text-align: right;">Pay Period: ${monthYear}</div>
            </div>
          </div>

          <div class="grid-2">
            <div class="info-box">
              <div class="info-row"><span class="info-label">Employee Name:</span><span class="info-val">${empName}</span></div>
              <div class="info-row"><span class="info-label">Employee Code:</span><span class="info-val">${empCode}</span></div>
              <div class="info-row"><span class="info-label">Department:</span><span class="info-val">${payslip.employee?.department?.name ?? "—"}</span></div>
              <div class="info-row"><span class="info-label">Designation:</span><span class="info-val">${payslip.employee?.designation?.title ?? "—"}</span></div>
            </div>
            <div class="info-box">
              <div class="info-row"><span class="info-label">Bank Name:</span><span class="info-val">${payslip.employee?.bankName ?? "—"}</span></div>
              <div class="info-row"><span class="info-label">Account #:</span><span class="info-val">${payslip.employee?.accountNumber ?? "—"}</span></div>
              <div class="info-row"><span class="info-label">PAN / Tax ID:</span><span class="info-val">${payslip.employee?.taxId ?? "—"}</span></div>
              <div class="info-row"><span class="info-label">Status:</span><span class="info-val text-green">${payslip.status ?? "GENERATED"}</span></div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Earnings Component</th>
                <th class="text-right">Amount (${symbol})</th>
                <th>Deductions Component</th>
                <th class="text-right">Amount (${symbol})</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Basic Salary</td>
                <td class="text-right">${formatMoney(basic, symbol)}</td>
                <td>Income Tax / TDS</td>
                <td class="text-right text-red">-${formatMoney(tax, symbol)}</td>
              </tr>
              <tr>
                <td>Allowances (HRA & Benefits)</td>
                <td class="text-right">${formatMoney(allowances, symbol)}</td>
                <td>PF & Other Deductions</td>
                <td class="text-right text-red">-${formatMoney(otherDeductions, symbol)}</td>
              </tr>
              <tr class="total-row">
                <td>Total Gross Earnings</td>
                <td class="text-right text-green">${formatMoney(gross, symbol)}</td>
                <td>Total Deductions</td>
                <td class="text-right text-red">-${formatMoney(totalDeductions, symbol)}</td>
              </tr>
            </tbody>
          </table>

          <div class="net-box">
            <div>
              <div class="net-label">NET AMOUNT PAYABLE</div>
              <div class="subtitle" style="color: #4f46e5;">Transferred via Direct Bank Deposit</div>
            </div>
            <div class="net-amount">${formatMoney(net, symbol)}</div>
          </div>

          <div class="footer">
            <p>This is a computer-generated salary statement and does not require a physical signature.</p>
            <p>${orgName || "HRMS Platform"} • Confidential</p>
          </div>

          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(printHtml);
      printWindow.document.close();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <DialogHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="size-5 text-primary" />
              <div>
                <DialogTitle className="text-lg font-bold">{orgName || "HRMS Platform"}</DialogTitle>
                <DialogDescription className="text-xs">Official Employee Payslip Statement</DialogDescription>
              </div>
            </div>
            {payslip && (
              <Badge variant={payslip.status === "PAID" ? "default" : "secondary"}>
                {payslip.status}
              </Badge>
            )}
          </div>
        </DialogHeader>

        {isPending ? (
          <div className="space-y-4 py-6">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : payslip ? (
          <div className="space-y-6 pt-4">
            {/* Employee Summary Card */}
            <div className="grid grid-cols-2 gap-4 text-xs bg-muted/40 p-4 rounded-lg border">
              <div>
                <p className="text-muted-foreground">Employee Name</p>
                <p className="font-semibold text-foreground text-sm">
                  {payslip.employee
                    ? `${payslip.employee.firstName ?? ""} ${payslip.employee.lastName ?? ""}`.trim()
                    : "Employee"}
                </p>
                <p className="text-muted-foreground mt-2">Employee Code</p>
                <p className="font-semibold text-foreground">{payslip.employee?.employeeCode ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Pay Period</p>
                <p className="font-semibold text-foreground text-sm">
                  {payslip.payrollRun
                    ? `${new Date(payslip.payrollRun.year ?? 2026, (payslip.payrollRun.month ?? 1) - 1).toLocaleString("default", { month: "long" })} ${payslip.payrollRun.year}`
                    : "—"}
                </p>
                <p className="text-muted-foreground mt-2">Department</p>
                <p className="font-semibold text-foreground">{payslip.employee?.department?.name ?? "—"}</p>
              </div>
            </div>

            {/* Earnings & Deductions Table */}
            <div className="border rounded-lg overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-muted font-semibold border-b">
                  <tr>
                    <th className="p-3">Earnings</th>
                    <th className="p-3 text-right">Amount ({symbol})</th>
                    <th className="p-3">Deductions</th>
                    <th className="p-3 text-right">Amount ({symbol})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="p-3">Basic Salary</td>
                    <td className="p-3 text-right font-medium tabular-nums">{formatMoney(payslip.basicSalary ?? 0, symbol)}</td>
                    <td className="p-3">Tax / TDS</td>
                    <td className="p-3 text-right text-rose-600 font-medium tabular-nums">
                      -{formatMoney(payslip.taxDeducted ?? 0, symbol)}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3">Allowances (HRA & Benefits)</td>
                    <td className="p-3 text-right text-emerald-600 font-medium tabular-nums">+{formatMoney(payslip.allowances ?? 0, symbol)}</td>
                    <td className="p-3">PF & Other Deductions</td>
                    <td className="p-3 text-right text-rose-600 font-medium tabular-nums">
                      -{formatMoney(Math.max(0, (payslip.deductions ?? 0) - (payslip.taxDeducted ?? 0)), symbol)}
                    </td>
                  </tr>
                  <tr className="bg-muted/30 font-bold border-t">
                    <td className="p-3">Total Gross Salary</td>
                    <td className="p-3 text-right text-emerald-600 tabular-nums">
                      {formatMoney((payslip.basicSalary ?? 0) + (payslip.allowances ?? 0), symbol)}
                    </td>
                    <td className="p-3">Total Deductions</td>
                    <td className="p-3 text-right text-rose-600 tabular-nums">
                      -{formatMoney(payslip.deductions ?? 0, symbol)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Net Payable Highlights */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-primary/10 border border-primary/20">
              <div>
                <p className="text-xs font-semibold text-primary">NET PAYABLE AMOUNT</p>
                <p className="text-2xl font-extrabold text-primary tabular-nums">{formatMoney(payslip.netPay ?? 0, symbol)}</p>
              </div>
              <Button onClick={handleDownloadPdf} className="gap-2 shadow-sm">
                <Download className="size-4" /> Download PDF / Print
              </Button>
            </div>

            <p className="text-[11px] text-center text-muted-foreground">
              This is an official system-generated payslip issued by {orgName || "HRMS Platform"}.
            </p>
          </div>
        ) : (
          <p className="text-center py-6 text-sm text-muted-foreground">Payslip details not available.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
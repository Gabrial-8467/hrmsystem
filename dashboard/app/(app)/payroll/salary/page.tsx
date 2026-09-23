"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Banknote, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { api, errorMessage } from "@/lib/api/client";
import { useSession } from "@/lib/auth/session";
import { P } from "@/lib/permissions";

interface SalaryComponent {
  id: string;
  name: string;
  code: string;
  type: "EARNING" | "DEDUCTION";
  calculationType: "FIXED" | "PERCENTAGE";
  calculationValue: number;
  isTaxable: boolean;
  isRecurring: boolean;
}

interface NewComponent {
  name: string;
  code: string;
  type: "EARNING" | "DEDUCTION";
  calculationType: "FIXED" | "PERCENTAGE";
  calculationValue: number;
  isTaxable: boolean;
  isRecurring: boolean;
}

const EMPTY_FORM: NewComponent = {
  name: "",
  code: "",
  type: "EARNING",
  calculationType: "PERCENTAGE",
  calculationValue: 0,
  isTaxable: true,
  isRecurring: true,
};

export default function SalaryStructuresPage() {
  const queryClient = useQueryClient();
  const { hasPermission } = useSession();
  const canManage = hasPermission(P.salaryManage);

  const [isTypeOpen, setIsTypeOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: components, isPending } = useQuery({
    queryKey: ["salaryComponents"],
    queryFn: async () => api.get<SalaryComponent[]>("/api/v1/payroll/salary/components"),
  });

  const createMutation = useMutation({
    mutationFn: async (payload: typeof form) => api.post("/api/v1/payroll/salary/components", payload),
    onSuccess: () => {
      toast.success("Salary component created");
      setIsTypeOpen(false);
      setForm(EMPTY_FORM);
      queryClient.invalidateQueries({ queryKey: ["salaryComponents"] });
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.del(`/api/v1/payroll/salary/components/${id}`),
    onSuccess: () => {
      toast.success("Salary component deleted");
      queryClient.invalidateQueries({ queryKey: ["salaryComponents"] });
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const rows = components ?? [];

  return (
    <div className="page-container space-y-6">
      <PageHeader
        eyebrow="Payroll & Financials"
        title="Salary Structures & Pay Components"
        description="Define base pay, allowances, recurring earnings, statutory tax deductions, and PF components."
        actions={
          canManage ? (
            <Dialog open={isTypeOpen} onOpenChange={setIsTypeOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="size-4" /> Add Component
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                  <DialogTitle>Create Salary Component</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    createMutation.mutate(form);
                  }}
                  className="space-y-4 pt-2"
                >
                  <div className="space-y-2">
                    <Label htmlFor="compName">Component Name</Label>
                    <Input
                      id="compName"
                      placeholder="e.g. Medical Allowance"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="compCode">Code</Label>
                    <Input
                      id="compCode"
                      placeholder="e.g. MED"
                      maxLength={20}
                      className="uppercase"
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value })}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="compType">Type</Label>
                      <select
                        id="compType"
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                        value={form.type}
                        onChange={(e) => setForm({ ...form, type: e.target.value as "EARNING" | "DEDUCTION" })}
                      >
                        <option value="EARNING">EARNING</option>
                        <option value="DEDUCTION">DEDUCTION</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="compCalc">Calculation</Label>
                      <select
                        id="compCalc"
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                        value={form.calculationType}
                        onChange={(e) => setForm({ ...form, calculationType: e.target.value as "FIXED" | "PERCENTAGE" })}
                      >
                        <option value="FIXED">Fixed Amount</option>
                        <option value="PERCENTAGE">Percentage (%)</option>
                      </select>
                    </div>
                  </div>
                  {form.calculationType === "PERCENTAGE" && (
                    <div className="space-y-2">
                      <Label htmlFor="compValue">Percent of Gross</Label>
                      <Input
                        id="compValue"
                        type="number"
                        min={0}
                        max={100}
                        value={form.calculationValue}
                        onChange={(e) => setForm({ ...form, calculationValue: parseInt(e.target.value, 10) || 0 })}
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.isTaxable}
                        onCheckedChange={(c) => setForm({ ...form, isTaxable: !!c })}
                      />
                      Taxable component
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.isRecurring}
                        onCheckedChange={(c) => setForm({ ...form, isRecurring: !!c })}
                      />
                      Recurring each pay cycle
                    </label>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsTypeOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending}>
                      Create Component
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          ) : undefined
        }
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-3">Component Name</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Calculation Method</th>
                <th className="px-4 py-3">Taxable</th>
                {canManage && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isPending && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    Loading components…
                  </td>
                </tr>
              )}
              {!isPending && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No salary components defined yet.
                  </td>
                </tr>
              )}
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-semibold text-foreground">
                    <div className="flex items-center gap-2">
                      <span className="flex size-7 items-center justify-center rounded-md bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                        <Banknote className="size-3.5" />
                      </span>
                      {c.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{c.code}</td>
                  <td className="px-4 py-3">
                    <Badge variant={c.type === "EARNING" ? "default" : "destructive"}>{c.type}</Badge>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {c.calculationType === "PERCENTAGE" && c.calculationValue > 0
                      ? `PERCENTAGE (${c.calculationValue}%)`
                      : "FIXED"}
                  </td>
                  <td className="px-4 py-3">
                    {c.isTaxable ? <Badge variant="outline">Taxable</Badge> : <span className="text-muted-foreground">Exempt</span>}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 text-muted-foreground hover:text-rose-600 hover:bg-rose-50"
                        aria-label={`Delete ${c.name}`}
                        onClick={() => deleteMutation.mutate(c.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
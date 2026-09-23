"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, CheckCircle, XCircle, Banknote } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, errorMessage } from "@/lib/api/client";
import { useSession } from "@/lib/auth/session";
import { P } from "@/lib/permissions";

interface ExpenseClaim {
  id: string;
  employee: { id: string; firstName: string; lastName: string } | null;
  category: string;
  merchant: string | null;
  description: string;
  date: string;
  amount: number;
  currency: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "PAID";
  approvedBy: string | null;
}

const CATEGORIES = ["TRAVEL", "OFFICE", "MEALS", "EQUIPMENT", "SOFTWARE", "TRAINING", "OTHER"] as const;

const EMPTY_FORM = {
  category: "TRAVEL",
  amount: "",
  date: new Date().toISOString().slice(0, 10),
  merchant: "",
  description: "",
};

const STATUS_STYLES = {
  DRAFT: "secondary",
  SUBMITTED: "secondary",
  APPROVED: "default",
  REJECTED: "destructive",
  PAID: "outline",
} as const;

export default function ExpensesPage() {
  const queryClient = useQueryClient();
  const { hasPermission } = useSession();
  const canCreate = hasPermission(P.expensesCreate);
  const canApprove = hasPermission(P.expensesApprove);
  const canPay = hasPermission(P.expensesPay);

  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: expenses, isLoading, error } = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => api.get<ExpenseClaim[]>("/api/v1/operations/expenses"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["expenses"] });

  const submitMutation = useMutation({
    mutationFn: async (payload: { category: string; amount: number; date: string; merchant: string; description: string }) =>
      api.post("/api/v1/operations/expenses", payload),
    onSuccess: () => {
      toast.success("Expense submitted for approval!");
      setIsSubmitOpen(false);
      setForm(EMPTY_FORM);
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const transitionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "approve" | "reject" | "pay" }) =>
      api.patch(`/api/v1/operations/expenses/${id}/${action}`, {}),
    onSuccess: (_, vars) => {
      toast.success(
        vars.action === "approve" ? "Expense approved" : vars.action === "reject" ? "Expense rejected" : "Expense paid out",
      );
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid positive amount");
      return;
    }
    submitMutation.mutate({
      category: form.category,
      amount,
      date: form.date,
      merchant: form.merchant.trim(),
      description: form.description.trim(),
    });
  }

  return (
    <div className="page-container space-y-6">
      <PageHeader
        eyebrow="Financial Operations"
        title="Employee Expense Claims"
        description="Submit, approve, and reimburse employee business expenses with receipt verification."
        actions={
          canCreate ? (
            <Button className="gap-2" onClick={() => setIsSubmitOpen(true)}>
              <Plus className="size-4" /> Submit Expense
            </Button>
          ) : undefined
        }
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Merchant / Details</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td className="px-4 py-6 text-center text-muted-foreground" colSpan={7}>
                    Loading expenses...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td className="px-4 py-6 text-center text-destructive" colSpan={7}>
                    {errorMessage(error)}
                  </td>
                </tr>
              ) : expenses?.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-muted-foreground" colSpan={7}>
                    No expenses yet.
                  </td>
                </tr>
              ) : (
                expenses?.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      {e.employee ? `${e.employee.firstName} ${e.employee.lastName}` : "Employee"}
                    </td>
                    <td className="px-4 py-3 font-semibold">{e.category}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{e.merchant ?? "N/A"}</p>
                      <p className="text-xs text-muted-foreground">{e.description}</p>
                    </td>
                    <td className="px-4 py-3 text-xs">{new Date(e.date).toLocaleDateString()}</td>
                    <td className="px-4 py-3 font-bold text-foreground">
                      {e.currency} {e.amount?.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_STYLES[e.status]}>{e.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {(e.status === "DRAFT" || e.status === "SUBMITTED") && canApprove && (
                          <>
                            <Button
                              size="sm"
                              className="gap-1.5"
                              disabled={transitionMutation.isPending}
                              onClick={() => transitionMutation.mutate({ id: e.id, action: "approve" })}
                            >
                              <CheckCircle className="size-4" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="gap-1.5"
                              disabled={transitionMutation.isPending}
                              onClick={() => transitionMutation.mutate({ id: e.id, action: "reject" })}
                            >
                              <XCircle className="size-4" /> Reject
                            </Button>
                          </>
                        )}
                        {e.status === "APPROVED" && canPay && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            disabled={transitionMutation.isPending}
                            onClick={() => transitionMutation.mutate({ id: e.id, action: "pay" })}
                          >
                            <Banknote className="size-4" /> Pay
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={isSubmitOpen} onOpenChange={setIsSubmitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Expense</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="175.50"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="merchant">Merchant</Label>
              <Input
                id="merchant"
                placeholder="Delta Air Lines"
                value={form.merchant}
                onChange={(e) => setForm((f) => ({ ...f, merchant: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="What was this for?"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsSubmitOpen(false)}
                disabled={submitMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitMutation.isPending}>
                {submitMutation.isPending ? "Submitting..." : "Submit Expense"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
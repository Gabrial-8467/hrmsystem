"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, CalendarDays, Receipt, Clock } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
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
import { api, errorMessage } from "@/lib/api/client";
import { useSession } from "@/lib/auth/session";
import { toast } from "sonner";
import type { ListResult } from "@/lib/types";

type ApprovalType = "LEAVE" | "EXPENSE" | "ATTENDANCE";

interface ApprovalItem {
  id: string;
  type: ApprovalType;
  employeeName: string;
  title: string;
  subtitle: string;
  reason: string;
  date: string;
}

interface LeaveRequest {
  id: string;
  employee: { firstName: string; lastName: string } | null;
  leaveType: { name: string } | null;
  totalDays: number;
  startDate: string;
  endDate: string;
  reason: string;
  createdAt: string;
  status: string;
}

interface Expense {
  id: string;
  status: string;
  employee: { firstName: string; lastName: string } | null;
  category: string;
  amount: number;
  merchant: string | null;
  description: string;
  date: string;
}

interface Correction {
  id: string;
  date: string;
  proposedCheckIn: string;
  proposedCheckOut: string;
  reason: string;
  status: string;
  employee: { firstName: string; lastName: string; employeeCode: string };
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function ApprovalCenterPage() {
  const queryClient = useQueryClient();
  const { hasPermission } = useSession();
  const canLeave = hasPermission("leave.approve");
  const canExpense = hasPermission("expenses.approve");
  const canAttendance = hasPermission("attendance.approve");

  const [filter, setFilter] = useState<"ALL" | ApprovalType>("ALL");
  const [rejecting, setRejecting] = useState<{ id: string; type: ApprovalType } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: leaveRequests } = useQuery({
    queryKey: ["leaveRequestsApprovals"],
    queryFn: async () => api.get<ListResult<LeaveRequest>>("/api/v1/leave/requests?status=PENDING"),
    enabled: canLeave,
  });

  const { data: expenses } = useQuery({
    queryKey: ["expensesApprovals"],
    queryFn: async () => api.get<Expense[]>("/api/v1/operations/expenses"),
    enabled: canExpense,
  });

  const { data: corrections } = useQuery({
    queryKey: ["correctionsApprovals"],
    queryFn: async () => api.get<Correction[]>("/api/v1/attendance/corrections?status=PENDING"),
    enabled: canAttendance,
  });

  const items = useMemo<ApprovalItem[]>(() => {
    const list: ApprovalItem[] = [];
    for (const l of leaveRequests?.items ?? []) {
      list.push({
        id: l.id,
        type: "LEAVE",
        employeeName: l.employee ? `${l.employee.firstName} ${l.employee.lastName}` : "Employee",
        title: `Leave Request: ${l.leaveType?.name ?? "Annual Leave"} (${l.totalDays} days)`,
        subtitle: `${new Date(l.startDate).toLocaleDateString()} - ${new Date(l.endDate).toLocaleDateString()}`,
        reason: l.reason,
        date: l.createdAt,
      });
    }
    for (const e of (expenses ?? []).filter((e) => e.status === "SUBMITTED")) {
      list.push({
        id: e.id,
        type: "EXPENSE",
        employeeName: e.employee ? `${e.employee.firstName} ${e.employee.lastName}` : "Employee",
        title: `Expense Claim: ${e.category} ($${e.amount?.toFixed(2)})`,
        subtitle: `Merchant: ${e.merchant ?? "N/A"}`,
        reason: e.description ?? "",
        date: e.date,
      });
    }
    for (const c of corrections ?? []) {
      list.push({
        id: c.id,
        type: "ATTENDANCE",
        employeeName: `${c.employee.firstName} ${c.employee.lastName} (${c.employee.employeeCode})`,
        title: "Attendance Correction",
        subtitle: `${new Date(c.date).toLocaleDateString()} - Check-in ${fmtTime(c.proposedCheckIn)} Check-out ${fmtTime(c.proposedCheckOut)}`,
        reason: c.reason,
        date: c.date,
      });
    }
    return list;
  }, [leaveRequests, expenses, corrections]);

  const typeCount = (t: ApprovalType | "ALL") =>
    t === "ALL" ? items.length : items.filter((i) => i.type === t).length;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["leaveRequestsApprovals"] });
    queryClient.invalidateQueries({ queryKey: ["expensesApprovals"] });
    queryClient.invalidateQueries({ queryKey: ["correctionsApprovals"] });
  };

  const actMutation = useMutation({
    mutationFn: async ({ item, action, reason }: { item: ApprovalItem; action: "approve" | "reject"; reason?: string }) => {
      if (item.type === "LEAVE") {
        return api.patch(`/api/v1/leave/requests/${item.id}/status`, {
          status: action === "approve" ? "APPROVED" : "REJECTED",
          ...(action === "reject" ? { rejectionReason: reason } : {}),
        });
      }
      if (item.type === "EXPENSE") {
        return api.patch(`/api/v1/operations/expenses/${item.id}/${action}`, {});
      }
      return api.patch(`/api/v1/attendance/corrections/${item.id}/status`, {
        status: action === "approve" ? "APPROVED" : "REJECTED",
        ...(action === "reject" ? { rejectionReason: reason } : {}),
      });
    },
    onSuccess: (_data, vars) => {
      toast.success(`${vars.item.type} ${vars.action}d`);
      setRejecting(null);
      setRejectReason("");
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const approve = (item: ApprovalItem) => actMutation.mutate({ item, action: "approve" });
  const openReject = (item: ApprovalItem) => {
    setRejectReason("");
    setRejecting({ id: item.id, type: item.type });
  };

  return (
    <div className="page-container space-y-6">
      <PageHeader
        eyebrow="Workflow Operations"
        title="Centralized Approval Center"
        description="Review and act on pending leave requests, expense reimbursements, and attendance corrections."
      />

      <div className="flex flex-wrap gap-2 border-b pb-3">
        <Button size="sm" variant={filter === "ALL" ? "default" : "outline"} onClick={() => setFilter("ALL")}>
          All Requests ({typeCount("ALL")})
        </Button>
        {canLeave && (
          <Button size="sm" variant={filter === "LEAVE" ? "default" : "outline"} onClick={() => setFilter("LEAVE")}>
            Leave ({typeCount("LEAVE")})
          </Button>
        )}
        {canExpense && (
          <Button size="sm" variant={filter === "EXPENSE" ? "default" : "outline"} onClick={() => setFilter("EXPENSE")}>
            Expenses ({typeCount("EXPENSE")})
          </Button>
        )}
        {canAttendance && (
          <Button size="sm" variant={filter === "ATTENDANCE" ? "default" : "outline"} onClick={() => setFilter("ATTENDANCE")}>
            Attendance ({typeCount("ATTENDANCE")})
          </Button>
        )}
      </div>

      <div className="grid gap-4">
        {items.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">
            <CheckCircle2 className="size-10 mx-auto text-emerald-500 mb-2 opacity-80" />
            <p className="font-semibold text-foreground">All approvals cleared!</p>
            <p className="text-xs">There are no pending approvals matching your role at this time.</p>
          </Card>
        ) : (
          items
            .filter((item) => filter === "ALL" || item.type === filter)
            .map((item) => {
              const canAct =
                (item.type === "LEAVE" && canLeave) ||
                (item.type === "EXPENSE" && canExpense) ||
                (item.type === "ATTENDANCE" && canAttendance);
              return (
                <Card key={`${item.type}-${item.id}`} className="hover:border-primary/40 transition-colors">
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        {item.type === "LEAVE" ? (
                          <CalendarDays className="size-5" />
                        ) : item.type === "EXPENSE" ? (
                          <Receipt className="size-5" />
                        ) : (
                          <Clock className="size-5 text-amber-600" />
                        )}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">{item.employeeName}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {item.type}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium text-foreground mt-0.5">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                        <p className="text-xs text-muted-foreground italic mt-1 font-serif">&ldquo;{item.reason}&rdquo;</p>
                      </div>
                    </div>

                    {canAct && (
                      <div className="flex items-center gap-2 sm:self-center">
                        <Button
                          size="sm"
                          className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                          disabled={actMutation.isPending}
                          onClick={() => approve(item)}
                        >
                          <CheckCircle2 className="size-4" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50 shadow-sm"
                          disabled={actMutation.isPending}
                          onClick={() => openReject(item)}
                        >
                          <XCircle className="size-4" /> Reject
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
        )}
      </div>

      <Dialog
        open={rejecting !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRejecting(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {rejecting?.type} request</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!rejecting) return;
              if (rejecting.type === "EXPENSE") {
                actMutation.mutate({ item: items.find((i) => i.id === rejecting.id && i.type === "EXPENSE") as ApprovalItem, action: "reject" });
              } else {
                if (!rejectReason.trim()) {
                  toast.error("Provide a reason for rejecting");
                  return;
                }
                actMutation.mutate({ item: items.find((i) => i.id === rejecting.id && i.type === rejecting.type) as ApprovalItem, action: "reject", reason: rejectReason.trim() });
              }
            }}
            className="space-y-4"
          >
            {rejecting?.type !== "EXPENSE" && (
              <div className="space-y-2">
                <Label htmlFor="reject-reason">Rejection reason</Label>
                <Input
                  id="reject-reason"
                  placeholder="Explain why this request is being rejected"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  required
                />
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setRejecting(null);
                  setRejectReason("");
                }}
                disabled={actMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={actMutation.isPending}
              >
                {actMutation.isPending ? "Rejecting..." : "Reject Request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
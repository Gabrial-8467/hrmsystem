"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, CheckCircle, XCircle, Ban, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { api, errorMessage } from "@/lib/api/client";
import { useSession } from "@/lib/auth/session";
import { P } from "@/lib/permissions";

interface LeaveType {
  id: string;
  name: string;
  code: string;
  daysAllowedPerYear: number;
  isPaid: boolean;
  requiresApproval: boolean;
  carryForwardMax: number;
}

interface EmployeeSummary {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string | null;
}

interface BalanceEntry {
  id: string;
  employee: EmployeeSummary;
  leaveType: Pick<LeaveType, "id" | "name" | "code" | "isPaid">;
  year: number;
  allocated: number;
  used: number;
  pending: number;
  carriedOver: number;
  available: number;
}

interface LeaveRequest {
  id: string;
  employee: Pick<EmployeeSummary, "id" | "firstName" | "lastName"> | null;
  leaveType: { id: string; name: string; code: string } | null;
  startDate: string;
  endDate: string;
  totalDays: number;
  halfDay: boolean;
  reason: string;
  status: "APPROVED" | "REJECTED" | "PENDING" | "CANCELLED";
}

function computeDays(start: string, end: string, halfDay: boolean): number {
  if (!start || !end) return 0;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
  let days = Math.round((e - s) / 86_400_000) + 1;
  if (halfDay) days = Math.max(0.5, days - 0.5);
  return days;
}

const EMPTY_FORM = { leaveTypeId: "", startDate: "", endDate: "", halfDay: false, reason: "" };

export default function LeavePage() {
  const queryClient = useQueryClient();
  const { hasPermission } = useSession();
  const canApprove = hasPermission(P.leaveApprove);
  const canManage = hasPermission(P.leaveManage);

  const [isApplyOpen, setIsApplyOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [rejectTarget, setRejectTarget] = useState<LeaveRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isTypeOpen, setIsTypeOpen] = useState(false);
  const [typeForm, setTypeForm] = useState({
    name: "",
    code: "",
    daysAllowedPerYear: 12,
    isPaid: true,
    requiresApproval: true,
    carryForwardMax: 0,
  });

  const { data: requestsData, isPending, isError, refetch } = useQuery({
    queryKey: ["leaveRequests"],
    queryFn: async () => api.get<{ items: LeaveRequest[]; meta: unknown }>("/api/v1/leave/requests?limit=100"),
  });

  const { data: leaveTypes } = useQuery({
    queryKey: ["leaveTypes"],
    queryFn: async () => api.get<LeaveType[]>("/api/v1/leave/types"),
  });

  const { data: balancesData } = useQuery({
    queryKey: ["leaveBalances"],
    queryFn: async () => api.get<{ items: BalanceEntry[]; meta: unknown }>("/api/v1/leave/balances?limit=100"),
  });

  const selectedBalance = useMemo(
    () => balancesData?.items.find((b) => b.leaveType.id === form.leaveTypeId),
    [balancesData, form.leaveTypeId],
  );
  const previewDays = computeDays(form.startDate, form.endDate, form.halfDay);

  function invalidateLeave() {
    queryClient.invalidateQueries({ queryKey: ["leaveRequests"] });
    queryClient.invalidateQueries({ queryKey: ["leaveBalances"] });
    queryClient.invalidateQueries({ queryKey: ["leaveTypes"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const applyMutation = useMutation({
    mutationFn: async (payload: typeof form) => api.post("/api/v1/leave/requests", payload),
    onSuccess: () => {
      toast.success("Leave request submitted!");
      setIsApplyOpen(false);
      setForm(EMPTY_FORM);
      invalidateLeave();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const actionMutation = useMutation({
    mutationFn: async ({ id, status, rejectionReason }: { id: string; status: "APPROVED" | "REJECTED"; rejectionReason?: string }) =>
      api.patch(`/api/v1/leave/requests/${id}/status`, { status, rejectionReason }),
    onSuccess: (_, vars) => {
      toast.success(vars.status === "APPROVED" ? "Leave request approved" : "Leave request rejected");
      setRejectTarget(null);
      setRejectReason("");
      invalidateLeave();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => api.patch(`/api/v1/leave/requests/${id}/cancel`, {}),
    onSuccess: () => {
      toast.success("Leave request cancelled");
      invalidateLeave();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const createTypeMutation = useMutation({
    mutationFn: async (payload: typeof typeForm) => api.post("/api/v1/leave/types", payload),
    onSuccess: () => {
      toast.success("Leave type created");
      setIsTypeOpen(false);
      setTypeForm({ name: "", code: "", daysAllowedPerYear: 12, isPaid: true, requiresApproval: true, carryForwardMax: 0 });
      invalidateLeave();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const deleteTypeMutation = useMutation({
    mutationFn: async (id: string) => api.del(`/api/v1/leave/types/${id}`),
    onSuccess: () => {
      toast.success("Leave type deleted");
      invalidateLeave();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const requests = requestsData?.items ?? [];
  const balances = balancesData?.items ?? [];
  const totalAvailable = balances.reduce((sum, b) => sum + b.available, 0);

  return (
    <div className="page-container space-y-6">
      <PageHeader
        eyebrow="Leave Management"
        title={canApprove ? "Leave Requests & Approval Workflows" : "My Leave"}
        description={
          canApprove
            ? "Review pending leave requests, approve or reject them, and manage leave balances."
            : "Apply for leave, cancel pending requests, and keep an eye on your leave balance."
        }
        actions={
          <>
            {canManage && (
              <Dialog open={isTypeOpen} onOpenChange={setIsTypeOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Plus className="size-4" /> New Leave Type
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[460px]">
                  <DialogHeader>
                    <DialogTitle>Create Leave Type</DialogTitle>
                  </DialogHeader>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      createTypeMutation.mutate(typeForm);
                    }}
                    className="space-y-4 pt-2"
                  >
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="typeName">Name</Label>
                        <Input
                          id="typeName"
                          placeholder="e.g. Study Leave"
                          value={typeForm.name}
                          onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="typeCode">Code</Label>
                        <Input
                          id="typeCode"
                          placeholder="e.g. ST"
                          maxLength={20}
                          className="uppercase"
                          value={typeForm.code}
                          onChange={(e) => setTypeForm({ ...typeForm, code: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="daysPerYear">Days per year</Label>
                      <Input
                        id="daysPerYear"
                        type="number"
                        min={0}
                        max={365}
                        value={typeForm.daysAllowedPerYear}
                        onChange={(e) => setTypeForm({ ...typeForm, daysAllowedPerYear: parseInt(e.target.value, 10) || 0 })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="carryForward">Carry forward max</Label>
                      <Input
                        id="carryForward"
                        type="number"
                        min={0}
                        max={365}
                        value={typeForm.carryForwardMax}
                        onChange={(e) => setTypeForm({ ...typeForm, carryForwardMax: parseInt(e.target.value, 10) || 0 })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={typeForm.isPaid}
                          onCheckedChange={(c) => setTypeForm({ ...typeForm, isPaid: !!c })}
                        />
                        Paid leave
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={typeForm.requiresApproval}
                          onCheckedChange={(c) => setTypeForm({ ...typeForm, requiresApproval: !!c })}
                        />
                        Requires approval (auto-approve if off)
                      </label>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button type="button" variant="outline" onClick={() => setIsTypeOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createTypeMutation.isPending}>
                        Create Type
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            )}
            <Dialog open={isApplyOpen} onOpenChange={setIsApplyOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="size-4" /> Apply for Leave
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[460px]">
                <DialogHeader>
                  <DialogTitle>Submit Leave Application</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    applyMutation.mutate(form);
                  }}
                  className="space-y-4 pt-2"
                >
                  <div className="space-y-2">
                    <Label htmlFor="leaveType">Leave Type</Label>
                    <select
                      id="leaveType"
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                      value={form.leaveTypeId}
                      onChange={(e) => setForm({ ...form, leaveTypeId: e.target.value })}
                      required
                    >
                      <option value="">Select Leave Type</option>
                      {leaveTypes?.map((lt) => (
                        <option key={lt.id} value={lt.id}>
                          {lt.name} ({lt.daysAllowedPerYear} days/yr)
                        </option>
                      ))}
                    </select>
                    {selectedBalance && (
                      <p
                        className={cnAvailable(
                          previewDays > 0 && previewDays > selectedBalance.available,
                        )}
                      >
                        Available balance: {selectedBalance.available} days
                        {previewDays > selectedBalance.available && previewDays > 0
                          ? ` — request exceeds available leave`
                          : ""}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="startDate">Start Date</Label>
                      <Input
                        id="startDate"
                        type="date"
                        value={form.startDate}
                        onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="endDate">End Date</Label>
                      <Input
                        id="endDate"
                        type="date"
                        value={form.endDate}
                        onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  {previewDays > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Total duration: <span className="font-semibold text-foreground">{previewDays} day{previewDays === 1 ? "" : "s"}</span>
                      {form.halfDay ? " (half day)" : ""}
                    </p>
                  )}

                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.halfDay}
                      onCheckedChange={(c) => setForm({ ...form, halfDay: !!c })}
                    />
                    Half day
                  </label>

                  <div className="space-y-2">
                    <Label htmlFor="reason">Reason for Leave</Label>
                    <textarea
                      id="reason"
                      rows={3}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      placeholder="Family vacation, medical appointment..."
                      value={form.reason}
                      onChange={(e) => setForm({ ...form, reason: e.target.value })}
                      required
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={() => setIsApplyOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={applyMutation.isPending}>
                      Submit Request
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      {/* Leave balances */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base">{canApprove ? "Leave Balances" : "My Leave Balance"}</CardTitle>
            <CardDescription className="text-xs">
              {canApprove
                ? "Allocated vs available across employees"
                : `${balances.length} leave type${balances.length === 1 ? "" : "s"} · ${totalAvailable} days available`}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-1">
          {balancesData === undefined ? (
            <Skeleton className="h-40 w-full" />
          ) : balances.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No leave balances to show.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b">
                  <tr>
                    {canApprove && <th className="px-4 py-3">Employee</th>}
                    <th className="px-4 py-3">Leave Type</th>
                    <th className="px-4 py-3 text-right">Allocated</th>
                    <th className="px-4 py-3 text-right">Used</th>
                    <th className="px-4 py-3 text-right">Pending</th>
                    <th className="px-4 py-3 text-right">Carried</th>
                    <th className="px-4 py-3 text-right">Available</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {balances.map((b) => (
                    <tr key={b.id} className="hover:bg-muted/30 transition-colors">
                      {canApprove && (
                        <td className="px-4 py-3 font-medium">
                          {b.employee.firstName} {b.employee.lastName}{" "}
                          <span className="text-xs text-muted-foreground font-normal">
                            {b.employee.employeeCode ?? ""}
                          </span>
                        </td>
                      )}
                      <td className="px-4 py-3">{b.leaveType.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{b.allocated}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{b.used}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{b.pending}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{b.carriedOver}</td>
                      <td className="px-4 py-3 text-right">
                        <Badge
                          variant={b.available > 0 ? "outline" : "destructive"}
                          className="tabular-nums"
                        >
                          {b.available}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Leave requests */}
      {isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : isError ? (
        <ErrorState title="Failed to load leave requests" retry={refetch} />
      ) : (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">
              {canApprove ? "Leave Applications" : "My Requests"}
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b">
                <tr>
                  {canApprove && <th className="px-4 py-3">Employee</th>}
                  <th className="px-4 py-3">Leave Type</th>
                  <th className="px-4 py-3">Dates</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {requests.map((req: LeaveRequest) => (
                  <tr key={req.id} className="hover:bg-muted/30 transition-colors">
                    {canApprove && (
                      <td className="px-4 py-3 font-medium">
                        {req.employee ? `${req.employee.firstName} ${req.employee.lastName}` : "Employee"}
                      </td>
                    )}
                    <td className="px-4 py-3">{req.leaveType?.name ?? "Leave"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(req.startDate).toLocaleDateString()} → {new Date(req.endDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums">
                      {req.totalDays}
                      {req.halfDay ? " (half)" : ""}
                    </td>
                    <td className="px-4 py-3 text-xs max-w-[220px] truncate">{req.reason}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          req.status === "APPROVED"
                            ? "default"
                            : req.status === "REJECTED"
                              ? "destructive"
                              : req.status === "CANCELLED"
                                ? "secondary"
                                : "outline"
                        }
                      >
                        {req.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {req.status === "PENDING" && (
                        <div className="flex items-center justify-end gap-1">
                          {canApprove && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                onClick={() => actionMutation.mutate({ id: req.id, status: "APPROVED" })}
                              >
                                <CheckCircle className="size-3.5 mr-1" /> Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                onClick={() => {
                                  setRejectReason("");
                                  setRejectTarget(req);
                                }}
                              >
                                <XCircle className="size-3.5 mr-1" /> Reject
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                            onClick={() => cancelMutation.mutate(req.id)}
                          >
                            <Ban className="size-3.5 mr-1" /> Cancel
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Leave types (manage) */}
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Leave Types
            </CardTitle>
            <CardDescription className="text-xs">
              Policies that govern balances and approval flows
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-1">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(leaveTypes ?? []).map((lt) => (
                <div key={lt.id} className="flex items-start justify-between rounded-lg border p-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">{lt.name}</span>
                      <Badge variant="secondary" className="text-[10px]">{lt.code}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {lt.daysAllowedPerYear} days/yr · {lt.isPaid ? "Paid" : "Unpaid"} ·{" "}
                      {lt.requiresApproval ? "Approval required" : "Auto-approved"}
                    </p>
                    {lt.carryForwardMax > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        Carry forward up to {lt.carryForwardMax} days
                      </p>
                    )}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-muted-foreground hover:text-rose-600 hover:bg-rose-50 shrink-0"
                    aria-label={`Delete ${lt.name}`}
                    onClick={() => deleteTypeMutation.mutate(lt.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rejection reason dialog */}
      <Dialog open={rejectTarget !== null} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Reject Leave Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {rejectTarget && (
              <p className="text-xs text-muted-foreground">
                {rejectTarget.employee ? `${rejectTarget.employee.firstName} ${rejectTarget.employee.lastName}` : "Employee"} ·{" "}
                {rejectTarget.leaveType?.name ?? "Leave"} · {rejectTarget.totalDays} day{rejectTarget.totalDays === 1 ? "" : "s"}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="rejectReason">Reason for rejection</Label>
              <textarea
                id="rejectReason"
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="e.g. Insufficient balance, team coverage, policy..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={!rejectReason.trim() || actionMutation.isPending}
                onClick={() =>
                  rejectTarget &&
                  actionMutation.mutate({
                    id: rejectTarget.id,
                    status: "REJECTED",
                    rejectionReason: rejectReason.trim(),
                  })
                }
              >
                Reject Request
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function cnAvailable(over: boolean): string {
  return `text-xs ${over ? "text-rose-600 font-medium" : "text-muted-foreground"} mt-1`;
}
"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock, Plus, Trash2, UserPlus, Users } from "lucide-react";
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
import { api, errorMessage } from "@/lib/api/client";
import { useSession } from "@/lib/auth/session";
import { P } from "@/lib/permissions";

interface Shift {
  id: string;
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  breakDurationMinutes: number;
  gracePeriodMinutes: number;
  fullDayHours: number;
  halfDayHours: number;
  _count: { assignments: number };
}

interface Assignment {
  id: string;
  startDate: string;
  endDate: string | null;
  employee: { id: string; firstName: string; lastName: string; employeeCode: string };
}

interface ShiftDetail extends Shift {
  assignments: Assignment[];
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
}

const EMPTY_SHIFT = {
  name: "",
  code: "",
  startTime: "09:00",
  endTime: "18:00",
  breakDurationMinutes: 60,
  gracePeriodMinutes: 15,
  fullDayHours: 8,
  halfDayHours: 4,
};

export default function ShiftsPage() {
  const queryClient = useQueryClient();
  const { hasPermission } = useSession();
  const canManage = hasPermission(P.shiftsManage);
  const canView = hasPermission(P.shiftsView);

  const [isShiftOpen, setIsShiftOpen] = useState(false);
  const [shiftForm, setShiftForm] = useState(EMPTY_SHIFT);
  const [manageTarget, setManageTarget] = useState<Shift | null>(null);
  const [newEmployeeId, setNewEmployeeId] = useState("");
  const [newStartDate, setNewStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [newEndDate, setNewEndDate] = useState("");

  const { data: shifts, isLoading, error } = useQuery({
    queryKey: ["shifts"],
    queryFn: async () => api.get<Shift[]>("/api/v1/attendance/shifts"),
    enabled: canView,
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["shifts", manageTarget?.id],
    queryFn: async () => api.get<ShiftDetail>(`/api/v1/attendance/shifts/${manageTarget!.id}`),
    enabled: !!manageTarget,
  });

  const { data: employees } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => api.get<Employee[]>("/api/v1/employees"),
    enabled: !!manageTarget,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["shifts"] });
    if (manageTarget) queryClient.invalidateQueries({ queryKey: ["shifts", manageTarget.id] });
  };

  const createShift = useMutation({
    mutationFn: async (payload: typeof EMPTY_SHIFT) =>
      api.post("/api/v1/attendance/shifts", { ...payload, code: payload.code.toUpperCase() }),
    onSuccess: () => {
      toast.success("Shift created");
      setIsShiftOpen(false);
      setShiftForm(EMPTY_SHIFT);
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const assignEmployee = useMutation({
    mutationFn: async () =>
      api.post(`/api/v1/attendance/shifts/${manageTarget!.id}/assignments`, {
        employeeId: newEmployeeId,
        startDate: newStartDate,
        endDate: newEndDate || undefined,
      }),
    onSuccess: () => {
      toast.success("Employee assigned");
      setNewEmployeeId("");
      setNewStartDate(new Date().toISOString().slice(0, 10));
      setNewEndDate("");
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const unassign = useMutation({
    mutationFn: async (assignmentId: string) =>
      api.del(`/api/v1/attendance/shifts/assignments/${assignmentId}`),
    onSuccess: () => {
      toast.success("Assignment removed");
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const deleteShift = useMutation({
    mutationFn: async (id: string) => api.del(`/api/v1/attendance/shifts/${id}`),
    onSuccess: () => {
      toast.success("Shift deleted");
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  return (
    <div className="page-container space-y-6">
      <PageHeader
        eyebrow="Attendance & Schedules"
        title="Shift Configuration"
        description="Standard shifts and their day allowances used for attendance and payroll."
        actions={
          canManage ? (
            <Button className="gap-2" onClick={() => setIsShiftOpen(true)}>
              <Plus className="size-4" /> Create Shift
            </Button>
          ) : undefined
        }
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-3">Shift</th>
                <th className="px-4 py-3">Hours</th>
                <th className="px-4 py-3">Day Allowances</th>
                <th className="px-4 py-3">Assigned</th>
                {canManage && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td className="px-4 py-6 text-center text-muted-foreground" colSpan={canManage ? 5 : 4}>
                    Loading shifts...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td className="px-4 py-6 text-center text-destructive" colSpan={canManage ? 5 : 4}>
                    {errorMessage(error)}
                  </td>
                </tr>
              ) : shifts?.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-muted-foreground" colSpan={canManage ? 5 : 4}>
                    No shifts configured yet.
                  </td>
                </tr>
              ) : (
                shifts?.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-md bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                          <Clock className="size-3.5" />
                        </span>
                        <div>
                          <p className="font-semibold text-foreground">{s.name}</p>
                          <p className="text-xs text-muted-foreground">{s.code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {s.startTime} – {s.endTime}
                      <p className="text-xs text-muted-foreground">{s.breakDurationMinutes} min break</p>
                    </td>
                    <td className="px-4 py-3">
                      {s.fullDayHours}h / {s.halfDayHours}h
                      <p className="text-xs text-muted-foreground">Grace {s.gracePeriodMinutes} min</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary">
                        <Users className="mr-1 size-3" /> {s._count.assignments}
                      </Badge>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setManageTarget(s)}>
                            <UserPlus className="size-3.5" /> Manage
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1.5 text-destructive hover:text-destructive"
                            disabled={deleteShift.isPending}
                            onClick={() => deleteShift.mutate(s.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={isShiftOpen} onOpenChange={setIsShiftOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Shift</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createShift.mutate(shiftForm);
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="s-name">Shift Name</Label>
                <Input
                  id="s-name"
                  placeholder="Morning Shift"
                  value={shiftForm.name}
                  onChange={(e) => setShiftForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-code">Code</Label>
                <Input
                  id="s-code"
                  placeholder="MORN"
                  value={shiftForm.code}
                  onChange={(e) => setShiftForm((f) => ({ ...f, code: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="s-start">Start Time</Label>
                <Input
                  id="s-start"
                  type="time"
                  value={shiftForm.startTime}
                  onChange={(e) => setShiftForm((f) => ({ ...f, startTime: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-end">End Time</Label>
                <Input
                  id="s-end"
                  type="time"
                  value={shiftForm.endTime}
                  onChange={(e) => setShiftForm((f) => ({ ...f, endTime: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="s-break">Break (min)</Label>
                <Input
                  id="s-break"
                  type="number"
                  min={0}
                  value={shiftForm.breakDurationMinutes}
                  onChange={(e) => setShiftForm((f) => ({ ...f, breakDurationMinutes: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-grace">Grace (min)</Label>
                <Input
                  id="s-grace"
                  type="number"
                  min={0}
                  value={shiftForm.gracePeriodMinutes}
                  onChange={(e) => setShiftForm((f) => ({ ...f, gracePeriodMinutes: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-full">Full-day (h)</Label>
                <Input
                  id="s-full"
                  type="number"
                  min={0}
                  step={0.5}
                  value={shiftForm.fullDayHours}
                  onChange={(e) => setShiftForm((f) => ({ ...f, fullDayHours: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-half">Half-day (h)</Label>
                <Input
                  id="s-half"
                  type="number"
                  min={0}
                  step={0.5}
                  value={shiftForm.halfDayHours}
                  onChange={(e) => setShiftForm((f) => ({ ...f, halfDayHours: Number(e.target.value) }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsShiftOpen(false)} disabled={createShift.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={createShift.isPending}>
                {createShift.isPending ? "Creating..." : "Create Shift"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!manageTarget} onOpenChange={(open) => !open && setManageTarget(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Manage {manageTarget?.name} ({manageTarget?.code})
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Assigned employees</p>
            {detailLoading ? (
              <p className="text-sm text-muted-foreground">Loading assignments...</p>
            ) : detail?.assignments?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No employees assigned yet.</p>
            ) : (
              <div className="space-y-2">
                {detail?.assignments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {a.employee.firstName} {a.employee.lastName}{" "}
                        <span className="text-muted-foreground">({a.employee.employeeCode})</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(a.startDate).toLocaleDateString()}
                        {a.endDate ? ` – ${new Date(a.endDate).toLocaleDateString()}` : " (open-ended)"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={unassign.isPending}
                      onClick={() => unassign.mutate(a.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3 border-t pt-3">
              <p className="text-sm font-medium text-muted-foreground">Assign a new employee</p>
              <div className="space-y-2">
                <Label htmlFor="a-emp">Employee</Label>
                <select
                  id="a-emp"
                  required
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
                  value={newEmployeeId}
                  onChange={(e) => setNewEmployeeId(e.target.value)}
                >
                  <option value="" disabled>
                    Select an employee
                  </option>
                  {employees?.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName} ({emp.employeeCode})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="a-start">Start Date</Label>
                  <Input
                    id="a-start"
                    type="date"
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="a-end">End Date (optional)</Label>
                  <Input
                    id="a-end"
                    type="date"
                    value={newEndDate}
                    onChange={(e) => setNewEndDate(e.target.value)}
                  />
                </div>
              </div>
              <Button
                className="w-full gap-2"
                disabled={assignEmployee.isPending || !newEmployeeId || !manageTarget}
                onClick={() => assignEmployee.mutate()}
              >
                <UserPlus className="size-4" /> {assignEmployee.isPending ? "Assigning..." : "Assign Employee"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
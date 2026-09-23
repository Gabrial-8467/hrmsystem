"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  CheckCircle2,
  CircleDashed,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

interface Cycle {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  status: "DRAFT" | "ACTIVE" | "COMPLETED";
}

interface Goal {
  id: string;
  title: string;
  description: string | null;
  category: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  dueDate: string;
  status: string;
  employee: { id: string; firstName: string; lastName: string } | null;
}

interface Review {
  id: string;
  employee: { id: string; firstName: string; lastName: string } | null;
  reviewer: { id: string; firstName: string; lastName: string } | null;
  cycle: { id: string; title: string; status: string };
  selfRating: number | null;
  selfFeedback: string | null;
  managerRating: number | null;
  managerFeedback: string | null;
  finalRating: number | null;
  status: "DRAFT" | "SUBMITTED" | "APPROVED";
}

interface EmployeeSummary {
  id: string;
  firstName: string;
  lastName: string;
}

interface Paginated<T> {
  items: T[];
  meta: { total: number };
}

const RATING_STEPS = ["1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5", "5"];
const GOAL_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"];

function progressPct(goal: Goal): number {
  if (goal.targetValue <= 0) return 0;
  return Math.max(0, Math.min(100, (goal.currentValue / goal.targetValue) * 100));
}

export default function PerformancePage() {
  const { hasPermission } = useSession();
  const queryClient = useQueryClient();

  const canManage = hasPermission(P.performanceManage);
  const canView = hasPermission(P.performanceView);

  const [createOpen, setCreateOpen] = useState(false);
  const [cycleOpen, setCycleOpen] = useState(false);
  const [progressTarget, setProgressTarget] = useState<Goal | null>(null);
  const [reviewCreateOpen, setReviewCreateOpen] = useState(false);
  const [selfTarget, setSelfTarget] = useState<Review | null>(null);
  const [managerTarget, setManagerTarget] = useState<Review | null>(null);

  const cyclesQuery = useQuery({
    queryKey: ["performance-cycles"],
    queryFn: async () => api.get<Paginated<Cycle>>("/api/v1/performance/cycles"),
  });

  const goalsQuery = useQuery({
    queryKey: ["performance-goals"],
    queryFn: async () => api.get<Paginated<Goal>>("/api/v1/performance/goals"),
  });

  const reviewsQuery = useQuery({
    queryKey: ["performance-reviews"],
    queryFn: async () => api.get<Paginated<Review>>("/api/v1/performance/reviews?limit=50"),
  });

  const employeesQuery = useQuery({
    queryKey: ["employees"],
    queryFn: async () => api.get<Paginated<EmployeeSummary>>("/api/v1/employees?limit=200"),
    enabled: canManage,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["performance-cycles"] });
    queryClient.invalidateQueries({ queryKey: ["performance-goals"] });
    queryClient.invalidateQueries({ queryKey: ["performance-reviews"] });
  };

  const cycleMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      api.patch(`/api/v1/performance/cycles/${id}/status`, { status }),
    onSuccess: (_d, vars) => {
      toast.success(`Cycle ${vars.status === "ACTIVE" ? "activated" : "completed"}`);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const selfMutation = useMutation({
    mutationFn: async (body: { id: string; selfRating: number; selfFeedback: string; submit: boolean }) =>
      api.patch(`/api/v1/performance/reviews/${body.id}/self`, {
        selfRating: body.selfRating,
        selfFeedback: body.selfFeedback || null,
        submit: body.submit,
      }),
    onSuccess: (_d, vars) => {
      toast.success(vars.submit ? "Self-assessment submitted" : "Self-assessment saved");
      setSelfTarget(null);
      queryClient.invalidateQueries({ queryKey: ["performance-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const startSelfMutation = useMutation({
    mutationFn: async (cycleId: string) =>
      api.post("/api/v1/performance/reviews", { cycleId }),
    onSuccess: () => {
      toast.success("Self-assessment started");
      queryClient.invalidateQueries({ queryKey: ["performance-reviews"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const employees = employeesQuery.data?.items ?? [];

  if (cyclesQuery.isLoading || goalsQuery.isLoading) {
    return (
      <div className="page-container space-y-6">
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (cyclesQuery.isError || goalsQuery.isError) {
    return <ErrorState title="Could not load performance data" />;
  }

  const cycles = cyclesQuery.data?.items ?? [];
  const goals = goalsQuery.data?.items ?? [];
  const reviews = reviewsQuery.data?.items ?? [];
  const activeCycle = cycles.find((c) => c.status === "ACTIVE");

  return (
    <div className="page-container space-y-6">
      <PageHeader
        eyebrow="Performance & Talent"
        title="Performance Cycles, Goals & Reviews"
        description="Track employee KPIs, individual goals, self-assessments, and quarterly manager reviews."
        actions={
          <>
            {canManage && (
              <Button variant="outline" className="gap-2" onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" /> Create Goal
              </Button>
            )}
            {canManage && (
              <Button variant="outline" className="gap-2" onClick={() => setReviewCreateOpen(true)}>
                <Plus className="size-4" /> New Review
              </Button>
            )}
            {canManage && (
              <Button className="gap-2" onClick={() => setCycleOpen(true)}>
                <Plus className="size-4" /> Add Cycle
              </Button>
            )}
          </>
        }
      />

      {(canView || canManage) && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Performance Cycles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {cycles.length === 0 && (
                <p className="text-sm text-muted-foreground">No cycles yet.</p>
              )}
              {cycles.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                  <div>
                    <p className="font-semibold text-sm">{c.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(c.startDate).toLocaleDateString()} - {new Date(c.endDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={c.status === "ACTIVE" ? "default" : "secondary"}>{c.status}</Badge>
                    {canManage && c.status === "DRAFT" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        title="Activate cycle"
                        onClick={() => cycleMutation.mutate({ id: c.id, status: "ACTIVE" })}
                      >
                        <CircleDashed className="size-4" />
                      </Button>
                    )}
                    {canManage && c.status === "ACTIVE" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        title="Complete cycle"
                        onClick={() => cycleMutation.mutate({ id: c.id, status: "COMPLETED" })}
                      >
                        <CheckCircle2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Target Goals & Milestones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {goals.length === 0 && (
                <p className="text-sm text-muted-foreground">No goals yet.</p>
              )}
              {goals.map((g) => (
                <div key={g.id} className="p-3 rounded-lg border bg-muted/20 space-y-2">
                  <div className="flex justify-between items-center text-sm font-semibold">
                    <span className="truncate">
                      {g.title}
                      {g.employee && (
                        <span className="ml-2 font-normal text-muted-foreground">
                          · {g.employee.firstName} {g.employee.lastName}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary">
                        {Math.round(progressPct(g))}%
                      </Badge>
                      <Badge variant="outline">{g.status}</Badge>
                      {canManage && (
                        <Button size="icon" variant="ghost" className="size-7" onClick={() => setProgressTarget(g)}>
                          <Pencil className="size-3.5" />
                        </Button>
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{g.description}</p>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${progressPct(g)}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="text-base">
            {canView ? "Reviews" : "My Reviews"}
          </CardTitle>
          {!canView &&
            activeCycle &&
            !reviews.some((r) => r.cycle?.id === activeCycle.id && r.status !== "APPROVED") && (
              <Button size="sm" variant="outline" className="gap-2" onClick={() => startSelfMutation.mutate(activeCycle.id)}>
                <RotateCcw className="size-4" /> Start self-assessment
              </Button>
            )}
        </CardHeader>
        <CardContent className="space-y-3">
          {reviews.length === 0 && (
            <p className="text-sm text-muted-foreground">No reviews yet.</p>
          )}
          {reviews.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
              <div>
                <p className="font-semibold text-sm">
                  {r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : "Employee"}
                  {!canView && " (you)"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.cycle?.title ?? "Cycle"} · Self {r.selfRating ?? "-"} · Manager {r.managerRating ?? "-"} ·
                  Final {r.finalRating ?? "-"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={r.status === "APPROVED" ? "default" : r.status === "SUBMITTED" ? "secondary" : "outline"}>
                  {r.status}
                </Badge>
                {canManage && r.status !== "APPROVED" && (
                  <Button size="sm" variant="outline" onClick={() => setManagerTarget(r)}>
                    Manager review
                  </Button>
                )}
                {!canManage && r.status !== "APPROVED" && (
                  <Button size="sm" variant="outline" onClick={() => setSelfTarget(r)}>
                    Self-assessment
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {canManage && (
        <CreateGoalDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          employees={employees}
          onSaved={() => {
            setCreateOpen(false);
            invalidate();
          }}
        />
      )}

      {canManage && (
        <CreateCycleDialog
          open={cycleOpen}
          onOpenChange={setCycleOpen}
          onSaved={() => {
            setCycleOpen(false);
            invalidate();
          }}
        />
      )}

      {canManage && (
        <ProgressGoalDialog
          goal={progressTarget}
          onOpenChange={(open) => !open && setProgressTarget(null)}
          onSaved={() => {
            setProgressTarget(null);
            invalidate();
          }}
        />
      )}

      {canManage && (
        <CreateReviewDialog
          open={reviewCreateOpen}
          onOpenChange={setReviewCreateOpen}
          employees={employees}
          cycles={cycles.filter((c) => c.status !== "COMPLETED")}
          onSaved={() => {
            setReviewCreateOpen(false);
            queryClient.invalidateQueries({ queryKey: ["performance-reviews"] });
          }}
        />
      )}

      {!canManage && (
        <SelfAssessmentDialog
          review={selfTarget}
          onOpenChange={(open) => !open && setSelfTarget(null)}
          onSubmit={(selfRating, selfFeedback, submit) =>
            selfTarget && selfMutation.mutate({ id: selfTarget.id, selfRating, selfFeedback, submit })
          }
        />
      )}

      {canManage && (
        <ManagerReviewDialog
          review={managerTarget}
          onOpenChange={(open) => !open && setManagerTarget(null)}
          onSaved={() => {
            setManagerTarget(null);
            queryClient.invalidateQueries({ queryKey: ["performance-reviews"] });
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

function CreateGoalDialog({
  open,
  onOpenChange,
  employees,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: EmployeeSummary[];
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    employeeId: "",
    title: "",
    description: "",
    category: "INDIVIDUAL",
    targetValue: "100",
    unit: "%",
    dueDate: "",
  });
  const mutation = useMutation({
    mutationFn: async () =>
      api.post("/api/v1/performance/goals", {
        employeeId: form.employeeId,
        title: form.title,
        description: form.description || undefined,
        category: form.category,
        targetValue: Number(form.targetValue),
        unit: form.unit,
        dueDate: form.dueDate,
      }),
    onSuccess: () => {
      toast.success("Goal created");
      setForm({ employeeId: "", title: "", description: "", category: "INDIVIDUAL", targetValue: "100", unit: "%", dueDate: "" });
      onSaved();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const valid = form.employeeId && form.title.trim() && form.dueDate;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Create Goal</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="space-y-2">
            <Label>Employee</Label>
            <select
              value={form.employeeId}
              onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select an employee...</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="goalTitle">Title</Label>
            <Input id="goalTitle" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Ship the reporting module" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="goalDescription">Description</Label>
            <textarea
              id="goalDescription"
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Category</Label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="INDIVIDUAL">Individual</option>
                <option value="TEAM">Team</option>
                <option value="COMPANY">Company</option>
                <option value="DEVELOPMENT">Development</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="goalTarget">Target value</Label>
              <Input id="goalTarget" type="number" min={0} value={form.targetValue} onChange={(e) => setForm({ ...form, targetValue: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="goalUnit">Unit</Label>
              <Input id="goalUnit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="%" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="goalDue">Due date</Label>
            <Input id="goalDue" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            Create Goal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateCycleDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ title: "", startDate: "", endDate: "" });
  const mutation = useMutation({
    mutationFn: async () =>
      api.post("/api/v1/performance/cycles", {
        title: form.title,
        startDate: form.startDate,
        endDate: form.endDate,
      }),
    onSuccess: () => {
      toast.success("Cycle created (draft)");
      setForm({ title: "", startDate: "", endDate: "" });
      onSaved();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const valid = form.title.trim() && form.startDate && form.endDate && new Date(form.endDate) > new Date(form.startDate);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Add Performance Cycle</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="space-y-2">
            <Label htmlFor="cycleTitle">Title</Label>
            <Input id="cycleTitle" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Q4 2026 Performance Review" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="cycleStart">Start date</Label>
              <Input id="cycleStart" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cycleEnd">End date</Label>
              <Input id="cycleEnd" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            Create Cycle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProgressGoalDialog({
  goal,
  onOpenChange,
  onSaved,
}: {
  goal: Goal | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [currentValue, setCurrentValue] = useState("");
  const [status, setStatus] = useState("");
  const mutation = useMutation({
    mutationFn: async () =>
      api.patch(`/api/v1/performance/goals/${goal?.id}`, {
        currentValue: currentValue !== "" ? Number(currentValue) : undefined,
        status: status || undefined,
      }),
    onSuccess: () => {
      toast.success("Goal updated");
      setCurrentValue("");
      setStatus("");
      onSaved();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const value = goal ? (currentValue === "" ? String(goal.currentValue) : currentValue) : "";
  const selStatus = goal ? (status === "" ? goal.status : status) : "";

  return (
    <Dialog open={goal !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Update Goal Progress</DialogTitle>
        </DialogHeader>
        {goal && (
          <div className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">{goal.title}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Current value ({goal.unit})</Label>
                <Input type="number" min={0} value={value} onChange={(e) => setCurrentValue(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <select
                  value={selStatus}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {GOAL_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateReviewDialog({
  open,
  onOpenChange,
  employees,
  cycles,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: EmployeeSummary[];
  cycles: Cycle[];
  onSaved: () => void;
}) {
  const [cycleId, setCycleId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const mutation = useMutation({
    mutationFn: async () =>
      api.post("/api/v1/performance/reviews", { cycleId, employeeId }),
    onSuccess: () => {
      toast.success("Review opened");
      setCycleId("");
      setEmployeeId("");
      onSaved();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const valid = cycleId && employeeId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Open a Review</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="space-y-2">
            <Label>Cycle</Label>
            <select
              value={cycleId}
              onChange={(e) => setCycleId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select a cycle...</option>
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Employee</Label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select an employee...</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            Open Review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SelfAssessmentDialog({
  review,
  onOpenChange,
  onSubmit,
}: {
  review: Review | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (selfRating: number, selfFeedback: string, submit: boolean) => void;
}) {
  const [rating, setRating] = useState("");
  const [feedback, setFeedback] = useState("");

  const reviewOpen = review !== null;
  const selected = reviewOpen ? (rating === "" ? String(review.selfRating ?? "") : rating) : "";
  const feed = reviewOpen ? (feedback === "" ? review.selfFeedback ?? "" : feedback) : "";

  return (
    <Dialog open={reviewOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Self-Assessment</DialogTitle>
        </DialogHeader>
        {review && (
          <div className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">{review.cycle?.title ?? "Cycle"}</p>
            <div className="space-y-2">
              <Label>Self rating (1–5)</Label>
              <select
                value={selected}
                onChange={(e) => setRating(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select...</option>
                {RATING_STEPS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>What went well &amp; areas to grow</Label>
              <textarea
                rows={4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={feed}
                onChange={(e) => setFeedback(e.target.value)}
              />
            </div>
          </div>
        )}
        <DialogFooter className="justify-between sm:justify-between">
          <Button
            variant="outline"
            disabled={!selected || !feed.trim()}
            onClick={() => onSubmit(Number(selected), feed, false)}
          >
            Save draft
          </Button>
          <Button
            disabled={!selected || !feed.trim()}
            onClick={() => onSubmit(Number(selected), feed, true)}
          >
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManagerReviewDialog({
  review,
  onOpenChange,
  onSaved,
}: {
  review: Review | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [managerRating, setManagerRating] = useState("");
  const [managerFeedback, setManagerFeedback] = useState("");
  const [finalRating, setFinalRating] = useState("");
  const mutation = useMutation({
    mutationFn: async () =>
      api.patch(`/api/v1/performance/reviews/${review?.id}/manager`, {
        managerRating: Number(managerRating),
        managerFeedback: managerFeedback || null,
        finalRating: Number(finalRating),
      }),
    onSuccess: () => {
      toast.success("Review approved");
      setManagerRating("");
      setManagerFeedback("");
      setFinalRating("");
      onSaved();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const valid = review !== null && managerRating && finalRating;

  return (
    <Dialog open={review !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Manager Review</DialogTitle>
        </DialogHeader>
        {review && (
          <div className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">
              {review.employee ? `${review.employee.firstName} ${review.employee.lastName}` : "Employee"} ·{" "}
              {review.cycle?.title ?? "Cycle"} · Self {review.selfRating ?? "-"}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Manager rating (1–5)</Label>
                <select
                  value={managerRating}
                  onChange={(e) => setManagerRating(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select...</option>
                  {RATING_STEPS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Final rating (1–5)</Label>
                <select
                  value={finalRating}
                  onChange={(e) => setFinalRating(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select...</option>
                  {RATING_STEPS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Manager feedback</Label>
              <textarea
                rows={4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={managerFeedback}
                onChange={(e) => setManagerFeedback(e.target.value)}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            Approve &amp; Finalize
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
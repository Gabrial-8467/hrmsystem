"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  UserCheck,
  Plus,
  ClipboardList,
  PlusCircle,
  Trash2,
  CheckCircle2,
  Circle,
  Pencil,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { toast } from "sonner";
import { useSession } from "@/lib/auth/session";
import { P } from "@/lib/permissions";
import type { ListResult } from "@/lib/types";

type TaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";
type AssignStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

interface OnboardingTask {
  id: string;
  title: string;
  description: string | null;
  order: number;
  status: TaskStatus;
  completedAt: string | null;
}

interface TemplateTask {
  title: string;
  description?: string;
  dueInDays: number;
  optional: boolean;
}

interface OnboardingTemplate {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  tasks: Array<{ id: string; title: string; order: number; dueInDays: number; optional: boolean }>;
  _count?: { assignments: number };
}

interface Assignment {
  id: string;
  status: AssignStatus;
  createdAt: string;
  completedAt: string | null;
  remainingTasks: number;
  employee: { id: string; firstName: string; lastName: string; employeeCode: string };
  template: { id: string; name: string; description: string | null };
  progress: { completed: number; total: number; percent: number };
  tasks: OnboardingTask[];
}

interface EmpRow {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
}

const STATUS_STYLE: Record<AssignStatus, "warning" | "secondary" | "success"> = {
  NOT_STARTED: "warning",
  IN_PROGRESS: "secondary",
  COMPLETED: "success",
};

const EMPTY_TEMPLATE = {
  name: "",
  description: "",
  tasks: [{ title: "", description: "", dueInDays: 7, optional: false }] as TemplateTask[],
};

export default function OnboardingPage() {
  const queryClient = useQueryClient();
  const { hasPermission } = useSession();
  const canManage = hasPermission(P.onboardingManage);

  const [statusFilter, setStatusFilter] = useState<AssignStatus | "ALL">("ALL");
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ employeeId: "", templateId: "" });
  const [selected, setSelected] = useState<Assignment | null>(null);
  const [isTmplOpen, setIsTmplOpen] = useState(false);
  const [tmplForm, setTmplForm] = useState(EMPTY_TEMPLATE);
  const [editingTmpl, setEditingTmpl] = useState<OnboardingTemplate | null>(null);

  const { data: assignments, isLoading, error } = useQuery({
    queryKey: ["onboarding", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      return api.get<Assignment[]>(`/api/v1/onboarding/assignments?${params.toString()}`);
    },
  });

  const { data: templates } = useQuery({
    queryKey: ["onboarding-templates"],
    queryFn: async () => api.get<OnboardingTemplate[]>("/api/v1/onboarding/templates"),
    enabled: hasPermission(P.onboardingView),
  });

  const { data: employees } = useQuery({
    queryKey: ["employees", "onboarding"],
    queryFn: async () => {
      const res = await api.get<ListResult<EmpRow>>("/api/v1/employees?page=1&limit=100");
      return res.items;
    },
    enabled: canManage,
  });

  const employeeOptions = useMemo(() => employees ?? [], [employees]);

  const all = useMemo(() => assignments ?? [], [assignments]);

  const kpis = useMemo(() => {
    const active = all.filter((a) => a.status !== "COMPLETED").length;
    const completed = all.filter((a) => a.status === "COMPLETED").length;
    const inProgress = all.filter((a) => a.status === "IN_PROGRESS").length;
    return { active, completed, inProgress };
  }, [all]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["onboarding"] });
    queryClient.invalidateQueries({ queryKey: ["onboarding-templates"] });
  };

  const assignMutation = useMutation({
    mutationFn: async (payload: typeof assignForm) => api.post("/api/v1/onboarding/assignments", payload),
    onSuccess: () => {
      toast.success("Onboarding assigned");
      setIsAssignOpen(false);
      setAssignForm({ employeeId: "", templateId: "" });
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const taskMutation = useMutation({
    mutationFn: async ({ assignmentId, taskId, status }: { assignmentId: string; taskId: string; status: TaskStatus }) =>
      api.patch(`/api/v1/onboarding/assignments/${assignmentId}/tasks/${taskId}`, { status }),
    onSuccess: () => {
      toast.success("Task updated");
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const templateSaveMutation = useMutation({
    mutationFn: async () => {
      const tasks = tmplForm.tasks
        .filter((t) => t.title.trim())
        .map((t, index) => ({
          title: t.title.trim(),
          description: t.description?.trim() || undefined,
          order: index,
          dueInDays: t.dueInDays,
          optional: t.optional,
        }));
      if (editingTmpl) {
        return api.patch(`/api/v1/onboarding/templates/${editingTmpl.id}`, {
          name: tmplForm.name,
          description: tmplForm.description || null,
          tasks,
        });
      }
      return api.post("/api/v1/onboarding/templates", {
        name: tmplForm.name,
        description: tmplForm.description || undefined,
        tasks,
      });
    },
    onSuccess: () => {
      toast.success(editingTmpl ? "Template updated" : "Template created");
      setIsTmplOpen(false);
      setTmplForm(EMPTY_TEMPLATE);
      setEditingTmpl(null);
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const templateDeleteMutation = useMutation({
    mutationFn: async (id: string) => api.del(`/api/v1/onboarding/templates/${id}`),
    onSuccess: () => {
      toast.success("Template deleted");
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  function openCreateTemplate() {
    setEditingTmpl(null);
    setTmplForm(EMPTY_TEMPLATE);
    setIsTmplOpen(true);
  }

  function openEditTemplate(t: OnboardingTemplate) {
    setEditingTmpl(t);
    setTmplForm({
      name: t.name,
      description: t.description ?? "",
      tasks: t.tasks.map((task) => ({
        title: task.title,
        description: "",
        dueInDays: task.dueInDays,
        optional: task.optional,
      })),
    });
    setIsTmplOpen(true);
  }

  return (
    <div className="page-container space-y-6">
      <PageHeader
        eyebrow="New Hire Enablement"
        title="Onboarding Workflows"
        description="Structure, track, and complete onboarding for every new joiner."
        actions={
          canManage ? (
            <div className="flex gap-2">
              <Button variant="outline" className="gap-2" onClick={openCreateTemplate}>
                <ClipboardList className="size-4" /> Templates
              </Button>
              <Button className="gap-2" onClick={() => setIsAssignOpen(true)}>
                <Plus className="size-4" /> Assign Onboarding
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UserCheck className="size-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Active Onboardings</p>
              <p className="text-xl font-bold tabular-nums">{kpis.active}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
              <Pencil className="size-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">In Progress</p>
              <p className="text-xl font-bold tabular-nums">{kpis.inProgress}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
              <CheckCircle2 className="size-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Completed</p>
              <p className="text-xl font-bold tabular-nums">{kpis.completed}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["ALL", "NOT_STARTED", "IN_PROGRESS", "COMPLETED"] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? "default" : "outline"}
            onClick={() => setStatusFilter(s)}
          >
            {s === "ALL" ? "All" : s.replace("_", " ")}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading onboarding...</p>
      ) : error ? (
        <p className="text-sm text-destructive">{errorMessage(error)}</p>
      ) : all.length === 0 ? (
        <p className="text-sm text-muted-foreground">No onboarding assignments for this view.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {all.map((a) => (
            <Card key={a.id} className="cursor-pointer transition-colors hover:border-primary/50" onClick={() => setSelected(a)}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <UserCheck className="size-5" />
                  </span>
                  <div>
                    <CardTitle className="text-base font-semibold">
                      {a.employee.firstName} {a.employee.lastName}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">{a.employee.employeeCode}</span>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">{a.template.name}</p>
                  </div>
                </div>
                <Badge variant={STATUS_STYLE[a.status]}>{a.status.replace("_", " ")}</Badge>
              </CardHeader>
              <CardContent className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {a.progress.completed}/{a.progress.total} tasks completed
                  </span>
                  <span>{a.remainingTasks} remaining</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${a.progress.percent}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isAssignOpen} onOpenChange={setIsAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Onboarding</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              assignMutation.mutate(assignForm);
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="onb-emp">Employee</Label>
              <select
                id="onb-emp"
                required
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
                value={assignForm.employeeId}
                onChange={(e) => setAssignForm((f) => ({ ...f, employeeId: e.target.value }))}
              >
                <option value="" disabled>
                  Select employee
                </option>
                {employeeOptions.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName} ({emp.employeeCode})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="onb-tmpl">Template</Label>
              <select
                id="onb-tmpl"
                required
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
                value={assignForm.templateId}
                onChange={(e) => setAssignForm((f) => ({ ...f, templateId: e.target.value }))}
              >
                <option value="" disabled>
                  Select template
                </option>
                {templates?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.tasks.length} tasks)
                  </option>
                ))}
              </select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAssignOpen(false)} disabled={assignMutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={assignMutation.isPending}>
                {assignMutation.isPending ? "Assigning..." : "Assign"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        {selected && (
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="pr-8">
                {selected.employee.firstName} {selected.employee.lastName}
                <span className="ml-2 text-sm font-normal text-muted-foreground">{selected.employee.employeeCode}</span>
              </DialogTitle>
            </DialogHeader>
            <div className="-mt-1 flex items-center gap-2 text-sm">
              <Badge variant={STATUS_STYLE[selected.status]}>{selected.status.replace("_", " ")}</Badge>
              <span className="text-muted-foreground">{selected.template.name}</span>
              <span className="ml-auto text-xs font-medium">
                {selected.progress.percent}% complete
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${selected.progress.percent}%` }} />
            </div>
            <div className="space-y-2">
              {selected.tasks.map((task) => (
                <div key={task.id} className="rounded-lg border bg-muted/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {task.status === "COMPLETED" ? (
                        <CheckCircle2 className="mr-1.5 inline size-4 text-emerald-600" />
                      ) : task.status === "IN_PROGRESS" ? (
                        <Circle className="mr-1.5 inline size-4 text-amber-500" />
                      ) : (
                        <Circle className="mr-1.5 inline size-4 text-muted-foreground" />
                      )}
                      {task.title}
                    </p>
                    <div className="flex shrink-0 gap-1">
                      {(["PENDING", "IN_PROGRESS", "COMPLETED"] as TaskStatus[]).map((s) => (
                        <Button
                          key={s}
                          size="sm"
                          variant={task.status === s ? "default" : "outline"}
                          className="h-7 px-2 text-[11px]"
                          disabled={taskMutation.isPending || selected.status === "COMPLETED"}
                          onClick={() =>
                            taskMutation.mutate({ assignmentId: selected.id, taskId: task.id, status: s })
                          }
                        >
                          {s === "IN_PROGRESS" ? "In Progress" : s.charAt(0) + s.slice(1).toLowerCase()}
                        </Button>
                      ))}
                    </div>
                  </div>
                  {task.description && <p className="mt-1 text-xs text-muted-foreground">{task.description}</p>}
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelected(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={isTmplOpen} onOpenChange={setIsTmplOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingTmpl ? "Edit Template" : "New Onboarding Template"}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              templateSaveMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tmpl-name">Name</Label>
                <Input
                  id="tmpl-name"
                  required
                  placeholder="Sales Onboarding"
                  value={tmplForm.name}
                  onChange={(e) => setTmplForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tmpl-desc">Description</Label>
                <Input
                  id="tmpl-desc"
                  placeholder="Optional"
                  value={tmplForm.description}
                  onChange={(e) => setTmplForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tasks</Label>
              {tmplForm.tasks.map((task, index) => (
                <div key={index} className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2">
                  <Input
                    placeholder="Task title"
                    value={task.title}
                    onChange={(e) => {
                      const tasks = [...tmplForm.tasks];
                      tasks[index] = { ...tasks[index], title: e.target.value };
                      setTmplForm((f) => ({ ...f, tasks }));
                    }}
                  />
                  <Input
                    type="number"
                    min={0}
                    max={365}
                    className="w-20"
                    value={task.dueInDays}
                    onChange={(e) => {
                      const tasks = [...tmplForm.tasks];
                      tasks[index] = { ...tasks[index], dueInDays: Number(e.target.value) };
                      setTmplForm((f) => ({ ...f, tasks }));
                    }}
                  />
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={task.optional}
                      onChange={(e) => {
                        const tasks = [...tmplForm.tasks];
                        tasks[index] = { ...tasks[index], optional: e.target.checked };
                        setTmplForm((f) => ({ ...f, tasks }));
                      }}
                    />
                    Optional
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => setTmplForm((f) => ({ ...f, tasks: f.tasks.filter((_, i) => i !== index) }))}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() =>
                  setTmplForm((f) => ({
                    ...f,
                    tasks: [...f.tasks, { title: "", description: "", dueInDays: 7, optional: false }],
                  }))
                }
              >
                <PlusCircle className="size-4" /> Add task
              </Button>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsTmplOpen(false)} disabled={templateSaveMutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={templateSaveMutation.isPending}>
                {templateSaveMutation.isPending ? "Saving..." : editingTmpl ? "Save Changes" : "Create Template"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {templates && templates.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Templates</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Tasks</th>
                  <th className="px-4 py-3">Assignments</th>
                  <th className="px-4 py-3">{canManage ? "Actions" : ""}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {templates.map((t) => (
                  <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      {t.name}
                      {t.isDefault && <Badge variant="secondary" className="ml-2 text-[10px]">Default</Badge>}
                      <p className="text-xs text-muted-foreground">{t.description ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{t.tasks.length}</td>
                    <td className="px-4 py-3 tabular-nums">{t._count?.assignments ?? 0}</td>
                    <td className="px-4 py-3 text-right">
                      {canManage && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEditTemplate(t)}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            disabled={templateDeleteMutation.isPending}
                            onClick={() => templateDeleteMutation.mutate(t.id)}
                          >
                            <Trash2 className="size-3.5" />
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
    </div>
  );
}
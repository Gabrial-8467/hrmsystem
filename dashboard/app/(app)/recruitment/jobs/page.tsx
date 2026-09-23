"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, MapPin, Users, Pencil, Trash2, Briefcase } from "lucide-react";
import { toast } from "sonner";

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
import { useSession } from "@/lib/auth/session";
import { P } from "@/lib/permissions";

interface Job {
  id: string;
  title: string;
  code: string;
  status: "DRAFT" | "OPEN" | "CLOSED" | "ON_HOLD";
  description: string;
  location: string | null;
  employmentType: string;
  positionsCount: number;
  department: { id: string; name: string } | null;
  _count: { candidates: number };
}

interface Department {
  id: string;
  name: string;
}

const JOB_STATUS = ["DRAFT", "OPEN", "CLOSED", "ON_HOLD"] as const;
const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"] as const;

const EMPTY_FORM = {
  title: "",
  code: "",
  description: "",
  location: "",
  departmentId: "",
  employmentType: "FULL_TIME",
  status: "OPEN",
  positionsCount: 1,
};

export default function JobsPage() {
  const queryClient = useQueryClient();
  const { hasPermission } = useSession();
  const canManage = hasPermission(P.jobsManage);

  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<Job | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: jobs, isLoading, error } = useQuery({
    queryKey: ["jobs"],
    queryFn: async () => api.get<Job[]>("/api/v1/recruitment/jobs"),
  });

  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => api.get<Department[]>("/api/v1/departments"),
    enabled: canManage,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["jobs"] });

  const saveMutation = useMutation({
    mutationFn: async (payload: typeof EMPTY_FORM) => {
      const body = {
        ...payload,
        code: payload.code.toUpperCase(),
        departmentId: payload.departmentId || null,
        location: payload.location || null,
      };
      if (editing) {
        return api.patch(`/api/v1/recruitment/jobs/${editing.id}`, body);
      }
      return api.post("/api/v1/recruitment/jobs", body);
    },
    onSuccess: () => {
      toast.success(editing ? "Job opening updated" : "Job opening posted");
      setIsOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      api.patch(`/api/v1/recruitment/jobs/${id}`, { status }),
    onSuccess: () => {
      toast.success("Job status updated");
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.del(`/api/v1/recruitment/jobs/${id}`),
    onSuccess: () => {
      toast.success("Job opening deleted");
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setIsOpen(true);
  }

  function openEdit(j: Job) {
    setEditing(j);
    setForm({
      title: j.title,
      code: j.code,
      description: j.description,
      location: j.location ?? "",
      departmentId: j.department?.id ?? "",
      employmentType: j.employmentType,
      status: j.status,
      positionsCount: j.positionsCount,
    });
    setIsOpen(true);
  }

  return (
    <div className="page-container space-y-6">
      <PageHeader
        eyebrow="Recruitment & ATS"
        title="Job Openings & Requisitions"
        description="Manage open requisitions, job descriptions, location requirements, and candidate pipelines."
        actions={
          canManage ? (
            <Button className="gap-2" onClick={openCreate}>
              <Plus className="size-4" /> Post New Job
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading job openings...</p>
      ) : error ? (
        <p className="text-sm text-destructive">{errorMessage(error)}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobs?.length === 0 && (
            <p className="col-span-full text-sm text-muted-foreground">No job openings yet.</p>
          )}
          {jobs?.map((job) => (
            <Card key={job.id} className="hover:border-primary/50 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-base font-semibold">{job.title}</CardTitle>
                  <p className="text-xs font-mono text-muted-foreground">{job.code}</p>
                </div>
                <Badge variant={job.status === "OPEN" ? "default" : job.status === "CLOSED" ? "destructive" : "secondary"}>
                  {job.status}
                </Badge>
              </CardHeader>
              <CardContent className="pt-2 text-sm space-y-3">
                <p className="text-xs text-muted-foreground line-clamp-2">{job.description}</p>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground border-t pt-3">
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3.5" /> {job.location || "Remote"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Briefcase className="size-3.5" /> {job.employmentType}
                  </span>
                  <span className="flex items-center gap-1 font-medium text-foreground">
                    <Users className="size-3.5 text-primary" /> {job._count.candidates} Applicants
                  </span>
                </div>
                {canManage && (
                  <div className="flex items-center justify-between border-t pt-3">
                    <select
                      aria-label="Job status"
                      className="h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
                      value={job.status}
                      onChange={(e) => statusMutation.mutate({ id: job.id, status: e.target.value })}
                    >
                      {JOB_STATUS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openEdit(job)}>
                        <Pencil className="size-3.5" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(job.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Job Opening" : "Post New Job"}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate(form);
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="j-title">Title</Label>
                <Input
                  id="j-title"
                  placeholder="Senior Backend Engineer"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="j-code">Code</Label>
                <Input
                  id="j-code"
                  placeholder="SBENG"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="j-desc">Description</Label>
              <textarea
                id="j-desc"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Role summary and responsibilities"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="j-loc">Location</Label>
                <Input
                  id="j-loc"
                  placeholder="Remote / Bengaluru"
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="j-dept">Department</Label>
                <select
                  id="j-dept"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.departmentId}
                  onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}
                >
                  <option value="">None</option>
                  {departments?.map((dep) => (
                    <option key={dep.id} value={dep.id}>
                      {dep.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="j-type">Employment</Label>
                <select
                  id="j-type"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.employmentType}
                  onChange={(e) => setForm((f) => ({ ...f, employmentType: e.target.value }))}
                >
                  {EMPLOYMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="j-status">Status</Label>
                <select
                  id="j-status"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                >
                  {JOB_STATUS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="j-pos">Positions</Label>
                <Input
                  id="j-pos"
                  type="number"
                  min={1}
                  value={form.positionsCount}
                  onChange={(e) => setForm((f) => ({ ...f, positionsCount: Number(e.target.value) }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={saveMutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : editing ? "Save Changes" : "Post Job"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
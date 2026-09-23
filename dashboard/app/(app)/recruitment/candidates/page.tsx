"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Star, LayoutGrid, ListFilter, ArrowRight, X, Trash2 } from "lucide-react";
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
import { toast } from "sonner";
import { useSession } from "@/lib/auth/session";
import { P } from "@/lib/permissions";

const STAGES = ["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "HIRED", "REJECTED"] as const;
const STAGE_ORDER: Record<string, number> = { APPLIED: 0, SCREENING: 1, INTERVIEW: 2, OFFER: 3, HIRED: 4, REJECTED: 5 };

interface Candidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  status: string;
  rating: number;
  createdAt: string;
  jobOpening: { id: string; title: string };
}

interface Job {
  id: string;
  title: string;
  status: string;
}

const EMPTY_FORM = { firstName: "", lastName: "", email: "", phone: "", jobOpeningId: "" };

export default function CandidatesPage() {
  const queryClient = useQueryClient();
  const { hasPermission } = useSession();
  const canManage = hasPermission(P.candidatesManage);

  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: candidates, isLoading, error } = useQuery({
    queryKey: ["candidates"],
    queryFn: async () => api.get<Candidate[]>("/api/v1/recruitment/candidates"),
  });

  const { data: jobs } = useQuery({
    queryKey: ["jobs"],
    queryFn: async () => api.get<Job[]>("/api/v1/recruitment/jobs"),
    enabled: canManage,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["candidates"] });

  const moveMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      api.patch(`/api/v1/recruitment/candidates/${id}`, { status }),
    onSuccess: (_d, vars) => {
      toast.success(`Candidate moved to ${vars.status}`);
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const intakeMutation = useMutation({
    mutationFn: async (payload: typeof EMPTY_FORM) =>
      api.post("/api/v1/recruitment/candidates", { ...payload, email: payload.email.trim() }),
    onSuccess: () => {
      toast.success("Candidate added to pipeline");
      setIsOpen(false);
      setForm(EMPTY_FORM);
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.del(`/api/v1/recruitment/candidates/${id}`),
    onSuccess: () => {
      toast.success("Candidate removed from pipeline");
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const moveNext = (c: Candidate, stage: string) => {
    const nextIdx = STAGE_ORDER[stage] + 1;
    const isRejectedLane = stage === "REJECTED";
    if (stage === "HIRED" || (isRejectedLane && nextIdx > STAGE_ORDER.HIRED)) return;
    const next = isRejectedLane ? "HIRED" : STAGES[nextIdx];
    if (next === "REJECTED") return;
    moveMutation.mutate({ id: c.id, status: next });
  };

  return (
    <div className="page-container space-y-6">
      <PageHeader
        eyebrow="Recruitment & ATS"
        title="Candidate Pipeline & ATS"
        description="Track job applicants through screening, interviews, technical evaluations, offers, and hiring."
        actions={
          canManage ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center border rounded-lg p-0.5 bg-muted/40">
                <Button
                  variant={viewMode === "kanban" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("kanban")}
                  className="h-7 text-xs px-2.5 gap-1"
                >
                  <LayoutGrid className="size-3.5" /> Board
                </Button>
                <Button
                  variant={viewMode === "table" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("table")}
                  className="h-7 text-xs px-2.5 gap-1"
                >
                  <ListFilter className="size-3.5" /> Table
                </Button>
              </div>
              <Button size="sm" className="gap-2 shadow-sm" onClick={() => setIsOpen(true)}>
                <Plus className="size-4" /> Add Candidate
              </Button>
            </div>
          ) : undefined
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading candidates...</p>
      ) : error ? (
        <p className="text-sm text-destructive">{errorMessage(error)}</p>
      ) : viewMode === "kanban" ? (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 overflow-x-auto pb-4">
          {STAGES.map((stage) => {
            const stageCandidates = (candidates ?? []).filter(
              (c) => (c.status || "APPLIED").toUpperCase() === stage
            );

            return (
              <div key={stage} className="space-y-3 min-w-[200px]">
                <div className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded-lg border text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>{stage}</span>
                  <Badge variant={stage === "REJECTED" ? "destructive" : "secondary"} className="text-[10px]">
                    {stageCandidates.length}
                  </Badge>
                </div>

                <div className="space-y-2">
                  {stageCandidates.length === 0 ? (
                    <div className="border border-dashed rounded-lg p-4 text-center text-xs text-muted-foreground">
                      No candidates
                    </div>
                  ) : (
                    stageCandidates.map((c) => (
                      <Card key={c.id} className="p-3 hover:border-primary/40 transition-all shadow-sm">
                        <div className="space-y-2">
                          <div>
                            <p className="font-semibold text-xs text-foreground">
                              {c.firstName} {c.lastName}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate">{c.email}</p>
                          </div>

                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground truncate max-w-[120px]">
                              {c.jobOpening?.title ?? "General Application"}
                            </span>
                            <span className="flex items-center gap-0.5 text-amber-500 font-medium">
                              <Star className="size-3 fill-current" /> {c.rating}
                            </span>
                          </div>

                          {canManage && stage !== "HIRED" && (
                            <div className="flex gap-1.5 mt-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={moveMutation.isPending}
                                onClick={() => moveNext(c, stage)}
                                className="w-full justify-between h-7 text-[11px] text-primary hover:text-primary hover:bg-primary/10"
                              >
                                {stage === "REJECTED" ? "Hire" : "Move Next"}{" "}
                                {stage === "REJECTED" ? <Star className="size-3" /> : <ArrowRight className="size-3" />}
                              </Button>
                              {stage !== "REJECTED" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={moveMutation.isPending}
                                  onClick={() => moveMutation.mutate({ id: c.id, status: "REJECTED" })}
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:border-destructive"
                                >
                                  <X className="size-3" />
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </Card>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b">
                <tr>
                  <th className="px-4 py-3">Candidate</th>
                  <th className="px-4 py-3">Applied Position</th>
                  <th className="px-4 py-3">Rating</th>
                  <th className="px-4 py-3">Pipeline Stage</th>
                  <th className="px-4 py-3">Applied Date</th>
                  {canManage && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(candidates ?? []).map((c) => (
                  <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-semibold text-foreground">
                      <div>
                        <p>
                          {c.firstName} {c.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground">{c.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">{c.jobOpening?.title ?? "General Application"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-amber-500 font-semibold text-xs">
                        <Star className="size-3.5 fill-current" /> {c.rating} / 5
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={c.status === "HIRED" ? "default" : c.status === "REJECTED" ? "destructive" : "secondary"}>
                        {c.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            disabled={deleteMutation.isPending}
                            onClick={() => deleteMutation.mutate(c.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Candidate</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              intakeMutation.mutate(form);
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="c-job">Job Opening</Label>
              <select
                id="c-job"
                required
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
                value={form.jobOpeningId}
                onChange={(e) => setForm((f) => ({ ...f, jobOpeningId: e.target.value }))}
              >
                <option value="" disabled>
                  Select a job opening
                </option>
                {jobs
                  ?.filter((j) => j.status !== "CLOSED")
                  .map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title}
                    </option>
                  ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="c-first">First Name</Label>
                <Input
                  id="c-first"
                  value={form.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="c-last">Last Name</Label>
                <Input
                  id="c-last"
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="c-email">Email</Label>
                <Input
                  id="c-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="c-phone">Phone</Label>
                <Input
                  id="c-phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={intakeMutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={intakeMutation.isPending}>
                {intakeMutation.isPending ? "Adding..." : "Add Candidate"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
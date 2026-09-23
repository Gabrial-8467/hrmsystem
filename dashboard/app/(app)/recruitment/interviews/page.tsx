"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Clock, MapPin, CheckCircle2, XCircle, Trash2, Star } from "lucide-react";
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

interface Interview {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  location: string | null;
  stage: string;
  score: number | null;
  feedback: string | null;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  candidate: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    status: string;
    jobOpening: { id: string; title: string };
  };
}

interface CandidateOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  jobOpening: { id: string; title: string };
}

const COMMON_STAGES = [
  "Phone Screen",
  "Technical Interview",
  "System Design",
  "HR / Culture Round",
  "Final Panel",
];

const EMPTY_FORM = {
  candidateId: "",
  stage: "Technical Interview",
  scheduledAt: "",
  durationMinutes: 45,
  location: "",
};

export default function InterviewsPage() {
  const queryClient = useQueryClient();
  const { hasPermission } = useSession();
  const canManage = hasPermission(P.interviewsManage);

  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [recording, setRecording] = useState<Interview | null>(null);
  const [score, setScore] = useState("");
  const [feedback, setFeedback] = useState("");

  const { data: interviews, isLoading, error } = useQuery({
    queryKey: ["interviews"],
    queryFn: async () => api.get<Interview[]>("/api/v1/recruitment/interviews"),
  });

  const { data: candidates } = useQuery({
    queryKey: ["candidates"],
    queryFn: async () => api.get<CandidateOption[]>("/api/v1/recruitment/candidates"),
    enabled: canManage,
  });

  const scheduleable = (candidates ?? []).filter((c) => c.status !== "HIRED" && c.status !== "REJECTED");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["interviews"] });

  const scheduleMutation = useMutation({
    mutationFn: async (payload: typeof EMPTY_FORM) =>
      api.post(`/api/v1/recruitment/candidates/${payload.candidateId}/interviews`, {
        stage: payload.stage,
        scheduledAt: new Date(payload.scheduledAt).toISOString(),
        durationMinutes: payload.durationMinutes,
        location: payload.location || null,
      }),
    onSuccess: () => {
      toast.success("Interview scheduled");
      setIsOpen(false);
      setForm(EMPTY_FORM);
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const recordMutation = useMutation({
    mutationFn: async () =>
      api.patch(`/api/v1/recruitment/interviews/${recording!.id}`, {
        status: "COMPLETED",
        score: Number(score),
        feedback: feedback || null,
      }),
    onSuccess: () => {
      toast.success("Scorecard recorded");
      setRecording(null);
      setScore("");
      setFeedback("");
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      api.patch(`/api/v1/recruitment/interviews/${id}`, { status }),
    onSuccess: () => {
      toast.success("Interview status updated");
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.del(`/api/v1/recruitment/interviews/${id}`),
    onSuccess: () => {
      toast.success("Interview deleted");
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  return (
    <div className="page-container space-y-6">
      <PageHeader
        eyebrow="Recruitment & ATS"
        title="Interviews & Assessment Schedule"
        description="Schedule candidate interviews, record scorecard feedback, and track hiring stages."
        actions={
          canManage ? (
            <Button className="gap-2" onClick={() => setIsOpen(true)}>
              <Plus className="size-4" /> Schedule Interview
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading interviews...</p>
      ) : error ? (
        <p className="text-sm text-destructive">{errorMessage(error)}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {interviews?.length === 0 && (
            <p className="col-span-full text-sm text-muted-foreground">No interviews scheduled.</p>
          )}
          {interviews?.map((item) => (
            <Card key={item.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">
                    {item.candidate.firstName} {item.candidate.lastName}
                  </CardTitle>
                  <Badge
                    variant={
                      item.status === "COMPLETED" ? "default" : item.status === "CANCELLED" ? "destructive" : "secondary"
                    }
                  >
                    {item.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {item.candidate.jobOpening?.title ?? "General Application"}
                </p>
              </CardHeader>
              <CardContent className="pt-2 text-sm space-y-3 flex-1">
                <div className="flex items-center gap-2 text-xs font-medium text-primary">
                  <Clock className="size-3.5" />
                  {new Date(item.scheduledAt).toLocaleString()} ({item.durationMinutes} min)
                </div>
                <div className="text-xs text-muted-foreground">
                  Stage: <span className="font-semibold text-foreground">{item.stage}</span>
                  {item.location && (
                    <span className="flex items-center gap-1 mt-1">
                      <MapPin className="size-3" /> {item.location}
                    </span>
                  )}
                </div>
                {item.score !== null && (
                  <div className="flex items-center gap-1 text-xs font-semibold text-amber-500">
                    <Star className="size-3.5 fill-current" /> {item.score} / 100
                  </div>
                )}
                {item.feedback && (
                  <p className="border-t pt-2 text-xs text-muted-foreground line-clamp-3">{item.feedback}</p>
                )}
                {canManage && (
                  <div className="flex items-center justify-end gap-1.5 border-t pt-3">
                    {item.status === "SCHEDULED" ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => {
                            setRecording(item);
                            setScore(item.score?.toString() ?? "");
                            setFeedback(item.feedback ?? "");
                          }}
                        >
                          <CheckCircle2 className="size-3.5" /> Complete
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1.5 text-muted-foreground"
                          disabled={statusMutation.isPending}
                          onClick={() => statusMutation.mutate({ id: item.id, status: "CANCELLED" })}
                        >
                          <XCircle className="size-3.5" /> Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(item.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Interview</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              scheduleMutation.mutate(form);
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="i-cand">Candidate</Label>
              <select
                id="i-cand"
                required
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
                value={form.candidateId}
                onChange={(e) => setForm((f) => ({ ...f, candidateId: e.target.value }))}
              >
                <option value="" disabled>
                  Select a candidate
                </option>
                {scheduleable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName} — {c.jobOpening?.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="i-stage">Stage</Label>
              <select
                id="i-stage"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
                value={form.stage}
                onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value }))}
              >
                {COMMON_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="i-when">Date & Time</Label>
                <Input
                  id="i-when"
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="i-dur">Duration (min)</Label>
                <Input
                  id="i-dur"
                  type="number"
                  min={5}
                  max={480}
                  value={form.durationMinutes}
                  onChange={(e) => setForm((f) => ({ ...f, durationMinutes: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="i-loc">Location / Link</Label>
              <Input
                id="i-loc"
                placeholder="Room 3 / Google Meet link"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={scheduleMutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={scheduleMutation.isPending}>
                {scheduleMutation.isPending ? "Scheduling..." : "Schedule Interview"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!recording} onOpenChange={(open) => !open && setRecording(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Scorecard — {recording?.candidate.firstName} {recording?.candidate.lastName}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              recordMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="i-score">Score (0 – 100)</Label>
              <Input
                id="i-score"
                type="number"
                min={0}
                max={100}
                value={score}
                onChange={(e) => setScore(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="i-feedback">Feedback</Label>
              <textarea
                id="i-feedback"
                className="flex min-h-[90px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Observations, strengths, concerns..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRecording(null)} disabled={recordMutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={recordMutation.isPending}>
                {recordMutation.isPending ? "Saving..." : "Save Scorecard"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LifeBuoy, Plus, MessageSquare, User, Send } from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { api, errorMessage } from "@/lib/api/client";
import { toast } from "sonner";
import { useSession } from "@/lib/auth/session";
import { P } from "@/lib/permissions";
import type { ListResult } from "@/lib/types";

type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type TicketCategory = "IT" | "COMPLAINT" | "HR" | "PAYROLL" | "ADMIN" | "OTHER";

interface TicketPerson {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
}

interface Ticket {
  id: string;
  subject: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  assigneeId: string | null;
  createdAt: string;
  employee: TicketPerson;
  assignee: TicketPerson | null;
  _count: { comments: number };
}

interface TicketComment {
  id: string;
  body: string;
  createdAt: string;
  author: TicketPerson;
}

interface TicketDetail extends Ticket {
  comments: TicketComment[];
}

interface EmpRow {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
}

const STATUS_STYLES: Record<TicketStatus, "warning" | "secondary" | "success" | "destructive"> = {
  OPEN: "warning",
  IN_PROGRESS: "secondary",
  RESOLVED: "success",
  CLOSED: "destructive",
};

const PRIORITY_STYLES: Record<TicketPriority, "secondary" | "warning" | "destructive" | "success"> = {
  LOW: "secondary",
  MEDIUM: "warning",
  HIGH: "destructive",
  URGENT: "success",
};

const CATEGORIES: TicketCategory[] = ["IT", "COMPLAINT", "HR", "PAYROLL", "ADMIN", "OTHER"];
const PRIORITIES: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

const EMPTY_FORM = {
  subject: "",
  description: "",
  category: "OTHER" as TicketCategory,
  priority: "MEDIUM" as TicketPriority,
  employeeId: "",
};

export default function HelpdeskPage() {
  const queryClient = useQueryClient();
  const { hasPermission } = useSession();
  const canManage = hasPermission(P.helpdeskTicketManage);
  const canCreate = hasPermission(P.helpdeskTicketCreate) || canManage;

  const [tab, setTab] = useState<"mine" | "all">("mine");
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "ALL">("ALL");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [commentDraft, setCommentDraft] = useState("");

  const { data: tickets, isLoading, error } = useQuery({
    queryKey: ["helpdesk", tab, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("own", tab === "mine" ? "true" : "false");
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      return api.get<Ticket[]>(`/api/v1/helpdesk/tickets?${params.toString()}`);
    },
  });

  const { data: employees } = useQuery({
    queryKey: ["employees", "assignees"],
    queryFn: async () => {
      const res = await api.get<ListResult<EmpRow>>("/api/v1/employees?page=1&limit=100");
      return res.items;
    },
    enabled: canManage,
  });

  const employeeOptions = useMemo(
    () => employees ?? [],
    [employees],
  );

  const { data: detail, refetch: refetchDetail } = useQuery({
    queryKey: ["helpdesk-detail", selectedTicket?.id],
    queryFn: async () => api.get<TicketDetail>(`/api/v1/helpdesk/tickets/${selectedTicket!.id}`),
    enabled: !!selectedTicket,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["helpdesk"] });
    queryClient.invalidateQueries({ queryKey: ["helpdesk-detail"] });
  };

  const createMutation = useMutation({
    mutationFn: async (payload: typeof EMPTY_FORM) => {
      const body: Record<string, unknown> = {
        subject: payload.subject,
        description: payload.description,
        category: payload.category,
        priority: payload.priority,
      };
      if (canManage && payload.employeeId) body.employeeId = payload.employeeId;
      return api.post("/api/v1/helpdesk/tickets", body);
    },
    onSuccess: () => {
      toast.success("Ticket submitted");
      setIsCreateOpen(false);
      setCreateForm(EMPTY_FORM);
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      api.patch(`/api/v1/helpdesk/tickets/${id}`, patch),
    onSuccess: (_, vars) => {
      toast.success(vars.patch.status ? `Ticket ${String(vars.patch.status).replace("_", " ").toLowerCase()}` : "Ticket updated");
      invalidate();
    },
    onError: (err: Error) => {
      const msg = errorMessage(err);
      toast.error(msg);
      if (msg.toUpperCase().includes("CLOSED")) refetchDetail();
    },
  });

  const commentMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) =>
      api.post(`/api/v1/helpdesk/tickets/${id}/comments`, { body }),
    onSuccess: () => {
      toast.success("Comment posted");
      setCommentDraft("");
      invalidate();
    },
    onError: (err: Error) => {
      const msg = errorMessage(err);
      toast.error(msg);
      if (msg.toUpperCase().includes("CLOSED")) refetchDetail();
    },
  });

  function fullName(p?: TicketPerson | null) {
    return p ? `${p.firstName} ${p.lastName}` : "—";
  }

  function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTicket || !commentDraft.trim()) return;
    commentMutation.mutate({ id: selectedTicket.id, body: commentDraft.trim() });
  }

  return (
    <div className="page-container space-y-6">
      <PageHeader
        eyebrow="Employee Support"
        title="Helpdesk Tickets"
        description="Raise and track support tickets for IT, HR, payroll, and administrative issues."
        actions={
          canCreate ? (
            <Button className="gap-2" onClick={() => setIsCreateOpen(true)}>
              <Plus className="size-4" /> New Ticket
            </Button>
          ) : undefined
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as "mine" | "all")}>
        <TabsList>
          <TabsTrigger value="mine">My Tickets</TabsTrigger>
          {canManage && <TabsTrigger value="all">All Tickets</TabsTrigger>}
        </TabsList>

        <div className="mt-4 flex flex-wrap gap-2">
          {(["ALL", ...STATUSES] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "outline"}
              onClick={() => setStatusFilter(s)}
            >
              {s === "ALL" ? "All statuses" : s.replace("_", " ")}
            </Button>
          ))}
        </div>

        <TabsContent value={tab} className="mt-4 space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading tickets...</p>
          ) : error ? (
            <p className="text-sm text-destructive">{errorMessage(error)}</p>
          ) : tickets?.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tickets match this view.</p>
          ) : (
            tickets?.map((t) => (
              <Card key={t.id} className="cursor-pointer transition-colors hover:border-primary/50" onClick={() => setSelectedTicket(t)}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <LifeBuoy className="size-5" />
                    </span>
                    <div>
                      <CardTitle className="text-base font-semibold">{t.subject}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {t.category} · opened {new Date(t.createdAt).toLocaleDateString()} by {fullName(t.employee)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={PRIORITY_STYLES[t.priority]}>{t.priority}</Badge>
                    <Badge variant={STATUS_STYLES[t.status]}>{t.status.replace("_", " ")}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex items-center justify-between pt-2 text-sm text-muted-foreground">
                  <span className="line-clamp-1">{t.description}</span>
                  <span className="flex shrink-0 items-center gap-1 text-xs">
                    <MessageSquare className="size-3.5" /> {t._count.comments}
                  </span>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Helpdesk Ticket</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate(createForm);
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="hd-subject">Subject</Label>
              <Input
                id="hd-subject"
                placeholder="Brief summary of the issue"
                value={createForm.subject}
                onChange={(e) => setCreateForm((f) => ({ ...f, subject: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hd-desc">Description</Label>
              <textarea
                id="hd-desc"
                className="flex min-h-[110px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Describe the problem, steps to reproduce, and any error messages..."
                value={createForm.description}
                onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="hd-cat">Category</Label>
                <select
                  id="hd-cat"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
                  value={createForm.category}
                  onChange={(e) => setCreateForm((f) => ({ ...f, category: e.target.value as TicketCategory }))}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="hd-pri">Priority</Label>
                <select
                  id="hd-pri"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
                  value={createForm.priority}
                  onChange={(e) => setCreateForm((f) => ({ ...f, priority: e.target.value as TicketPriority }))}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {canManage && (
              <div className="space-y-2">
                <Label htmlFor="hd-employee">For employee (optional)</Label>
                <select
                  id="hd-employee"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
                  value={createForm.employeeId}
                  onChange={(e) => setCreateForm((f) => ({ ...f, employeeId: e.target.value }))}
                >
                  <option value="">My own profile</option>
                  {employeeOptions.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName} ({emp.employeeCode})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)} disabled={createMutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Submitting..." : "Submit Ticket"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedTicket} onOpenChange={(open) => !open && setSelectedTicket(null)}>
        {detail && (
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="pr-8">{detail.subject}</DialogTitle>
            </DialogHeader>

            <div className="-mt-2 flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={PRIORITY_STYLES[detail.priority]}>{detail.priority}</Badge>
              <Badge variant={STATUS_STYLES[detail.status]}>{detail.status.replace("_", " ")}</Badge>
              <span className="text-muted-foreground">{detail.category}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">opened {new Date(detail.createdAt).toLocaleString()} by {fullName(detail.employee)}</span>
            </div>

            <p className="text-sm text-muted-foreground">{detail.description}</p>

            <div className="flex flex-wrap items-end gap-2 border-t pt-4">
              <div className="space-y-2">
                <Label htmlFor="hd-assignee">Assignee</Label>
                <select
                  id="hd-assignee"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
                  value={detail.assigneeId ?? ""}
                  disabled={!canManage}
                  onChange={(e) => updateMutation.mutate({ id: detail.id, patch: { assigneeId: e.target.value || null } })}
                >
                  <option value="">Unassigned</option>
                  {employeeOptions.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName} ({emp.employeeCode})
                    </option>
                  ))}
                </select>
              </div>
              {canManage && (
                <div className="flex gap-2">
                  {STATUSES.filter((s) => s !== detail.status || s === "CLOSED").map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={detail.status === s ? "default" : "outline"}
                      disabled={updateMutation.isPending}
                      onClick={() =>
                        updateMutation.mutate({ id: detail.id, patch: { status: s } })
                      }
                    >
                      {s === "IN_PROGRESS" ? "In progress" : s}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3 border-t pt-4">
              <p className="text-sm font-medium">Conversation</p>
              {detail.comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No comments yet.</p>
              ) : (
                detail.comments.map((c) => (
                  <div key={c.id} className="rounded-lg border bg-muted/40 p-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <User className="size-3" />
                      <span className="font-medium text-foreground">
                        {fullName(c.author)} ({c.author.employeeCode})
                      </span>
                      <span>· {new Date(c.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 text-sm">{c.body}</p>
                  </div>
                ))
              )}
            </div>

            {detail.status !== "CLOSED" && (
              <form onSubmit={submitComment} className="flex gap-2 border-t pt-4">
                <Input
                  placeholder={canManage ? "Reply to the employee..." : "Add a follow-up..."}
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                />
                <Button type="submit" size="sm" disabled={commentMutation.isPending || !commentDraft.trim()}>
                  <Send className="size-4" /> Send
                </Button>
              </form>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedTicket(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Plus, Pencil, Trash2 } from "lucide-react";
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

interface Announcement {
  id: string;
  title: string;
  content: string;
  publishedAt: string;
  expiresAt: string | null;
  targetAudience: string;
  targetDepartment: { id: string; name: string } | null;
}

interface Department {
  id: string;
  name: string;
}

const EMPTY_FORM = {
  title: "",
  content: "",
  targetAudience: "ALL",
  targetDepartmentId: "",
  expiresAt: "",
};

export default function AnnouncementsPage() {
  const queryClient = useQueryClient();
  const { hasPermission } = useSession();
  const canManage = hasPermission(P.announcementsManage);

  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: announcements, isLoading, error } = useQuery({
    queryKey: ["announcements"],
    queryFn: async () => api.get<Announcement[]>("/api/v1/operations/announcements"),
  });

  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => api.get<Department[]>("/api/v1/departments"),
    enabled: canManage,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["announcements"] });

  const saveMutation = useMutation({
    mutationFn: async (payload: typeof EMPTY_FORM) => {
      const body = {
        ...payload,
        targetAudience: payload.targetDepartmentId ? "DEPARTMENT" : "ALL",
        targetDepartmentId: payload.targetDepartmentId || null,
        expiresAt: payload.expiresAt ? new Date(payload.expiresAt).toISOString() : null,
      };
      if (editing) {
        return api.patch(`/api/v1/operations/announcements/${editing.id}`, body);
      }
      return api.post("/api/v1/operations/announcements", body);
    },
    onSuccess: () => {
      toast.success(editing ? "Announcement updated" : "Announcement published");
      setIsOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.del(`/api/v1/operations/announcements/${id}`),
    onSuccess: () => {
      toast.success("Announcement removed");
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setIsOpen(true);
  }

  function openEdit(a: Announcement) {
    setEditing(a);
    setForm({
      title: a.title,
      content: a.content,
      targetAudience: a.targetAudience,
      targetDepartmentId: a.targetDepartment?.id ?? "",
      expiresAt: a.expiresAt ? new Date(a.expiresAt).toISOString().slice(0, 10) : "",
    });
    setIsOpen(true);
  }

  return (
    <div className="page-container space-y-6">
      <PageHeader
        eyebrow="Company Communication"
        title="Announcements & Broadcasts"
        description="Publish company-wide announcements, department updates, and operational notices."
        actions={
          canManage ? (
            <Button className="gap-2" onClick={openCreate}>
              <Plus className="size-4" /> New Announcement
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading announcements...</p>
      ) : error ? (
        <p className="text-sm text-destructive">{errorMessage(error)}</p>
      ) : (
        <div className="grid gap-4">
          {announcements?.length === 0 && (
            <p className="text-sm text-muted-foreground">No announcements yet.</p>
          )}
          {announcements?.map((item) => (
            <Card key={item.id} className="hover:border-primary/50 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Megaphone className="size-5" />
                  </span>
                  <div>
                    <CardTitle className="text-base font-semibold">{item.title}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Published on {new Date(item.publishedAt).toLocaleDateString()}
                      {item.expiresAt && ` · expires ${new Date(item.expiresAt).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={item.targetAudience === "ALL" ? "secondary" : "warning"}>
                    {item.targetAudience === "ALL"
                      ? "Everyone"
                      : item.targetDepartment?.name ?? "Department"}
                  </Badge>
                  {canManage && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(item)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(item.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-2 text-sm text-muted-foreground">{item.content}</CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Announcement" : "New Announcement"}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate(form);
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="an-title">Title</Label>
              <Input
                id="an-title"
                placeholder="Town hall moved to Thursday"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="an-content">Content</Label>
              <textarea
                id="an-content"
                className="flex min-h-[110px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Write the announcement body..."
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="an-audience">Audience</Label>
                <select
                  id="an-audience"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.targetDepartmentId ? "DEPARTMENT" : form.targetAudience}
                  onChange={(e) => {
                    const isDept = e.target.value === "DEPARTMENT";
                    setForm((f) => ({
                      ...f,
                      targetAudience: isDept ? "DEPARTMENT" : "ALL",
                      targetDepartmentId: isDept ? f.targetDepartmentId : "",
                    }));
                  }}
                >
                  <option value="ALL">Everyone (All employees)</option>
                  <option value="DEPARTMENT">Specific department</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="an-expiry">Expires (optional)</Label>
                <Input
                  id="an-expiry"
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                />
              </div>
            </div>
            {form.targetAudience === "DEPARTMENT" && (
              <div className="space-y-2">
                <Label htmlFor="an-dept">Department</Label>
                <select
                  id="an-dept"
                  required
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.targetDepartmentId}
                  onChange={(e) => setForm((f) => ({ ...f, targetDepartmentId: e.target.value }))}
                >
                  <option value="" disabled>
                    Select a department
                  </option>
                  {departments?.map((dep) => (
                    <option key={dep.id} value={dep.id}>
                      {dep.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={saveMutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : editing ? "Save Changes" : "Publish"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
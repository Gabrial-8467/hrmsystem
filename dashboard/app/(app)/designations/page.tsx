"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Briefcase, Plus, Trash2, Pencil, Users } from "lucide-react";
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

interface Designation {
  id: string;
  title: string;
  code: string;
  level: number;
  description: string | null;
  department: { id: string; name: string } | null;
  _count: { employees: number };
}

interface Department {
  id: string;
  name: string;
}

const EMPTY_FORM = {
  title: "",
  code: "",
  level: 1,
  departmentId: "",
  description: "",
};

export default function DesignationsPage() {
  const queryClient = useQueryClient();
  const { hasPermission } = useSession();
  const canManage = hasPermission(P.designationsManage);
  const canView = hasPermission(P.designationsView);

  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<Designation | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: designations, isLoading, error } = useQuery({
    queryKey: ["designations"],
    queryFn: async () => api.get<Designation[]>("/api/v1/designations"),
    enabled: canView,
  });

  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => api.get<Department[]>("/api/v1/departments"),
    enabled: canManage,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["designations"] });

  const saveMutation = useMutation({
    mutationFn: async (payload: typeof EMPTY_FORM) => {
      const body = {
        ...payload,
        code: payload.code.toUpperCase(),
        departmentId: payload.departmentId || null,
        description: payload.description || null,
      };
      if (editing) {
        return api.patch(`/api/v1/designations/${editing.id}`, body);
      }
      return api.post("/api/v1/designations", body);
    },
    onSuccess: () => {
      toast.success(editing ? "Designation updated" : "Designation created");
      setIsOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.del(`/api/v1/designations/${id}`),
    onSuccess: () => {
      toast.success("Designation deleted");
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setIsOpen(true);
  }

  function openEdit(d: Designation) {
    setEditing(d);
    setForm({
      title: d.title,
      code: d.code,
      level: d.level,
      departmentId: d.department?.id ?? "",
      description: d.description ?? "",
    });
    setIsOpen(true);
  }

  return (
    <div className="page-container space-y-6">
      <PageHeader
        eyebrow="Organization"
        title="Designations"
        description="Job titles, levels, and reporting structure used across the organization."
        actions={
          canManage ? (
            <Button className="gap-2" onClick={openCreate}>
              <Plus className="size-4" /> Add Designation
            </Button>
          ) : undefined
        }
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Level</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Employees</th>
                {canManage && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td className="px-4 py-6 text-center text-muted-foreground" colSpan={canManage ? 6 : 5}>
                    Loading designations...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td className="px-4 py-6 text-center text-destructive" colSpan={canManage ? 6 : 5}>
                    {errorMessage(error)}
                  </td>
                </tr>
              ) : designations?.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-muted-foreground" colSpan={canManage ? 6 : 5}>
                    No designations yet.
                  </td>
                </tr>
              ) : (
                designations?.map((d) => (
                  <tr key={d.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-md bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-400">
                          <Briefcase className="size-3.5" />
                        </span>
                        <div>
                          <p className="font-semibold text-foreground">{d.title}</p>
                          {d.description && <p className="text-xs text-muted-foreground">{d.description}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{d.code}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">L{d.level}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{d.department?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary">
                        <Users className="mr-1 size-3" /> {d._count.employees}
                      </Badge>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openEdit(d)}>
                            <Pencil className="size-3.5" /> Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1.5 text-destructive hover:text-destructive"
                            disabled={deleteMutation.isPending}
                            onClick={() => deleteMutation.mutate(d.id)}
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

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Designation" : "Add Designation"}</DialogTitle>
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
                <Label htmlFor="d-title">Title</Label>
                <Input
                  id="d-title"
                  placeholder="Senior Engineer"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="d-code">Code</Label>
                <Input
                  id="d-code"
                  placeholder="SE"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="d-level">Level</Label>
                <Input
                  id="d-level"
                  type="number"
                  min={1}
                  max={20}
                  value={form.level}
                  onChange={(e) => setForm((f) => ({ ...f, level: Number(e.target.value) }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="d-dept">Department</Label>
                <select
                  id="d-dept"
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
            <div className="space-y-2">
              <Label htmlFor="d-desc">Description</Label>
              <Input
                id="d-desc"
                placeholder="Optional role description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={saveMutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : editing ? "Save Changes" : "Add Designation"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, UserPlus, Undo2, Laptop } from "lucide-react";
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

interface Asset {
  id: string;
  name: string;
  assetTag: string;
  category: string;
  serialNumber: string | null;
  status: string;
  assignedTo: { id: string; firstName: string; lastName: string; employeeCode: string } | null;
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
}

const CATEGORIES = ["LAPTOP", "MONITOR", "MOBILE", "TABLET", "DESKTOP", "PRINTER", "OTHER"] as const;
const STATUS_FLOW = ["AVAILABLE", "UNDER_MAINTENANCE", "RETIRED"] as const;

const EMPTY_FORM = { name: "", assetTag: "", category: "LAPTOP", serialNumber: "" };

export default function AssetsPage() {
  const queryClient = useQueryClient();
  const { hasPermission } = useSession();
  const canManage = hasPermission(P.assetsManage);

  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [assignTarget, setAssignTarget] = useState<Asset | null>(null);
  const [employeeId, setEmployeeId] = useState("");

  const { data: assets, isLoading, error } = useQuery({
    queryKey: ["assets"],
    queryFn: async () => api.get<Asset[]>("/api/v1/assets"),
  });

  const { data: employees } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => api.get<Employee[]>("/api/v1/employees"),
    enabled: canManage && !!assignTarget,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["assets"] });

  const saveMutation = useMutation({
    mutationFn: async (payload: typeof EMPTY_FORM) => {
      const body = { ...payload, assetTag: payload.assetTag.toUpperCase(), serialNumber: payload.serialNumber || null };
      if (editing) {
        return api.patch(`/api/v1/assets/${editing.id}`, body);
      }
      return api.post("/api/v1/assets", body);
    },
    onSuccess: () => {
      toast.success(editing ? "Asset updated" : "Asset added");
      setIsOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const assignMutation = useMutation({
    mutationFn: async () => api.post(`/api/v1/assets/${assignTarget!.id}/assign`, { employeeId }),
    onSuccess: () => {
      toast.success("Asset assigned");
      setAssignTarget(null);
      setEmployeeId("");
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const returnMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/api/v1/assets/${id}/return`),
    onSuccess: () => {
      toast.success("Asset returned");
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      api.post(`/api/v1/assets/${id}/status`, { status }),
    onSuccess: (_d, vars) => {
      toast.success(`Asset marked ${vars.status}`);
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.del(`/api/v1/assets/${id}`),
    onSuccess: () => {
      toast.success("Asset deleted");
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setIsOpen(true);
  }

  function openEdit(a: Asset) {
    setEditing(a);
    setForm({
      name: a.name,
      assetTag: a.assetTag,
      category: a.category,
      serialNumber: a.serialNumber ?? "",
    });
    setIsOpen(true);
  }

  const statusBadgeVariant = (status: string): "default" | "secondary" | "outline" | "destructive" | "warning" =>
  status === "ASSIGNED" ? "default" : status === "RETIRED" ? "destructive" : status === "UNDER_MAINTENANCE" ? "warning" : "secondary";

  return (
    <div className="page-container space-y-6">
      <PageHeader
        eyebrow="Asset Management"
        title="Company Assets & IT Hardware"
        description="Track company computers, monitors, mobile devices, serial numbers, and employee assignments."
        actions={
          canManage ? (
            <Button className="gap-2" onClick={openCreate}>
              <Plus className="size-4" /> Add Asset
            </Button>
          ) : undefined
        }
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-3">Asset</th>
                <th className="px-4 py-3">Tag</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Assigned To</th>
                <th className="px-4 py-3">Status</th>
                {canManage && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td className="px-4 py-6 text-center text-muted-foreground" colSpan={canManage ? 6 : 5}>
                    Loading assets...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td className="px-4 py-6 text-center text-destructive" colSpan={canManage ? 6 : 5}>
                    {errorMessage(error)}
                  </td>
                </tr>
              ) : assets?.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-muted-foreground" colSpan={canManage ? 6 : 5}>
                    No assets registered yet.
                  </td>
                </tr>
              ) : (
                assets?.map((a) => (
                  <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-semibold text-foreground">
                      <div className="flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Laptop className="size-3.5" />
                        </span>
                        {a.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{a.assetTag}</td>
                    <td className="px-4 py-3 text-xs font-semibold">
                      {a.category}
                      {a.serialNumber && <p className="font-mono font-normal text-muted-foreground">{a.serialNumber}</p>}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {a.assignedTo ? (
                        <div>
                          <p>
                            {a.assignedTo.firstName} {a.assignedTo.lastName}
                          </p>
                          <p className="text-xs text-muted-foreground">{a.assignedTo.employeeCode}</p>
                        </div>
                      ) : (
                        "Unassigned"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusBadgeVariant(a.status)}>{a.status}</Badge>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {a.status === "AVAILABLE" && (
                            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAssignTarget(a)}>
                              <UserPlus className="size-3.5" /> Assign
                            </Button>
                          )}
                          {a.status === "ASSIGNED" && (
                            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => returnMutation.mutate(a.id)}>
                              <Undo2 className="size-3.5" /> Return
                            </Button>
                          )}
                          {a.status !== "RETIRED" && (
                            <select
                              aria-label="Asset status"
                              className="h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
                              value={a.status}
                              onChange={(e) => statusMutation.mutate({ id: a.id, status: e.target.value })}
                              disabled={a.status === "ASSIGNED"}
                            >
                              <option value={a.status}>{a.status}</option>
                              {STATUS_FLOW.filter((s) => s !== a.status).map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          )}
                          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => openEdit(a)}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            disabled={deleteMutation.isPending}
                            onClick={() => deleteMutation.mutate(a.id)}
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
            <DialogTitle>{editing ? "Edit Asset" : "Add Asset"}</DialogTitle>
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
                <Label htmlFor="a-name">Asset Name</Label>
                <Input
                  id="a-name"
                  placeholder='MacBook Pro 16"'
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="a-tag">Asset Tag</Label>
                <Input
                  id="a-tag"
                  placeholder="HRM-LT-014"
                  value={form.assetTag}
                  onChange={(e) => setForm((f) => ({ ...f, assetTag: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="a-cat">Category</Label>
                <select
                  id="a-cat"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="a-serial">Serial Number</Label>
                <Input
                  id="a-serial"
                  placeholder="Optional"
                  value={form.serialNumber}
                  onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={saveMutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : editing ? "Save Changes" : "Add Asset"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!assignTarget} onOpenChange={(open) => !open && setAssignTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign {assignTarget?.name}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              assignMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="as-emp">Employee</Label>
              <select
                id="as-emp"
                required
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAssignTarget(null)} disabled={assignMutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={assignMutation.isPending || !employeeId}>
                {assignMutation.isPending ? "Assigning..." : "Assign Asset"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
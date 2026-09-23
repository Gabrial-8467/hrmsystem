"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sun, Plus, Trash2, Pencil } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, errorMessage } from "@/lib/api/client";
import { useSession } from "@/lib/auth/session";
import { P } from "@/lib/permissions";

interface Holiday {
  id: string;
  name: string;
  date: string;
  type: "NATIONAL" | "REGIONAL" | "COMPANY" | "RELIGIOUS";
  description: string | null;
}

const HOLIDAY_TYPES = ["NATIONAL", "REGIONAL", "COMPANY", "RELIGIOUS"] as const;

const EMPTY_FORM = {
  name: "",
  date: new Date().toISOString().slice(0, 10),
  type: "NATIONAL",
  description: "",
};

export default function HolidaysPage() {
  const queryClient = useQueryClient();
  const { hasPermission } = useSession();
  const canManage = hasPermission(P.holidaysManage);

  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: holidays, isLoading, error } = useQuery({
    queryKey: ["holidays"],
    queryFn: async () => api.get<Holiday[]>("/api/v1/attendance/holidays"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["holidays"] });

  const saveMutation = useMutation({
    mutationFn: async (payload: { name: string; date: string; type: string; description: string }) => {
      if (editing) {
        return api.patch(`/api/v1/attendance/holidays/${editing.id}`, payload);
      }
      return api.post("/api/v1/attendance/holidays", payload);
    },
    onSuccess: () => {
      toast.success(editing ? "Holiday updated" : "Holiday added");
      setIsOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.del(`/api/v1/attendance/holidays/${id}`),
    onSuccess: () => {
      toast.success("Holiday deleted");
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setIsOpen(true);
  }

  function openEdit(h: Holiday) {
    setEditing(h);
    setForm({ name: h.name, date: h.date.slice(0, 10), type: h.type, description: h.description ?? "" });
    setIsOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    saveMutation.mutate({ name: form.name.trim(), date: form.date, type: form.type, description: form.description.trim() });
  }

  const dayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "long" });

  return (
    <div className="page-container space-y-6">
      <PageHeader
        eyebrow="Attendance & Schedules"
        title="Official Holiday Calendar"
        description="Public, regional, and company holidays for attendance and leave calculation."
        actions={
          canManage ? (
            <Button className="gap-2" onClick={openCreate}>
              <Plus className="size-4" /> Add Holiday
            </Button>
          ) : undefined
        }
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-3">Holiday Name</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Day of Week</th>
                <th className="px-4 py-3">Type</th>
                {canManage && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td className="px-4 py-6 text-center text-muted-foreground" colSpan={canManage ? 5 : 4}>
                    Loading holidays...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td className="px-4 py-6 text-center text-destructive" colSpan={canManage ? 5 : 4}>
                    {errorMessage(error)}
                  </td>
                </tr>
              ) : holidays?.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-muted-foreground" colSpan={canManage ? 5 : 4}>
                    No holidays yet.
                  </td>
                </tr>
              ) : (
                holidays?.map((h) => (
                  <tr key={h.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-semibold text-foreground">
                      <div className="flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-md bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
                          <Sun className="size-3.5" />
                        </span>
                        {h.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium">{new Date(h.date).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-muted-foreground">{dayFormatter.format(new Date(h.date))}</td>
                    <td className="px-4 py-3">
                      <Badge variant={h.type === "NATIONAL" ? "default" : "secondary"}>{h.type}</Badge>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openEdit(h)}>
                            <Pencil className="size-3.5" /> Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1.5 text-destructive hover:text-destructive"
                            disabled={deleteMutation.isPending}
                            onClick={() => deleteMutation.mutate(h.id)}
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
            <DialogTitle>{editing ? "Edit Holiday" : "Add Holiday"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Holiday Name</Label>
              <Input
                id="name"
                placeholder="Independence Day"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger id="type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {HOLIDAY_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="Optional note"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={saveMutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : editing ? "Save Changes" : "Add Holiday"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
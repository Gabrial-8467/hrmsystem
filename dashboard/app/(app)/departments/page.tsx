"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, Users, Briefcase } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { api } from "@/lib/api/client";
import { toast } from "sonner";

interface Department {
  id: string;
  name: string;
  code: string;
  description: string | null;
  _count?: { employees: number; designations: number };
}

export default function DepartmentsPage() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({ name: "", code: "", description: "" });

  const { data: departments, isPending, isError, refetch } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      return api.get<Department[]>("/api/v1/departments");
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: typeof formData) => {
      return api.post("/api/v1/departments", payload);
    },
    onSuccess: () => {
      toast.success("Department created successfully");
      setIsOpen(false);
      setFormData({ name: "", code: "", description: "" });
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
  });

  return (
    <div className="page-container space-y-6">
      <PageHeader
        eyebrow="Organization"
        title="Departments"
        description="Structure your organization into functional departments and teams."
        actions={
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="size-4" /> Add Department
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[450px]">
              <DialogHeader>
                <DialogTitle>Add Department</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createMutation.mutate(formData);
                }}
                className="space-y-4 pt-2"
              >
                <div className="space-y-2">
                  <Label htmlFor="name">Department Name</Label>
                  <Input
                    id="name"
                    placeholder="Engineering"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code">Department Code</Label>
                  <Input
                    id="code"
                    placeholder="ENG"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="desc">Description</Label>
                  <Input
                    id="desc"
                    placeholder="Software development and architecture"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    Create
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState title="Failed to load departments" retry={refetch} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {departments?.map((dept: Department) => (
            <Card key={dept.id} className="hover:border-primary/50 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Building2 className="size-5" />
                  </span>
                  <div>
                    <CardTitle className="text-base font-semibold">{dept.name}</CardTitle>
                    <span className="text-xs font-mono text-muted-foreground">{dept.code}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-2 text-sm space-y-3">
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {dept.description || "No description provided."}
                </p>
                <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 font-medium text-foreground">
                    <Users className="size-3.5 text-primary" /> {dept._count?.employees ?? 0} Employees
                  </span>
                  <span className="flex items-center gap-1">
                    <Briefcase className="size-3.5" /> {dept._count?.designations ?? 0} Roles
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

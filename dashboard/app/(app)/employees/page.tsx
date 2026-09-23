"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, User, Eye } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api/client";
import { toast } from "sonner";
import type { ListResult } from "@/lib/types";

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  employeeCode: string;
  department: { name: string } | null;
  designation: { title: string } | null;
  branch: { name: string } | null;
  status: string;
}

interface DepartmentSummary {
  id: string;
  name: string;
}

export default function EmployeesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    employeeCode: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    employmentType: "FULL_TIME",
    basicSalary: 75000,
  });

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["employees", search, departmentFilter],
    queryFn: async () => {
      const res = await api.get<ListResult<Employee>>("/api/v1/employees", {
        query: { search: search || undefined, departmentId: departmentFilter || undefined, limit: 50 },
      });
      return res;
    },
  });

  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const res = await api.get<DepartmentSummary[]>("/api/v1/departments");
      return res;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: typeof formData) => {
      return api.post("/api/v1/employees", payload);
    },
    onSuccess: () => {
      toast.success("Employee created successfully");
      setIsAddOpen(false);
      setFormData({
        employeeCode: "",
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        employmentType: "FULL_TIME",
        basicSalary: 75000,
      });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (err: Error) => {
      toast.error(err?.message || "Failed to create employee");
    },
  });

  const employees = data?.items ?? [];

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="People"
        title="Employees"
        description="Manage your workforce, employee profiles, and organizational assignments."
        actions={
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="size-4" /> Add Employee
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Add New Employee</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createMutation.mutate(formData);
                }}
                className="space-y-4 pt-2"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">Employee Code</Label>
                    <Input
                      id="code"
                      placeholder="EMP-101"
                      value={formData.employeeCode}
                      onChange={(e) => setFormData({ ...formData, employeeCode: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="type">Employment Type</Label>
                    <select
                      id="type"
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                      value={formData.employmentType}
                      onChange={(e) => setFormData({ ...formData, employmentType: e.target.value })}
                    >
                      <option value="FULL_TIME">Full Time</option>
                      <option value="PART_TIME">Part Time</option>
                      <option value="CONTRACT">Contract</option>
                      <option value="INTERN">Intern</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      placeholder="Jane"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      placeholder="Doe"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Work Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="jane.doe@acme.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    placeholder="+1-555-0199"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Creating..." : "Create Employee"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Search and Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email or ID..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-[200px]">
          <select
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
          >
            <option value="">All Departments</option>
            {departments?.map((d: DepartmentSummary) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      {isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState title="Failed to load employees" retry={refetch} />
      ) : employees.length === 0 ? (
        <EmptyState
          icon={User}
          title="No employees found"
          description="Add your first employee to start managing your organization's workforce."
          action={{
            label: "Add Employee",
            onClick: () => setIsAddOpen(true),
          }}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Designation</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {employees.map((emp: Employee) => (
                  <tr key={emp.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs">
                          {emp.firstName?.charAt(0)}{emp.lastName?.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">{emp.firstName} {emp.lastName}</p>
                          <p className="text-xs text-muted-foreground">{emp.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{emp.employeeCode}</td>
                    <td className="px-4 py-3">{emp.department?.name ?? "—"}</td>
                    <td className="px-4 py-3">{emp.designation?.title ?? "—"}</td>
                    <td className="px-4 py-3">{emp.branch?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={emp.status === "ACTIVE" ? "default" : "secondary"}>
                        {emp.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/employees/${emp.id}`}>
                        <Button variant="ghost" size="sm" className="gap-1 text-xs">
                          <Eye className="size-3.5" /> View Profile
                        </Button>
                      </Link>
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

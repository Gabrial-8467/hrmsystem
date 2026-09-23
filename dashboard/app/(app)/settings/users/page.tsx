"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  UserPlus,
  Pencil,
  Trash2,
  ShieldCheck,
  Lock,
  KeyRound,
  Search,
  Users,
  UserCheck,
  UserX,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { errorMessage } from "@/lib/api/client";
import { useUser, useSession } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import type { PermissionGroup, RoleSummary, UserSummary } from "@/lib/types";
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  listPermissions,
} from "@/lib/api/auth";
import { toast } from "sonner";

const STATUS_OPTIONS = [
  { value: "ALL", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "DEACTIVATED", label: "Deactivated" },
] as const;

type UserStatusFilter = (typeof STATUS_OPTIONS)[number]["value"];

// ---------------------------------------------------------------------------
// Role picker check-list (used by invite/edit user dialogs)
// ---------------------------------------------------------------------------

function RoleCheckList({
  roles,
  selected,
  onToggle,
  disabled,
}: {
  roles: RoleSummary[];
  selected: Set<string>;
  onToggle: (code: string) => void;
  disabled?: boolean;
}) {
  if (roles.length === 0) {
    return <p className="text-xs text-muted-foreground">No roles available yet.</p>;
  }
  return (
    <div className="grid gap-1.5 max-h-56 overflow-y-auto pr-1">
      {roles.map((r) => (
        <label
          key={r.id}
          className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 cursor-pointer hover:bg-muted/40"
        >
          <Checkbox
            checked={selected.has(r.code)}
            disabled={disabled}
            onCheckedChange={() => onToggle(r.code)}
          />
          <span className="flex-1">
            <span className="block text-sm font-medium leading-tight">{r.name}</span>
            <span className="block text-[11px] text-muted-foreground font-mono">{r.code}</span>
          </span>
          {r.isSystem ? <Badge variant="muted" className="text-[10px]">System</Badge> : null}
        </label>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invite user dialog
// ---------------------------------------------------------------------------

function InviteUserDialog({
  open,
  onOpenChange,
  roles,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roles: RoleSummary[];
}) {
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const mutation = useMutation({
    mutationFn: async () =>
      createUser({
        email,
        firstName,
        lastName,
        password: password || undefined,
        roleCodes: Array.from(selected),
      }),
    onSuccess: () => {
      toast.success("User created and role(s) assigned");
      queryClient.invalidateQueries({ queryKey: ["usersList"] });
      onOpenChange(false);
    },
    onError: (err: unknown) => toast.error(errorMessage(err) || "Failed to create user"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Invite User</DialogTitle>
          <DialogDescription>Create a user account and assign one or more roles.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4 pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (selected.size === 0) {
              toast.error("Select at least one role");
              return;
            }
            mutation.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invite-fn">First Name</Label>
              <Input id="invite-fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-ln">Last Name</Label>
              <Input id="invite-ln" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-email">Work Email</Label>
            <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-pw">Password</Label>
            <Input
              id="invite-pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank to auto-generate"
            />
            <p className="text-xs text-muted-foreground">A temporary password is generated when left blank.</p>
          </div>
          <div className="space-y-2">
            <Label>Roles</Label>
            <RoleCheckList
              roles={roles}
              selected={selected}
              onToggle={(code) => {
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (next.has(code)) next.delete(code);
                  else next.add(code);
                  return next;
                });
              }}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {mutation.isPending ? "Creating..." : "Create User"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Edit user dialog
// ---------------------------------------------------------------------------

function EditUserDialog({
  user,
  roles,
  onClose,
}: {
  user: UserSummary;
  roles: RoleSummary[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [status, setStatus] = useState(user.status);
  const [selected, setSelected] = useState<Set<string>>(new Set(user.roles.map((r) => r.code)));

  const mutation = useMutation({
    mutationFn: async () =>
      updateUser(user.id, {
        firstName,
        lastName,
        status,
        roleCodes: Array.from(selected),
      }),
    onSuccess: () => {
      toast.success("User updated");
      queryClient.invalidateQueries({ queryKey: ["usersList"] });
      onClose();
    },
    onError: (err: unknown) => toast.error(errorMessage(err) || "Failed to update user"),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4 pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (selected.size === 0) {
              toast.error("Select at least one role");
              return;
            }
            mutation.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-fn">First Name</Label>
              <Input id="edit-fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-ln">Last Name</Label>
              <Input id="edit-ln" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-status">Status</Label>
            <select
              id="edit-status"
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="DEACTIVATED">Deactivated</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Roles</Label>
            <RoleCheckList
              roles={roles}
              selected={selected}
              onToggle={(code) => {
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (next.has(code)) next.delete(code);
                  else next.add(code);
                  return next;
                });
              }}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {mutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Permission groups editor (used by the role builder)
// ---------------------------------------------------------------------------

function PermissionGroupsEditor({
  groups,
  selected,
  onToggle,
  onSelectAll,
}: {
  groups: PermissionGroup[];
  selected: Set<string>;
  onToggle: (key: string) => void;
  onSelectAll: (keys: string[], value: boolean) => void;
}) {
  return (
    <div className="grid gap-3 max-h-72 overflow-y-auto pr-1">
      {groups.length === 0 ? (
        <p className="text-xs text-muted-foreground">No permissions available.</p>
      ) : null}
      {groups.map((group) => {
        const groupKeys = group.permissions.map((p) => p.key);
        const allSelected = groupKeys.length > 0 && groupKeys.every((k) => selected.has(k));
        const someSelected = groupKeys.some((k) => selected.has(k));
        const selectedCount = groupKeys.filter((k) => selected.has(k)).length;
        return (
          <div key={group.module} className="rounded-lg border border-border bg-background p-3">
            <label className="flex items-center gap-2 cursor-pointer mb-1">
              <Checkbox
                checked={someSelected && !allSelected ? "indeterminate" : allSelected}
                onCheckedChange={(val) => onSelectAll(groupKeys, val === true)}
              />
              <span className="text-sm font-semibold capitalize">{group.module.replace(/[-_]/g, " ")}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {selectedCount}/{groupKeys.length}
              </span>
            </label>
            <div className="grid gap-1.5 pl-6">
              {group.permissions.map((p) => (
                <label key={p.key} className="flex items-center gap-2 cursor-pointer py-0.5">
                  <Checkbox checked={selected.has(p.key)} onCheckedChange={() => onToggle(p.key)} />
                  <span className="text-xs">
                    <span className="font-medium">{p.name}</span>
                    <span className="ml-2 font-mono text-[11px] text-muted-foreground">{p.key}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Role editor dialog (create / edit custom role)
// ---------------------------------------------------------------------------

function RoleEditorDialog({
  open,
  onOpenChange,
  groups,
  role,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  groups: PermissionGroup[];
  role?: RoleSummary | null;
}) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(role);

  const [name, setName] = useState(role?.name ?? "");
  const [code, setCode] = useState(role?.code ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [isActive, setIsActive] = useState(role ? role.isActive : true);
  const [selected, setSelected] = useState<Set<string>>(new Set(role?.permissions ?? []));

  const createMutation = useMutation({
    mutationFn: async () =>
      createRole({
        name,
        code,
        description: description || null,
        permissions: Array.from(selected),
      }),
    onSuccess: () => {
      toast.success("Role created");
      queryClient.invalidateQueries({ queryKey: ["rolesList"] });
      queryClient.invalidateQueries({ queryKey: ["usersList"] });
      onOpenChange(false);
    },
    onError: (err: unknown) => toast.error(errorMessage(err) || "Failed to create role"),
  });

  const updateMutation = useMutation({
    mutationFn: async () =>
      updateRole(role!.id, {
        name,
        description: description || null,
        isActive,
        permissions: Array.from(selected),
      }),
    onSuccess: () => {
      toast.success("Role updated");
      queryClient.invalidateQueries({ queryKey: ["rolesList"] });
      queryClient.invalidateQueries({ queryKey: ["usersList"] });
      onOpenChange(false);
    },
    onError: (err: unknown) => toast.error(errorMessage(err) || "Failed to update role"),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Role" : "Create Custom Role"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the role name, description and its permission set."
              : "Define a role with its own set of permissions. System roles are managed by provisioning."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4 pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) {
              toast.error("Role name is required");
              return;
            }
            if (!isEdit && !code.trim()) {
              toast.error("Role code is required");
              return;
            }
            if (isEdit) updateMutation.mutate();
            else createMutation.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="role-name">Role Name</Label>
              <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-code">Code</Label>
              {isEdit ? (
                <div className="h-9 rounded-md border border-input bg-muted px-3 text-sm flex items-center font-mono text-muted-foreground">
                  {code}
                </div>
              ) : (
                <Input
                  id="role-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. RECRUITER"
                  required
                />
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-desc">Description</Label>
            <textarea
              id="role-desc"
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this role responsible for?"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Permissions</Label>
              {isEdit ? (
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  Active
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isActive}
                    onClick={() => setIsActive((v) => !v)}
                    className={`relative h-5 w-9 rounded-full transition-colors ${isActive ? "bg-primary" : "bg-muted"}`}
                  >
                    <span
                      className={`absolute top-0.5 size-4 rounded-full bg-card shadow transition-transform ${isActive ? "translate-x-4" : "translate-x-0.5"}`}
                    />
                  </button>
                </label>
              ) : null}
            </div>
            <PermissionGroupsEditor groups={groups} selected={selected} onToggle={toggleKey} onSelectAll={selectAll} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={isPending}>
              {isPending ? "Saving..." : isEdit ? "Save Role" : "Create Role"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );

  function toggleKey(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll(keys: string[], value: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (value) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  }
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function UsersRolesPage() {
  const queryClient = useQueryClient();
  const user = useUser();
  const { hasPermission } = useSession();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserSummary | null>(null);
  const [roleEditorOpen, setRoleEditorOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleSummary | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>("ALL");

  const { data: usersData, isPending: usersPending } = useQuery({
    queryKey: ["usersList"],
    queryFn: () => listUsers({ pageSize: 100 }),
  });

  const { data: rolesData, isPending: rolesPending } = useQuery({
    queryKey: ["rolesList"],
    queryFn: () => listRoles(),
  });

  const { data: permsData } = useQuery({
    queryKey: ["permissionGroups"],
    queryFn: () => listPermissions(),
    enabled: hasPermission("roles.manage"),
  });

  const deleteUserMut = useMutation({
    mutationFn: async (u: UserSummary) => deleteUser(u.id),
    onSuccess: () => {
      toast.success("User deactivated");
      queryClient.invalidateQueries({ queryKey: ["usersList"] });
    },
    onError: (err: unknown) => toast.error(errorMessage(err) || "Failed to delete user"),
  });

  const deleteRoleMut = useMutation({
    mutationFn: async (r: RoleSummary) => deleteRole(r.id),
    onSuccess: () => {
      toast.success("Role deleted");
      queryClient.invalidateQueries({ queryKey: ["rolesList"] });
      queryClient.invalidateQueries({ queryKey: ["usersList"] });
    },
    onError: (err: unknown) => toast.error(errorMessage(err) || "Failed to delete role"),
  });

  const users = useMemo(() => usersData?.items ?? [], [usersData]);
  const roles = rolesData?.roles ?? [];
  const groups = (permsData?.grouped ?? []).filter((g) => g.module !== "platform");

  const canManageRoles = hasPermission("roles.manage");
  const canCreateUser = hasPermission("users.create");
  const canUpdateUser = hasPermission("users.update");
  const canDeleteUser = hasPermission("users.delete");

  const totalPerms = groups.reduce((n, g) => n + g.permissions.length, 0);
  const systemRoles = roles.filter((r) => r.isSystem);
  const customRoles = roles.filter((r) => !r.isSystem);
  const activeUsers = users.filter((u) => u.status === "ACTIVE").length;
  const inactiveUsers = users.length - activeUsers;
  const teamActivePct = users.length > 0 ? Math.round((activeUsers / users.length) * 100) : 0;

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (statusFilter !== "ALL" && u.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = `${u.firstName ?? ""} ${u.lastName ?? ""} ${u.email}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [users, query, statusFilter]);

  const stats = [
    {
      label: "Total users",
      value: users.length,
      hint: `${activeUsers} active on the team`,
      icon: <Users className="size-4" />,
      tone: "bg-primary/10 text-primary",
    },
    {
      label: "Active users",
      value: activeUsers,
      hint: `${teamActivePct}% of all users`,
      icon: <UserCheck className="size-4" />,
      tone: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Suspended / deactivated",
      value: inactiveUsers,
      hint: "Not currently active",
      icon: <UserX className="size-4" />,
      tone: "bg-amber-50 text-amber-600",
    },
    {
      label: "Roles configured",
      value: roles.length,
      hint: `${customRoles.length} custom · ${systemRoles.length} system`,
      icon: <ShieldCheck className="size-4" />,
      tone: "bg-sky-50 text-sky-600",
    },
  ];

  const renderRoleCard = (r: RoleSummary) => {
    const pct = totalPerms > 0 ? Math.round((r.permissions.length / totalPerms) * 100) : 0;
    return (
      <div
        key={r.id}
        className="rounded-lg border border-border bg-card p-3 space-y-2 transition-colors hover:border-primary/40 hover:shadow-sm"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/60">
              <ShieldCheck className="size-3.5 text-muted-foreground" />
            </span>
            <span className="font-semibold text-sm truncate">{r.name}</span>
            {r.isSystem ? <Lock className="size-3 shrink-0 text-muted-foreground" /> : null}
            {!r.isActive ? <Badge variant="warning" className="text-[10px]">Inactive</Badge> : null}
          </div>
          {canManageRoles && !r.isSystem ? (
            <div className="flex items-center gap-0.5">
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                aria-label={`Edit ${r.name}`}
                onClick={() => {
                  setEditingRole(r);
                  setRoleEditorOpen(true);
                }}
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-6 text-destructive"
                aria-label={`Delete ${r.name}`}
                onClick={() => {
                  if (window.confirm(`Delete role "${r.name}"?`)) {
                    deleteRoleMut.mutate(r);
                  }
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">
          {r.description || (r.isSystem ? "Built-in system role." : "Custom role.")}
        </p>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px]">{r.code}</span>
            <span>
              {r.permissions.length} perm{r.permissions.length === 1 ? "" : "s"} · {r.userCount} user
              {r.userCount === 1 ? "" : "s"}
            </span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            title={`${r.permissions.length} of ${totalPerms} permissions`}
          >
            <div className="h-full rounded-full bg-primary/70 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="page-container space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Users & RBAC Role Management"
        description="Manage system access, assign roles, and configure permission policies."
        actions={
          <div className="flex items-center gap-2">
            {canManageRoles ? (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  setEditingRole(null);
                  setRoleEditorOpen(true);
                }}
              >
                <Plus className="size-4" /> New Role
              </Button>
            ) : null}
            {canCreateUser ? (
              <Button className="gap-2" onClick={() => setInviteOpen(true)}>
                <UserPlus className="size-4" /> Invite User
              </Button>
            ) : null}
          </div>
        }
      />

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="overflow-hidden">
            <CardContent className="flex items-center gap-3 p-4">
              <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", s.tone)}>
                {s.icon}
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-semibold leading-tight tabular-nums">{s.value}</p>
                <p className="truncate text-xs text-muted-foreground">{s.label}</p>
                <p className="truncate text-[11px] text-muted-foreground/70">{s.hint}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Roles panel */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="size-4 text-muted-foreground" /> Roles
              <Badge variant="secondary" className="text-[10px]">{roles.length}</Badge>
            </CardTitle>
            {canManageRoles ? (
              <Button
                size="xs"
                variant="outline"
                className="gap-1"
                onClick={() => {
                  setEditingRole(null);
                  setRoleEditorOpen(true);
                }}
              >
                <Plus className="size-3" /> New Role
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            {rolesPending ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : (
              <>
                {systemRoles.length > 0 ? (
                  <div className="space-y-2">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <Lock className="size-3" /> System roles · {systemRoles.length}
                    </p>
                    {systemRoles.map((r) => renderRoleCard(r))}
                  </div>
                ) : null}
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <KeyRound className="size-3" /> Custom roles · {customRoles.length}
                  </p>
                  {customRoles.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                      No custom roles yet. Create one to grant tailored access.
                    </div>
                  ) : (
                    customRoles.map((r) => renderRoleCard(r))
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Users panel */}
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader className="pb-0">
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="size-4 text-muted-foreground" /> Users
              <Badge variant="secondary" className="text-[10px]">
                {filteredUsers.length === users.length ? users.length : `${filteredUsers.length}/${users.length}`}
              </Badge>
            </CardTitle>
          </CardHeader>
          <div className="flex flex-wrap items-center gap-2 px-6 py-4">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search by name or email..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatusFilter(opt.value)}
                  className={cn(
                    "h-7 rounded-md px-3 text-xs font-medium transition-colors",
                    statusFilter === opt.value
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Roles</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {usersPending ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3" colSpan={4}>
                        <Skeleton className="h-10 w-full" />
                      </td>
                    </tr>
                  ))
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs">
                            {u.firstName?.charAt(0)}
                            {u.lastName?.charAt(0)}
                            <span
                              className={cn(
                                "absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-card",
                                u.status === "ACTIVE" ? "bg-emerald-500" : "bg-amber-500",
                              )}
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground truncate">
                              {u.firstName} {u.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-[220px]">
                          {(u.roles ?? []).map((r) => (
                            <Badge key={r.id} variant="secondary" className="text-[10px]">{r.name}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={u.status === "ACTIVE" ? "success" : "outline"} className="capitalize">
                          {u.status === "ACTIVE" ? "Active" : u.status.toLowerCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canUpdateUser ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              aria-label={`Edit ${u.email}`}
                              onClick={() => setEditingUser(u)}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                          ) : null}
                          {canDeleteUser && u.email !== user?.email ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7 text-destructive"
                              aria-label={`Delete ${u.email}`}
                              onClick={() => {
                                if (window.confirm(`Deactivate ${u.firstName} ${u.lastName}?`)) {
                                  deleteUserMut.mutate(u);
                                }
                              }}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {!usersPending && filteredUsers.length === 0 ? (
              <div className="p-10 text-center">
                <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-muted">
                  <Users className="size-4 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">No matching users</p>
                <p className="text-xs text-muted-foreground">Try adjusting the search or status filter.</p>
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      <InviteUserDialog
        key={inviteOpen ? "open" : "closed"}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        roles={roles}
      />
      {editingUser ? (
        <EditUserDialog user={editingUser} roles={roles} onClose={() => setEditingUser(null)} />
      ) : null}
      <RoleEditorDialog
        key={`${editingRole?.id ?? "new"}-${roleEditorOpen}`}
        open={roleEditorOpen}
        onOpenChange={setRoleEditorOpen}
        groups={groups}
        role={editingRole}
      />
    </div>
  );
}
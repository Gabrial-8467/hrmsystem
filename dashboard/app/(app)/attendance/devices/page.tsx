"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Fingerprint,
  ScanFace,
  ScanLine,
  MonitorCog,
  Plus,
  Activity,
  Trash2,
  RefreshCcw,
  CircleDot,
  History,
  UserPlus,
  Radio,
  RadioTower,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { api } from "@/lib/api/client";
import { toast } from "sonner";

export type DeviceMode = "FACE" | "FINGERPRINT" | "HYBRID";
export type DeviceStatus = "ONLINE" | "OFFLINE" | "PAUSED";
export type SyncStatus = "IDLE" | "RUNNING" | "OK" | "FAILED";

interface BiometricDevice {
  id: string;
  name: string;
  code: string;
  mode: DeviceMode;
  status: DeviceStatus;
  commKey: number;
  serialNumber: string | null;
  ipAddress: string | null;
  port: number;
  location: string | null;
  lastPingAt: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: SyncStatus;
  lastSyncError: string | null;
  lastSyncCount: number;
  listening: boolean;
  _count: { attendanceRecords: number; punchLogs: number; enrollments: number };
}

interface EmployeeOption {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
}

interface Enrollment {
  id: string;
  deviceUserId: string;
  nameOnDevice: string | null;
  faceEnrolled: boolean;
  fingerprints: number;
  employee: { id: string; firstName: string; lastName: string; employeeCode: string };
}

interface PunchLog {
  id: string;
  deviceUserId: string;
  punchTime: string;
  punchState: number;
  verifyMode: number;
  source: "PULL" | "REALTIME" | "API";
  employee: { firstName: string; lastName: string; employeeCode: string } | null;
}

const MODE_META: Record<DeviceMode, { label: string; icon: typeof Fingerprint; cls: string }> = {
  FACE: { label: "Face", icon: ScanFace, cls: "bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-400" },
  FINGERPRINT: { label: "Fingerprint", icon: Fingerprint, cls: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400" },
  HYBRID: { label: "Hybrid", icon: ScanLine, cls: "bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-400" },
};

const STATUS_META: Record<DeviceStatus, { label: string; cls: string; dot: string }> = {
  ONLINE: { label: "Online", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400", dot: "bg-emerald-500" },
  OFFLINE: { label: "Offline", cls: "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-400", dot: "bg-slate-400" },
  PAUSED: { label: "Paused", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400", dot: "bg-amber-500" },
};

const SYNC_META: Record<SyncStatus, { label: string; cls: string }> = {
  IDLE: { label: "Never synced", cls: "text-slate-500" },
  RUNNING: { label: "Syncing…", cls: "text-sky-600" },
  OK: { label: "Last sync OK", cls: "text-emerald-600" },
  FAILED: { label: "Sync failed", cls: "text-rose-600" },
};

const cn = (...cls: Array<string | false | undefined>) => cls.filter(Boolean).join(" ");

function fmtTime(value: string | null | undefined): string {
  if (!value) return "Never";
  const d = new Date(value);
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default function BiometricDevicesPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const [enrollDevice, setEnrollDevice] = useState<BiometricDevice | null>(null);
  const [logsDevice, setLogsDevice] = useState<BiometricDevice | null>(null);

  const devicesQuery = useQuery({
    queryKey: ["biometric-devices"],
    queryFn: async () => {
      const res = await api.get<BiometricDevice[] | { data: BiometricDevice[] }>("/api/v1/attendance/devices");
      return Array.isArray(res) ? res : (res?.data ?? []);
    },
  });

  const listDevices = useMemo(() => devicesQuery.data ?? [], [devicesQuery.data]);

  const invalidateDevices = () =>
    queryClient.invalidateQueries({ queryKey: ["biometric-devices"] });

  const syncAllMutation = useMutation({
    mutationFn: async () => api.post("/api/v1/attendance/devices/sync-all"),
    onSuccess: (result) => {
      const summary = result as { synced: number; skipped: number };
      toast.success(`Synced ${summary.synced} terminal(s)`);
      invalidateDevices();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const syncMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/api/v1/attendance/devices/${id}/sync`),
    onSuccess: (result) => {
      const summary = result as { status: string; total: number };
      toast.success(summary.status === "OK" ? `Synced ${summary.total} punch(es)` : "Terminal unreachable — sync failed");
      invalidateDevices();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const pingMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/api/v1/attendance/devices/${id}/ping`),
    onSuccess: () => {
      toast.success("Device is online");
      invalidateDevices();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const listenMutation = useMutation({
    mutationFn: async ({ id, enable }: { id: string; enable: boolean }) =>
      enable
        ? api.post(`/api/v1/attendance/devices/${id}/listen`)
        : api.post(`/api/v1/attendance/devices/${id}/unlisten`),
    onSuccess: (_, vars) => {
      toast.success(vars.enable ? "Realtime listening started" : "Realtime listening stopped");
      invalidateDevices();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.del(`/api/v1/attendance/devices/${id}`),
    onSuccess: () => {
      toast.success("Device deleted");
      invalidateDevices();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const employeesQuery = useQuery({
    queryKey: ["employees-list"],
    queryFn: async () => {
      const res = await api.get<{ items: EmployeeOption[] }>("/api/v1/employees?limit=100");
      return res?.items ?? [];
    },
  });

  return (
    <div className="page-container space-y-6">
      <PageHeader
        eyebrow="Biometric Attendance"
        title="Biometric Devices & Terminals"
        description="Manage ZKTeco fingerprint / face terminals: pull attendance logs, listen for live punches, and map employees to device user IDs."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={() => setSimOpen(true)}>
              <Activity className="size-4" /> Simulate Punch
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              disabled={syncAllMutation.isPending || listDevices.length === 0}
              onClick={() => syncAllMutation.mutate()}
            >
              <RefreshCcw className={cn("size-4", syncAllMutation.isPending && "animate-spin")} />
              {syncAllMutation.isPending ? "Syncing…" : "Sync All"}
            </Button>
            <Button className="gap-2" onClick={() => setShowCreate(true)}>
              <Plus className="size-4" /> Register Device
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
              <CircleDot className="size-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Online Terminals</p>
              <p className="text-xl font-bold">
                {listDevices.filter((d) => d.status === "ONLINE").length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-400">
              <RadioTower className="size-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Listening Live</p>
              <p className="text-xl font-bold">
                {listDevices.filter((d) => d.listening).length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-400">
              <History className="size-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Punch Logs</p>
              <p className="text-xl font-bold">
                {listDevices.reduce((sum, d) => sum + d._count.punchLogs, 0)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {devicesQuery.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : devicesQuery.isError ? (
        <ErrorState title="Failed to load devices" retry={devicesQuery.refetch} />
      ) : (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Registered Terminals</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b">
                <tr>
                  <th className="px-4 py-3">Device</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Endpoint</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Enrollments</th>
                  <th className="px-4 py-3">Sync</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {listDevices.map((device) => {
                  const modeMeta = MODE_META[device.mode];
                  const statusMeta = STATUS_META[device.status];
                  const syncMeta = SYNC_META[device.lastSyncStatus];
                  const ModeIcon = modeMeta.icon;
                  return (
                    <tr key={device.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className={cn("flex size-8 items-center justify-center rounded-lg", modeMeta.cls)}>
                            <ModeIcon className="size-4" />
                          </span>
                          <div>
                            <p className="text-xs font-semibold">{device.name}</p>
                            <p className="text-[10px] font-mono text-muted-foreground">
                              {device.code} · {device.serialNumber ?? "N/A"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className={modeMeta.cls}>
                          {modeMeta.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                        {device.ipAddress
                          ? `${device.ipAddress}:${device.port}${device.commKey ? ` · key ${device.commKey}` : ""}`
                          : "No IP configured"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold w-fit", statusMeta.cls)}>
                            <span className={cn("size-1.5 rounded-full", statusMeta.dot)} />
                            {statusMeta.label}
                          </span>
                          {device.listening && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-violet-600 font-semibold">
                              <Radio className="size-3" /> Listening live
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {device._count.enrollments}
                        <button
                          className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
                          onClick={() => setEnrollDevice(device)}
                        >
                          <UserPlus className="size-3" /> Manage
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <p className={cn("text-xs font-medium", syncMeta.cls)}>
                          {syncMeta.label}
                          {device.lastSyncStatus === "OK" && device.lastSyncCount > 0
                            ? ` · ${device.lastSyncCount} punches`
                            : ""}
                        </p>
                        <p className="text-[10px] font-mono text-muted-foreground" title={device.lastSyncError ?? undefined}>
                          {fmtTime(device.lastSyncAt)}
                        </p>
                        {device.lastSyncError ? (
                          <p className="mt-0.5 max-w-[220px] truncate text-[10px] text-rose-500" title={device.lastSyncError}>
                            {device.lastSyncError}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 text-xs"
                            title="Pull attendance logs from terminal"
                            disabled={syncMutation.isPending}
                            onClick={() => syncMutation.mutate(device.id)}
                          >
                            <RefreshCcw className={cn("size-3.5", syncMutation.isPending && "animate-spin")} /> Sync
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 text-xs"
                            title="View raw punch logs"
                            onClick={() => setLogsDevice(device)}
                          >
                            <History className="size-3.5" /> Logs
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn("gap-1.5 text-xs", device.listening && "text-violet-600")}
                            title={device.listening ? "Stop realtime listening" : "Start realtime listening"}
                            disabled={listenMutation.isPending || !device.ipAddress}
                            onClick={() => listenMutation.mutate({ id: device.id, enable: !device.listening })}
                          >
                            <Radio className="size-3.5" />
                            {device.listening ? "Unlisten" : "Listen"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 text-xs"
                            disabled={pingMutation.isPending}
                            onClick={() => pingMutation.mutate(device.id)}
                          >
                            <CircleDot className="size-3.5" /> Ping
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 text-xs text-rose-600 hover:text-rose-700"
                            disabled={deleteMutation.isPending}
                            onClick={() => deleteMutation.mutate(device.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <RegisterDeviceDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={() => {
          setShowCreate(false);
          invalidateDevices();
        }}
      />

      <SimulatePunchDialog
        open={simOpen}
        onOpenChange={setSimOpen}
        devices={listDevices}
        employees={employeesQuery.data ?? []}
        onPunched={() => {
          setSimOpen(false);
          invalidateDevices();
          queryClient.invalidateQueries({ queryKey: ["attendance"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        }}
      />

      {enrollDevice && (
        <EnrollmentsDialog
          open={Boolean(enrollDevice)}
          onOpenChange={(open) => {
            if (!open) setEnrollDevice(null);
          }}
          device={enrollDevice}
          employees={employeesQuery.data ?? []}
          onChanged={invalidateDevices}
        />
      )}

      {logsDevice && (
        <PunchLogsDialog
          open={Boolean(logsDevice)}
          onOpenChange={(open) => {
            if (!open) setLogsDevice(null);
          }}
          device={logsDevice}
        />
      )}
    </div>
  );
}

function RegisterDeviceDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({ name: "", code: "", mode: "HYBRID" as DeviceMode, location: "", serialNumber: "", ipAddress: "", port: "4370", commKey: "0" });
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async () => {
      return api.post("/api/v1/attendance/devices", {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        mode: form.mode,
        location: form.location.trim() || undefined,
        serialNumber: form.serialNumber.trim() || undefined,
        ipAddress: form.ipAddress.trim() || undefined,
        port: parseInt(form.port, 10) || 4370,
        commKey: parseInt(form.commKey, 10) || 0,
      });
    },
    onSuccess: () => {
      toast.success("Device registered");
      queryClient.invalidateQueries({ queryKey: ["biometric-devices"] });
      onCreated();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MonitorCog className="size-4 text-primary" /> Register Biometric Device
          </DialogTitle>
          <DialogDescription>
            Register a ZKTeco fingerprint / face-recognition terminal to collect punches over the network.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="device-name">Device name</Label>
            <Input
              id="device-name"
              placeholder="Main Lobby Terminal"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="device-code">Unique code</Label>
            <Input
              id="device-code"
              placeholder="DEV_LOBBY"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="device-mode">Mode</Label>
            <select
              id="device-mode"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={form.mode}
              onChange={(e) => setForm({ ...form, mode: e.target.value as DeviceMode })}
            >
              <option value="HYBRID">Hybrid (Face + Fingerprint)</option>
              <option value="FACE">Face recognition</option>
              <option value="FINGERPRINT">Fingerprint only</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="device-location">Location</Label>
              <Input
                id="device-location"
                placeholder="Ground Floor Lobby"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="device-commkey">Comm Key</Label>
              <Input
                id="device-commkey"
                type="number"
                placeholder="0"
                value={form.commKey}
                onChange={(e) => setForm({ ...form, commKey: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="device-ip">IP address</Label>
              <Input
                id="device-ip"
                placeholder="192.168.1.10"
                value={form.ipAddress}
                onChange={(e) => setForm({ ...form, ipAddress: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="device-port">Port</Label>
              <Input
                id="device-port"
                type="number"
                value={form.port}
                onChange={(e) => setForm({ ...form, port: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="device-serial">Serial number</Label>
            <Input
              id="device-serial"
              placeholder="ZK-2026-0001"
              value={form.serialNumber}
              onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="gap-2"
            disabled={!form.name || !form.code || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? "Registering..." : "Register"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EnrollmentsDialog({
  open,
  onOpenChange,
  device,
  employees,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device: BiometricDevice;
  employees: EmployeeOption[];
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [employeeId, setEmployeeId] = useState("");
  const [deviceUserId, setDeviceUserId] = useState("");

  const enrollmentsQuery = useQuery({
    queryKey: ["biometric-enrollments", device.id],
    queryFn: async () => {
      const res = await api.get<Enrollment[] | { data: Enrollment[] }>(`/api/v1/attendance/devices/${device.id}/enrollments`);
      return Array.isArray(res) ? res : (res?.data ?? []);
    },
    enabled: open,
  });

  const enrolledEmployeeIds = useMemo(
    () => new Set((enrollmentsQuery.data ?? []).map((e) => e.employee.id)),
    [enrollmentsQuery.data],
  );
  const availableEmployees = useMemo(
    () => employees.filter((e) => !enrolledEmployeeIds.has(e.id)),
    [employees, enrolledEmployeeIds],
  );

  const createMutation = useMutation({
    mutationFn: async () =>
      api.post(`/api/v1/attendance/devices/${device.id}/enrollments`, {
        employeeId,
        deviceUserId: deviceUserId.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("Employee enrolled");
      setEmployeeId("");
      setDeviceUserId("");
      onChanged();
      queryClient.invalidateQueries({ queryKey: ["biometric-enrollments", device.id] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (enrollmentId: string) =>
      api.del(`/api/v1/attendance/devices/${device.id}/enrollments/${enrollmentId}`),
    onSuccess: () => {
      toast.success("Enrollment removed");
      onChanged();
      queryClient.invalidateQueries({ queryKey: ["biometric-enrollments", device.id] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-4 text-primary" /> Enrollments · {device.name}
          </DialogTitle>
          <DialogDescription>
            Map employees to the device user IDs the terminal prints for each punch.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="enroll-employee">Employee</Label>
              <select
                id="enroll-employee"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
              >
                <option value="">Select an employee</option>
                {availableEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName} ({emp.employeeCode})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="enroll-userid">Device user ID</Label>
              <Input
                id="enroll-userid"
                placeholder="EMP-001"
                value={deviceUserId}
                onChange={(e) => setDeviceUserId(e.target.value)}
              />
            </div>
          </div>
          <Button
            size="sm"
            className="gap-2 justify-self-start"
            disabled={!employeeId || !deviceUserId.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            <UserPlus className="size-4" /> {createMutation.isPending ? "Enrolling…" : "Enroll"}
          </Button>

          <div className="divide-y divide-border rounded-lg border">
            {enrollmentsQuery.isPending ? (
              <p className="p-3 text-xs text-muted-foreground">Loading enrollments…</p>
            ) : (enrollmentsQuery.data ?? []).length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">No employees enrolled yet.</p>
            ) : (
              (enrollmentsQuery.data ?? []).map((en) => (
                <div key={en.id} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <p className="text-xs font-medium">
                      {en.employee.firstName} {en.employee.lastName}
                      <span className="ml-1.5 font-mono text-muted-foreground">({en.employee.employeeCode})</span>
                    </p>
                    <p className="text-[10px] font-mono text-muted-foreground">
                      userId {en.deviceUserId}
                      {en.fingerprints > 0 ? ` · ${en.fingerprints} fingerprint(s)` : ""}
                      {en.faceEnrolled ? " · face" : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-rose-600 hover:text-rose-700"
                    disabled={removeMutation.isPending}
                    onClick={() => removeMutation.mutate(en.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PunchLogsDialog({
  open,
  onOpenChange,
  device,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device: BiometricDevice;
}) {
  const [matched, setMatched] = useState<"" | "true" | "false">("");
  const queryClient = useQueryClient();

  const logsQuery = useQuery({
    queryKey: ["biometric-logs", device.id, matched],
    queryFn: async () => {
      const data = await api.get<{ items: PunchLog[]; total: number }>(
        `/api/v1/attendance/devices/${device.id}/logs?limit=50${matched ? `&matched=${matched}` : ""}`,
      );
      return data as { items: PunchLog[]; total: number };
    },
    enabled: open,
  });

  const logs = logsQuery.data?.items ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4 text-primary" /> Punch Logs · {device.name}
          </DialogTitle>
          <DialogDescription>
            Raw events pulled from the terminal. Sync to refresh from hardware.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-2">
          <select
            className="flex h-9 w-44 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={matched}
            onChange={(e) => setMatched(e.target.value as "" | "true" | "false")}
          >
            <option value="">All punches</option>
            <option value="true">Matched only</option>
            <option value="false">Unmatched only</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["biometric-logs", device.id] })}
          >
            <RefreshCcw className={cn("size-3.5", logsQuery.isFetching && "animate-spin")} /> Refresh
          </Button>
        </div>
        <div className="max-h-96 overflow-y-auto divide-y divide-border rounded-lg border">
          {logsQuery.isPending ? (
            <p className="p-3 text-xs text-muted-foreground">Loading logs…</p>
          ) : logs.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">No punch logs found.</p>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="flex items-center justify-between px-3 py-2">
                <div>
                  <p className="text-xs font-medium">
                    {log.employee
                      ? `${log.employee.firstName} ${log.employee.lastName} (${log.employee.employeeCode})`
                      : `Unknown user · ${log.deviceUserId}`}
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground">
                    {new Date(log.punchTime).toLocaleString()} · {log.punchState === 0 ? "IN" : "OUT"} · verifyMode {log.verifyMode} · {log.source}
                  </p>
                </div>
                <Badge variant="secondary" className={log.employee ? MODE_META.HYBRID.cls : "bg-slate-100 text-slate-500"}>
                  {log.employee ? "Matched" : "Unmatched"}
                </Badge>
              </div>
            ))
          )}
        </div>
        <p className="text-[10px] text-muted-foreground">{logsQuery.data?.total ?? 0} total logs</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SimulatePunchDialog({
  open,
  onOpenChange,
  devices,
  employees,
  onPunched,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devices: BiometricDevice[];
  employees: EmployeeOption[];
  onPunched: () => void;
}) {
  const [deviceId, setDeviceId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [type, setType] = useState<"IN" | "OUT">("IN");
  const mutation = useMutation({
    mutationFn: async () => {
      return api.post("/api/v1/attendance/devices/simulate-punch", {
        employeeId,
        deviceCode: deviceId,
        type,
      });
    },
    onSuccess: () => {
      toast.success(`${type} punch pushed successfully`);
      onPunched();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const activeDevices = useMemo(() => devices.filter((d) => d.status === "ONLINE"), [devices]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="size-4 text-primary" /> Simulate Hardware Punch
          </DialogTitle>
          <DialogDescription>
            Emulate a terminal pushing a biometric punch event — used to test the integration before wiring real hardware.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="sim-device">Biometric terminal</Label>
            <select
              id="sim-device"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
            >
              <option value="">Select a device</option>
              {devices.map((d) => (
                <option key={d.id} value={d.code}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sim-employee">Employee</Label>
            <select
              id="sim-employee"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">Select an employee</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName} ({emp.employeeCode})
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sim-type">Punch type</Label>
            <div className="flex gap-2">
              <Button
                variant={type === "IN" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setType("IN")}
              >
                Check In
              </Button>
              <Button
                variant={type === "OUT" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setType("OUT")}
              >
                Check Out
              </Button>
            </div>
          </div>
          {activeDevices.length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-400">
              No online devices — punch will still be recorded via the first registered terminal.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="gap-2"
            disabled={!deviceId || !employeeId || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Pushing..." : "Push Punch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
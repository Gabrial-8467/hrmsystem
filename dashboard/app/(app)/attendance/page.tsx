"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, CheckCircle2, AlertCircle, LogIn, LogOut, Fingerprint, ScanFace } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { useMemo, useState } from "react";
import type { ListResult } from "@/lib/types";
import { BiometricPunch, type BiometricMethod } from "@/components/attendance/biometric-punch";
import { useSession } from "@/lib/auth/session";

interface AttendanceRecord {
  id: string;
  employee: { firstName: string; lastName: string } | null;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  workHours: number;
  status: string;
  method?: BiometricMethod | null;
}

const METHOD_META: Record<BiometricMethod, { label: string; cls: string }> = {
  WEB: { label: "Web", cls: "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-400" },
  FACE: { label: "Face", cls: "bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-400" },
  FINGERPRINT: { label: "Fingerprint", cls: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400" },
  DEVICE: { label: "Device", cls: "bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-400" },
};

export default function AttendancePage() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const [punch, setPunch] = useState<"in" | "out" | null>(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["attendance"],
    queryFn: async () => {
      return api.get<ListResult<AttendanceRecord>>("/api/v1/attendance");
    },
  });

  const records = useMemo(() => data?.items ?? [], [data]);

  const biometricCounts = useMemo(
    () => ({
      face: records.filter((r) => r.method === "FACE").length,
      fingerprint: records.filter((r) => r.method === "FINGERPRINT").length,
    }),
    [records],
  );

  return (
    <div className="page-container space-y-6">
      <PageHeader
        eyebrow="Attendance"
        title="Daily Attendance & Time Tracking"
        description="Track check-ins, check-outs, work hours, overtime, and late arrivals."
        actions={
          <div className="flex gap-2">
            <Button
              onClick={() => setPunch("in")}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <LogIn className="size-4" /> Check In Now
            </Button>
            <Button
              onClick={() => setPunch("out")}
              variant="outline"
              className="gap-2"
            >
              <LogOut className="size-4" /> Check Out
            </Button>
          </div>
        }
      />

      <BiometricPunch
        open={punch !== null}
        onOpenChange={(open) => setPunch(open ? punch : null)}
        direction={punch ?? "in"}
        employeeName={user ? `${user.firstName} ${user.lastName}` : undefined}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["attendance"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        }}
      />

      {/* Summary KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
              <CheckCircle2 className="size-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Present Today</p>
              <p className="text-xl font-bold">42</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
              <Clock className="size-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Late Arrivals</p>
              <p className="text-xl font-bold">3</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-400">
              <ScanFace className="size-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Face Verified</p>
              <p className="text-xl font-bold">{biometricCounts.face}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
              <Fingerprint className="size-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Fingerprint Verified</p>
              <p className="text-xl font-bold">{biometricCounts.fingerprint}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400">
              <AlertCircle className="size-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Absent / On Leave</p>
              <p className="text-xl font-bold">4</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Attendance Log Table */}
      {isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : isError ? (
        <ErrorState title="Failed to load attendance records" retry={refetch} />
      ) : (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Recent Attendance Log</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Check In</th>
                  <th className="px-4 py-3">Check Out</th>
                  <th className="px-4 py-3">Work Hours</th>
                  <th className="px-4 py-3">Verified By</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {records.map((rec: AttendanceRecord) => (
                  <tr key={rec.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      {rec.employee ? `${rec.employee.firstName} ${rec.employee.lastName}` : "Employee"}
                    </td>
                    <td className="px-4 py-3">{new Date(rec.date).toLocaleDateString()}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {rec.checkIn ? new Date(rec.checkIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {rec.checkOut ? new Date(rec.checkOut).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </td>
                    <td className="px-4 py-3">{rec.workHours} hrs</td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className={METHOD_META[rec.method ?? "WEB"]?.cls ?? ""}>
                        {rec.method ? METHOD_META[rec.method]?.label ?? rec.method : "Web"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          rec.status === "PRESENT"
                            ? "default"
                            : rec.status === "LATE"
                            ? "outline"
                            : "secondary"
                        }
                      >
                        {rec.status}
                      </Badge>
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

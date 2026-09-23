"use client";

import { useQuery } from "@tanstack/react-query";
import { User } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api/client";
import { slugToTitle } from "@/lib/utils";

interface AuditLog {
  id: string;
  createdAt: string;
  user?: { name?: string };
  action: string;
  entity: string;
  entityId?: string;
  ipAddress?: string;
}

export default function AuditLogsPage() {
  const { data: logsData } = useQuery({
    queryKey: ["auditLogsList"],
    queryFn: async () => api.get<{ items: AuditLog[]; meta: unknown }>("/api/v1/audit-logs?limit=50"),
  });

  const logs = logsData?.items ?? [];

  return (
    <div className="page-container space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Immutable Security Audit Trail"
        description="Immutable logs tracking user actions, logins, salary modifications, leave approvals, and role updates."
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Actor / User</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Target Entity</th>
                <th className="px-4 py-3">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                    {new Date(l.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {l.user?.name ? (
                      <span className="flex items-center gap-1.5">
                        <User className="size-3 text-muted-foreground" />
                        {l.user.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">System Admin</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="font-mono text-[11px]">{l.action}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-semibold">{slugToTitle(l.entity)}</span>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{l.ipAddress ?? "127.0.0.1"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

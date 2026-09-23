"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api/client";
import { useSession } from "@/lib/auth/session";
import { P } from "@/lib/permissions";
import type { ListResult } from "@/lib/types";

interface OrgNode {
  id: string;
  title: string;
  name: string;
  code: string;
  department: string;
  children?: OrgNode[];
}

interface EmpRow {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  status: string;
  department: { name: string } | null;
  designation: { title: string } | null;
  managerId: string | null;
}

export default function OrgChartPage() {
  const { hasPermission } = useSession();

  const { data, isPending, isError } = useQuery({
    queryKey: ["orgChart"],
    queryFn: async () =>
      api.get<ListResult<EmpRow>>("/api/v1/employees?limit=100&page=1"),
    enabled: hasPermission(P.employeesView),
  });

  const tree = useMemo<OrgNode[]>(() => {
    const rows = (data?.items ?? []).filter((e) => ["ACTIVE", "ON_LEAVE"].includes(e.status));
    const byId = new Map<string, OrgNode>();
    for (const e of rows) {
      byId.set(e.id, {
        id: e.id,
        title: e.designation?.title ?? "Employee",
        name: `${e.firstName} ${e.lastName}`,
        code: e.employeeCode,
        department: e.department?.name ?? "—",
        children: [],
      });
    }
    const roots: OrgNode[] = [];
    for (const e of rows) {
      const node = byId.get(e.id)!;
      const parent = e.managerId ? byId.get(e.managerId) : undefined;
      if (parent && parent !== node) {
        parent.children!.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }, [data]);

  if (isPending) {
    return (
      <div className="page-container space-y-6">
        <PageHeader eyebrow="Organization" title="Interactive Organizational Hierarchy" description="Visual reporting tree showing company leadership, department managers, and employee reporting relationships." />
        <p className="text-sm text-muted-foreground">Loading organization tree...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="page-container space-y-6">
        <PageHeader eyebrow="Organization" title="Interactive Organizational Hierarchy" description="Visual reporting tree showing company leadership, department managers, and employee reporting relationships." />
        <p className="text-sm text-destructive">Couldn&apos;t load the organization chart.</p>
      </div>
    );
  }

  return (
    <div className="page-container space-y-6">
      <PageHeader
        eyebrow="Organization"
        title="Interactive Organizational Hierarchy"
        description="Visual reporting tree showing company leadership, department managers, and employee reporting relationships."
      />

      {tree.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <p className="font-semibold text-foreground">No reporting relationships found</p>
          <p className="text-xs">Assign managers to employees to populate the organization chart.</p>
        </Card>
      ) : (
        <div className="p-6 border rounded-xl bg-card overflow-x-auto">
          <div className="flex flex-col items-center space-y-6 min-w-[720px]">
            {tree.map((root) => (
              <TreeBranch key={root.id} node={root} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TreeBranch({ node, isRoot = true }: { node: OrgNode; isRoot?: boolean }) {
  const hasChildren = (node.children?.length ?? 0) > 0;
  return (
    <div className="flex flex-col items-center">
      <NodeCard node={node} isRoot={isRoot} hasChildren={hasChildren} />
      {hasChildren && (
        <>
          <div className="w-0.5 h-6 bg-border" />
          <div className="flex gap-4 items-start justify-center">
            {node.children!.map((child) => (
              <div key={child.id} className="flex flex-col items-center">
                <TreeBranch node={child} isRoot={false} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function NodeCard({ node, isRoot, hasChildren }: { node: OrgNode; isRoot: boolean; hasChildren: boolean }) {
  return (
    <Card
      className={`p-3.5 text-center shadow-sm border hover:border-primary/50 transition-all ${
        isRoot
          ? "w-64 bg-primary/5 border-primary/30"
          : hasChildren
            ? "w-56"
            : "w-48 text-xs"
      }`}
    >
      <div className="flex flex-col items-center space-y-1">
        <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
          {node.name.charAt(0)}
        </div>
        <p className="font-bold text-sm tracking-tight text-foreground">{node.name}</p>
        <p className="text-xs text-primary font-medium">{node.title}</p>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground pt-1">
          <Badge variant="outline" className="text-[10px] font-mono">
            {node.code}
          </Badge>
          <span>• {node.department}</span>
        </div>
      </div>
    </Card>
  );
}
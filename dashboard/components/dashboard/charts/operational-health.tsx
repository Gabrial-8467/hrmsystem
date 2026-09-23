"use client";

import { Activity } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CHART_COLORS, MiniDonut } from "./shared";

function toSlices(record: Record<string, number>, colorMap: Record<string, string>) {
  return Object.entries(record ?? {})
    .map(([status, count]) => ({
      label: status
        .split("_")
        .map((w) => w[0]?.toUpperCase() + w.slice(1).toLowerCase())
        .join(" "),
      count,
      color:
        colorMap[status] ??
        colorMap[Object.keys(colorMap).find((k) => k.toLowerCase() === status.toLowerCase()) ?? ""] ??
        "#94a3b8",
    }))
    .filter((s) => s.count > 0);
}

const LEAVE_COLORS: Record<string, string> = {
  PENDING: CHART_COLORS.PENDING,
  APPROVED: CHART_COLORS.APPROVED,
  REJECTED: CHART_COLORS.REJECTED,
  CANCELLED: CHART_COLORS.CANCELLED,
};

const ASSET_COLORS: Record<string, string> = {
  AVAILABLE: "#3b82f6",
  ASSIGNED: "#10b981",
  UNDER_MAINTENANCE: "#f59e0b",
  RETIRED: "#94a3b8",
};

const EXPENSE_COLORS: Record<string, string> = {
  SUBMITTED: "#38bdf8",
  DRAFT: "#94a3b8",
  APPROVED: "#f59e0b",
  REJECTED: "#f43f5e",
  PAID: "#10b981",
};

export function OperationalHealthCard({
  leaveStatus,
  assetBreakdown,
  expenseBreakdown,
}: {
  leaveStatus: Record<string, number>;
  assetBreakdown: Record<string, number>;
  expenseBreakdown: Record<string, { count: number; amount: number }>;
}) {
  const expenseSlices = Object.entries(expenseBreakdown ?? {})
    .map(([status, v]) => ({
      label: status
        .split("_")
        .map((w) => w[0]?.toUpperCase() + w.slice(1).toLowerCase())
        .join(" "),
      count: v.count,
      color: EXPENSE_COLORS[status] ?? "#94a3b8",
    }))
    .filter((s) => s.count > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Activity className="size-4 text-primary" /> Operational Health
          </span>
          <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
            Live
          </span>
        </CardTitle>
        <CardDescription className="text-xs">
          Leave, assets & expense status at a glance
        </CardDescription>
      </CardHeader>
      <div className="px-6 pb-6 pt-2 space-y-6">
        <MiniDonut
          title="Leave requests"
          serie={toSlices(leaveStatus ?? {}, LEAVE_COLORS)}
          totalLabel="requests"
        />
        <div className="border-t border-border" />
        <MiniDonut
          title="Assets"
          serie={toSlices(assetBreakdown ?? {}, ASSET_COLORS)}
          totalLabel="assets"
        />
        <div className="border-t border-border" />
        <MiniDonut title="Expenses" serie={expenseSlices} totalLabel="expenses" />
      </div>
    </Card>
  );
}
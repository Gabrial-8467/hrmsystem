"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { StickyNote } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CHART_RESIZE_DEBOUNCE_MS, tooltipStyle } from "./shared";

const LEAVE_TYPE_COLORS = ["#8b5cf6", "#38bdf8", "#10b981", "#f59e0b", "#f43f5e", "#a855f7"];

export function LeaveUsageCard({
  leaveUsageByType,
}: {
  leaveUsageByType: { name: string; days: number; requests: number }[];
}) {
  const data = [...(leaveUsageByType ?? [])].sort((a, b) => b.days - a.days);
  const totalDays = data.reduce((s, d) => s + d.days, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <StickyNote className="size-4 text-primary" /> Leave Utilisation
          </span>
          <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
            {totalDays} days
          </span>
        </CardTitle>
        <CardDescription className="text-xs">Approved leave days by type</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="py-14 text-center text-xs text-muted-foreground">
            No approved leave recorded yet.
          </div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%" debounce={CHART_RESIZE_DEBOUNCE_MS}>
              <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  axisLine={false}
                  tickLine={false}
                  width={96}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                />
                <Tooltip
                  cursor={{ fill: "var(--card)", opacity: 0.6 }}
                  contentStyle={tooltipStyle}
                  formatter={(value, name) =>
                    name === "days" ? [`${Number(value) || 0} days`, "Used"] : [value, name]
                  }
                />
                <Bar
                  dataKey="days"
                  radius={[0, 5, 5, 0]}
                  maxBarSize={18}
                  isAnimationActive
                >
                  {data.map((d, idx) => (
                    <Cell
                      key={d.name}
                      fill={LEAVE_TYPE_COLORS[idx % LEAVE_TYPE_COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
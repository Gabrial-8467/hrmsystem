"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CHART_RESIZE_DEBOUNCE_MS, tooltipStyle } from "./shared";

export function HiringTrendCard({
  hiringTrend,
  totalHires,
}: {
  hiringTrend: { month: string; count: number }[];
  totalHires: number;
}) {
  const data = [...(hiringTrend ?? [])];
  const peak = Math.max(1, ...data.map((d) => d.count));

  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <TrendingUp className="size-4 text-primary" /> Hiring Trend
          </span>
          <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
            {totalHires} joined · 6 mo
          </span>
        </CardTitle>
        <CardDescription className="text-xs">Monthly headcount growth from new hires</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 || data.every((d) => d.count === 0) ? (
          <div className="py-14 text-center text-xs text-muted-foreground">No new hires recorded.</div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%" debounce={CHART_RESIZE_DEBOUNCE_MS}>
              <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -22 }}>
                <defs>
                  <linearGradient id="hiringFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  dy={4}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  domain={[0, Math.max(peak + 1, 4)]}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fill="url(#hiringFill)"
                  dot={{ r: 3, fill: "#10b981", strokeWidth: 0 }}
                  isAnimationActive
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
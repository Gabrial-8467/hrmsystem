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
import { Clock3 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CHART_COLORS, CHART_RESIZE_DEBOUNCE_MS, tooltipStyle } from "./shared";

export function WorkHoursTrendCard({
  workHoursTrend,
}: {
  workHoursTrend: { month: string; hours: number }[];
}) {
  const data = [...(workHoursTrend ?? [])].slice(-6);
  const totalHours = data.reduce((sum, d) => sum + (d.hours ?? 0), 0);
  const avg = data.length > 0 ? Math.round(totalHours / data.length / 100) / 10 : 0;

  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Clock3 className="size-4 text-primary" /> Work Hours Trend
          </span>
          <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
            Last 6 months
          </span>
        </CardTitle>
        <CardDescription className="text-xs">
          {data.length > 0
            ? `${totalHours.toLocaleString()} hrs logged · ~${avg}k hrs/month`
            : "Monthly tracked work hours"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="py-14 text-center text-xs text-muted-foreground">
            No work-hour data available.
          </div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%" debounce={CHART_RESIZE_DEBOUNCE_MS}>
              <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="workHoursFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS.PRESENT} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={CHART_COLORS.PRESENT} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  dy={4}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  tickFormatter={(value) => `${Math.round(value / 1000)}k`}
                />
                <Tooltip
                  cursor={{ stroke: "var(--border)" }}
                  contentStyle={tooltipStyle}
                  formatter={(value, name) => [
                    `${Number(value).toLocaleString()} hrs`,
                    name,
                  ]}
                  labelFormatter={(label) => `Month: ${label}`}
                />
                <Area
                  type="monotone"
                  dataKey="hours"
                  name="Work Hours"
                  stroke={CHART_COLORS.PRESENT}
                  strokeWidth={2}
                  fill="url(#workHoursFill)"
                  dot={{ r: 3, strokeWidth: 0, fill: CHART_COLORS.PRESENT }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
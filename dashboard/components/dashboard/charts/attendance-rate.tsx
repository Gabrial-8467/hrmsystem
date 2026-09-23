"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Landmark } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CHART_COLORS, CHART_RESIZE_DEBOUNCE_MS, tooltipStyle } from "./shared";

export function AttendanceRateCard({
  attendanceRateByDept,
}: {
  attendanceRateByDept: { name: string; rate: number }[];
}) {
  const data = [...(attendanceRateByDept ?? [])].sort((a, b) => b.rate - a.rate);
  const avg =
    data.length > 0 ? Math.round(data.reduce((sum, d) => sum + d.rate, 0) / data.length) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Landmark className="size-4 text-primary" /> Department Attendance
          </span>
          <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
            {avg}% avg
          </span>
        </CardTitle>
        <CardDescription className="text-xs">
          Average daily presence rate by department (last 7 days)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="py-14 text-center text-xs text-muted-foreground">
            No attendance data yet.
          </div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%" debounce={CHART_RESIZE_DEBOUNCE_MS}>
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 0, right: 24, bottom: 0, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis
                  type="number"
                  unit="%"
                  domain={[0, 100]}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={88}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                />
                <Tooltip
                  cursor={{ fill: "var(--card)", opacity: 0.6 }}
                  contentStyle={tooltipStyle}
                  formatter={(value, name) => [`${Number(value)}%`, name]}
                />
                <Bar dataKey="rate" name="Attendance" radius={[0, 4, 4, 0]} maxBarSize={16}>
                  {data.map((item) => (
                    <Cell
                      key={item.name}
                      fill={
                        item.rate >= 90
                          ? CHART_COLORS.PRESENT
                          : item.rate >= 75
                            ? CHART_COLORS.WORK_FROM_HOME
                            : CHART_COLORS.ABSENT
                      }
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
"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarDays } from "lucide-react";
import { format } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CHART_COLORS, CHART_RESIZE_DEBOUNCE_MS, tooltipStyle } from "./shared";

type TrendItem = {
  date: string;
  present: number;
  late: number;
  workFromHome: number;
  absent: number;
};

const TREND_KEY: (keyof Omit<TrendItem, "date">)[] = [
  "workFromHome",
  "late",
  "absent",
  "present",
];

const TREND_LABEL: Record<keyof Omit<TrendItem, "date">, string> = {
  workFromHome: "Work From Home",
  late: "Late",
  absent: "Absent",
  present: "Present",
};

const TREND_COLOR: Record<keyof Omit<TrendItem, "date">, string> = {
  workFromHome: CHART_COLORS.WORK_FROM_HOME,
  late: CHART_COLORS.LATE,
  absent: CHART_COLORS.ABSENT,
  present: CHART_COLORS.PRESENT,
};

export function AttendanceTrendCard({ attendanceTrend }: { attendanceTrend: TrendItem[] }) {
  const data = [...(attendanceTrend ?? [])].slice(-7).map((d) => ({
    ...d,
    label: format(new Date(d.date), "EEE"),
  }));

  const last = data[data.length - 1];
  const totalAttendance = data.reduce(
    (sum, d) => sum + (d.present ?? 0) + (d.late ?? 0) + (d.workFromHome ?? 0),
    0,
  );
  const presentCount = data.reduce((sum, d) => sum + (d.present ?? 0), 0);
  const avgPresent = data.length > 0 ? Math.round(presentCount / data.length) : 0;

  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CalendarDays className="size-4 text-primary" /> Attendance Trend
          </span>
          <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
            Last 7 days
          </span>
        </CardTitle>
        <CardDescription className="text-xs">
          {last
            ? `${format(new Date(last.date), "EEE, MMM d")} · ${totalAttendance} attendance events`
            : "Daily attendance breakdown"}
          {data.length > 0 ? ` · ~${avgPresent} present/day` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="py-14 text-center text-xs text-muted-foreground">
            No attendance records in the last 7 days.
          </div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%" debounce={CHART_RESIZE_DEBOUNCE_MS}>
              <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -22 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  dy={4}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                />
                <Tooltip
                  cursor={{ fill: "var(--card)", opacity: 0.6 }}
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => `Day: ${label}`}
                />
                {TREND_KEY.map((key, idx) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    name={TREND_LABEL[key]}
                    stackId="attendance"
                    fill={TREND_COLOR[key]}
                    radius={idx === TREND_KEY.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                    maxBarSize={34}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
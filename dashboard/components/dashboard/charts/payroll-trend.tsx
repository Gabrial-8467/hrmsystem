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
import { Receipt } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CHART_COLORS, CHART_RESIZE_DEBOUNCE_MS, formatMoney, shortMoney, tooltipStyle } from "./shared";

type PayrollTrendItem = {
  period: string;
  year: number;
  status: string;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
};

export function PayrollTrendCard({
  payrollTrend,
  symbol,
}: {
  payrollTrend: PayrollTrendItem[];
  symbol: string;
}) {
  const data = [...(payrollTrend ?? [])]
    .sort((a, b) => a.year - b.year || a.period.localeCompare(b.period))
    .slice(-6);

  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Receipt className="size-4 text-primary" /> Payroll Trend
          </span>
          <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
            Gross vs Net
          </span>
        </CardTitle>
        <CardDescription className="text-xs">Last {data.length} payroll runs</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="py-14 text-center text-xs text-muted-foreground">
            No payroll runs recorded yet.
          </div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%" debounce={CHART_RESIZE_DEBOUNCE_MS}>
              <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="gGross" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS.SUBMITTED} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={CHART_COLORS.SUBMITTED} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gNet" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="period"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  dy={4}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  tickFormatter={(v: number) => shortMoney(v, symbol)}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, name) => [
                    formatMoney(Number(value) || 0, symbol),
                    name === "totalGross" ? "Gross payroll" : "Net payroll",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="totalGross"
                  stroke={CHART_COLORS.SUBMITTED}
                  strokeWidth={2.5}
                  fill="url(#gGross)"
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="totalNet"
                  stroke="#8b5cf6"
                  strokeWidth={2.5}
                  fill="url(#gNet)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
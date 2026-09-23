"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Receipt } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CHART_RESIZE_DEBOUNCE_MS, formatMoney, shortMoney, tooltipStyle } from "./shared";

const CATEGORY_COLORS = [
  "#38bdf8",
  "#f59e0b",
  "#8b5cf6",
  "#f43f5e",
  "#10b981",
  "#94a3b8",
  "#6366f1",
];

export function ExpenseCategoriesCard({
  expenseCategories,
  symbol,
}: {
  expenseCategories: { category: string; count: number; amount: number }[];
  symbol: string;
}) {
  const data = [...(expenseCategories ?? [])].sort((a, b) => b.amount - a.amount);
  const total = data.reduce((s, d) => s + d.amount, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Receipt className="size-4 text-primary" /> Expenses by Category
          </span>
          <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
            {formatMoney(total, symbol)} total
          </span>
        </CardTitle>
        <CardDescription className="text-xs">Total spend grouped by expense category</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="py-14 text-center text-xs text-muted-foreground">
            No expenses recorded yet.
          </div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%" debounce={CHART_RESIZE_DEBOUNCE_MS}>
              <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  tickFormatter={(v: number) => shortMoney(v, symbol)}
                />
                <YAxis
                  dataKey="category"
                  type="category"
                  axisLine={false}
                  tickLine={false}
                  width={92}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                />
                <Tooltip
                  cursor={{ fill: "var(--card)", opacity: 0.6 }}
                  contentStyle={tooltipStyle}
                  formatter={(value) => [formatMoney(Number(value) || 0, symbol), "Spend"]}
                />
                <Bar dataKey="amount" radius={[0, 5, 5, 0]} maxBarSize={18} isAnimationActive>
                  {data.map((d, idx) => (
                    <Cell key={d.category} fill={CATEGORY_COLORS[idx % CATEGORY_COLORS.length]} />
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
"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Briefcase } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CHART_RESIZE_DEBOUNCE_MS } from "./shared";

const MIX_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#38bdf8"];

export function EmploymentMixCard({
  employmentMix,
}: {
  employmentMix: { type: string; label: string; count: number }[];
}) {
  const data = [...(employmentMix ?? [])];
  const total = data.reduce((s, d) => s + d.count, 0);
  const fullTime = data.find((d) => d.type === "FULL_TIME")?.count ?? 0;
  const fullTimePct = total > 0 ? Math.round((fullTime / total) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Briefcase className="size-4 text-primary" /> Employment Mix
          </span>
          <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
            {total} employees
          </span>
        </CardTitle>
        <CardDescription className="text-xs">Workforce composition by employment type</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="py-14 text-center text-xs text-muted-foreground">No headcount data.</div>
        ) : (
          <>
            <div className="relative mx-auto h-32 w-32">
              <ResponsiveContainer width="100%" height="100%" debounce={CHART_RESIZE_DEBOUNCE_MS}>
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="count"
                    nameKey="label"
                    innerRadius={42}
                    outerRadius={58}
                    paddingAngle={3}
                    cornerRadius={5}
                    strokeWidth={0}
                    isAnimationActive
                  >
                    {data.map((item, idx) => (
                      <Cell key={item.label} fill={MIX_COLORS[idx % MIX_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-extrabold tracking-tight text-foreground">
                  {fullTimePct}%
                </span>
                <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                  Full-time
                </span>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {data.map((item, idx) => (
                <div key={item.label} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: MIX_COLORS[idx % MIX_COLORS.length] }}
                    />
                    <span className="truncate capitalize text-muted-foreground">
                      {item.label.toLowerCase()}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums text-foreground">{item.count}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
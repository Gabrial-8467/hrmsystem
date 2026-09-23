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
import { UserPlus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FUNNEL_COLORS, CHART_RESIZE_DEBOUNCE_MS, tooltipStyle } from "./shared";

const CANDIDATE_STAGES = ["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "HIRED", "REJECTED"];

export function RecruitmentFunnelCard({
  recruitmentFunnel,
}: {
  recruitmentFunnel: Record<string, number>;
}) {
  const data = CANDIDATE_STAGES.map((stage, idx) => ({
    stage: stage.charAt(0) + stage.slice(1).toLowerCase(),
    count: recruitmentFunnel?.[stage] ?? 0,
    color: FUNNEL_COLORS[idx % FUNNEL_COLORS.length],
  })).filter((d) => d.count > 0);

  const totalCandidates = data.reduce((s, d) => s + d.count, 0);
  const hires = recruitmentFunnel?.HIRED ?? 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <UserPlus className="size-4 text-primary" /> Recruitment Pipeline
          </span>
          <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
            {totalCandidates} in pipeline
          </span>
        </CardTitle>
        <CardDescription className="text-xs">
          Candidate volume by stage · {hires} hired
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="py-14 text-center text-xs text-muted-foreground">
            No candidates in the pipeline yet.
          </div>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%" debounce={CHART_RESIZE_DEBOUNCE_MS}>
              <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -22 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="stage"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  interval={0}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                />
                <Tooltip cursor={{ fill: "var(--card)", opacity: 0.6 }} contentStyle={tooltipStyle} />
                <Bar dataKey="count" radius={[5, 5, 0, 0]} maxBarSize={38} isAnimationActive>
                  {data.map((d) => (
                    <Cell key={d.stage} fill={d.color} />
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
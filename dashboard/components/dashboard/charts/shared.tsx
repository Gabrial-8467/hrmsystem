"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { ArrowUpRight, Building2, MapPin } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Master palette shared by every dashboard chart. */
export const CHART_COLORS: Record<string, string> = {
  // Attendance statuses
  PRESENT: "#10b981",
  LATE: "#a855f7",
  WORK_FROM_HOME: "#3b82f6",
  ABSENT: "#f43f5e",
  // Leave statuses
  PENDING: "#f59e0b",
  APPROVED: "#10b981",
  REJECTED: "#f43f5e",
  CANCELLED: "#94a3b8",
  // Asset statuses
  AVAILABLE: "#3b82f6",
  ASSIGNED: "#10b981",
  UNDER_MAINTENANCE: "#f59e0b",
  RETIRED: "#94a3b8",
  // Expense statuses
  SUBMITTED: "#38bdf8",
  DRAFT: "#94a3b8",
  PAID: "#10b981",
};

/** Debounce for ResponsiveContainer so resize-driven re-renders never fire during
 *  the 200ms sidebar animation — they only run once the layout has settled. */
export const CHART_RESIZE_DEBOUNCE_MS = 300;

export const FUNNEL_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#94a3b8",
];

export const tooltipStyle = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 12,
  boxShadow: "0 8px 24px rgb(0 0 0 / 0.08)",
} as const;

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  AED: "د.إ",
  SGD: "S$",
  AUD: "A$",
};

export function currencySymbol(code: string | undefined): string {
  return CURRENCY_SYMBOLS[code ?? ""] ?? "$";
}

export function formatMoney(value: number, symbol = "$"): string {
  return `${symbol}${Math.round(value).toLocaleString()}`;
}

export function shortMoney(value: number, symbol = "$"): string {
  const abs = Math.abs(Math.round(value));
  if (abs >= 1_000_000) return `${symbol}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${symbol}${Math.round(abs / 1000)}k`;
  return `${symbol}${abs}`;
}

export interface DonutSlice {
  label: string;
  count: number;
  color: string;
  percent: number;
}

/** Large donut with center value and a legend listing counts + percents. */
export function DonutCard({
  title,
  subtitle,
  serie,
  centerValue,
  centerLabel,
  emptyText,
  badge = "Live",
}: {
  title: string;
  subtitle: string;
  serie: DonutSlice[];
  centerValue: number;
  centerLabel: string;
  emptyText: string;
  badge?: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center justify-between">
          <span>{title}</span>
          {badge && (
            <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
              {badge}
            </span>
          )}
        </CardTitle>
        <CardDescription className="text-xs">{subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {serie.length === 0 ? (
          <div className="py-10 text-center text-xs text-muted-foreground">{emptyText}</div>
        ) : (
          <>
            <div className="relative mx-auto h-52 w-52">
              <ResponsiveContainer width="100%" height="100%" debounce={CHART_RESIZE_DEBOUNCE_MS}>
                <PieChart>
                  <Pie
                    data={serie}
                    dataKey="count"
                    nameKey="label"
                    innerRadius={68}
                    outerRadius={94}
                    paddingAngle={3}
                    cornerRadius={6}
                    strokeWidth={0}
                    isAnimationActive
                  >
                    {serie.map((item) => (
                      <Cell key={item.label} fill={item.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-extrabold tracking-tight text-foreground">
                  {centerValue}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {centerLabel}
                </span>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              {serie.map((item) => (
                <div key={item.label} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-muted-foreground">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{item.count}</span>
                    <span className="w-9 text-right text-[10px] text-muted-foreground">
                      {item.percent}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Compact donut with a small header row and left-aligned ring. */
export function MiniDonut({
  title,
  serie,
  totalLabel,
}: {
  title: string;
  serie: { label: string; count: number; color: string }[];
  totalLabel: string;
}) {
  const total = serie.reduce((s, x) => s + x.count, 0);
  const top = [...serie].sort((a, b) => b.count - a.count).slice(0, 3);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <span className="text-xs text-muted-foreground">
          {total} {totalLabel}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative size-24 shrink-0">
          <ResponsiveContainer width="100%" height="100%" debounce={CHART_RESIZE_DEBOUNCE_MS}>
            <PieChart>
              <Pie
                data={serie}
                dataKey="count"
                nameKey="label"
                innerRadius={30}
                outerRadius={45}
                paddingAngle={2}
                cornerRadius={5}
                strokeWidth={0}
              >
                {serie.map((s) => (
                  <Cell key={s.label} fill={s.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-base font-extrabold text-foreground">{total}</span>
          </div>
        </div>
        <div className="flex-1 space-y-2 min-w-0">
          {(top.length > 0 ? top : [{ label: "No data", count: 0, color: "#94a3b8" }]).map((item) => (
            <div key={item.label} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 truncate text-muted-foreground">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="truncate">{item.label}</span>
              </span>
              <span className="ml-2 font-semibold tabular-nums text-foreground">{item.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export interface HeadcountRow {
  name: string;
  count: number;
  caption?: string | null;
}

export const HEADCOUNT_GRADIENTS = [
  "bg-gradient-to-r from-primary to-indigo-500",
  "bg-gradient-to-r from-emerald-500 to-teal-400",
  "bg-gradient-to-r from-sky-500 to-cyan-400",
  "bg-gradient-to-r from-amber-500 to-orange-400",
  "bg-gradient-to-r from-fuchsia-500 to-pink-400",
  "bg-gradient-to-r from-violet-500 to-purple-400",
];

/** Headcount distribution rendered as named progress bars. */
export function HeadcountCard({
  title,
  subtitle,
  rows,
  cap,
  href,
}: {
  title: string;
  subtitle: string;
  rows: HeadcountRow[];
  cap: number;
  href?: string;
}) {
  const icon =
    title.toLowerCase().includes("branch") ? (
      <MapPin className="size-3.5 text-muted-foreground" />
    ) : (
      <Building2 className="size-3.5 text-muted-foreground" />
    );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
          <CardDescription className="text-xs">{subtitle}</CardDescription>
        </div>
        {href && (
          <Link
            href={href}
            className="text-xs font-medium text-primary hover:underline flex items-center gap-1 shrink-0"
          >
            View <ArrowUpRight className="size-3" />
          </Link>
        )}
      </CardHeader>
      <CardContent className="space-y-4 pt-1">
        {rows.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">No data yet.</div>
        ) : (
          rows.map((row, idx) => {
            const width = cap > 0 ? Math.min(100, (row.count / cap) * 100 * 3.5) : 0;
            return (
              <div key={row.name} className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <span className="flex items-center gap-2 min-w-0">
                    {icon}
                    <span className="truncate">{row.name}</span>
                  </span>
                  <span className="font-semibold text-foreground shrink-0">
                    {row.count} {row.caption ? `· ${row.caption}` : ""}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-700",
                      HEADCOUNT_GRADIENTS[idx % HEADCOUNT_GRADIENTS.length],
                    )}
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

/** Vertical pill-section heading used between dashboard sections. */
export function SectionHeading({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-2.5 text-left">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </span>
      <div>
        <h2 className="text-lg font-bold tracking-tight text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}
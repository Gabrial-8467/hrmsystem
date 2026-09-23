"use client";

import { useEffect, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { CHART_RESIZE_DEBOUNCE_MS } from "./shared";
import { cn } from "@/lib/utils";

function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

function sparkId(label: string) {
  return `kpi-spark-${label.replace(/[^a-zA-Z0-9]/g, "")}`;
}

export function KpiCard({
  label,
  value,
  icon,
  chip,
  caption,
  delta,
  currency = false,
  currencySymbol = "$",
  suffix = "",
  glow,
  sparkline,
  sparkColor,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  chip: string;
  caption?: string;
  delta?: { text: string; up: boolean };
  currency?: boolean;
  currencySymbol?: string;
  suffix?: string;
  glow?: string;
  sparkline?: number[];
  sparkColor?: string;
}) {
  const animated = useCountUp(value);
  const display = currency
    ? `${currencySymbol}${animated.toLocaleString()}`
    : `${animated.toLocaleString()}${suffix}`;

  const vals = (sparkline ?? []).filter((v) => Number.isFinite(v));
  const meaningful = vals.length >= 2 && new Set(vals).size > 1 && sparkColor;
  const sparkData = vals.map((v, i) => ({ i, v }));

  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);
  const pad = meaningful ? (maxVal - minVal) * 0.2 || Math.max(1, Math.abs(maxVal) * 0.06) : 0;
  const domain: [number, number] = meaningful
    ? [minVal - pad, maxVal + pad]
    : [0, 1];

  const gradId = sparkId(label);

  return (
    <Card
      className={cn(
        "group relative overflow-hidden hover:-translate-y-0.5 transition-all duration-300 hover:shadow-lg",
        glow,
      )}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 group-hover:opacity-100"
      />
      <CardContent className="p-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
              {display}
            </p>
            {delta ? (
              <p
                className={cn(
                  "text-[11px] font-medium flex items-center gap-1",
                  delta.up ? "text-emerald-600" : "text-amber-600",
                )}
              >
                {delta.up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                {delta.text}
              </p>
            ) : caption ? (
              <p className="text-[11px] text-muted-foreground font-medium truncate">{caption}</p>
            ) : null}
          </div>
          <span
            className={cn(
              "flex size-11 items-center justify-center rounded-xl text-white shadow-md shrink-0 bg-gradient-to-br",
              chip,
            )}
          >
            {icon}
          </span>
        </div>
      </CardContent>

      {meaningful ? (
        <div className="relative mx-5 h-10 border-t border-border/60">
          <ResponsiveContainer width="100%" height="100%" debounce={CHART_RESIZE_DEBOUNCE_MS}>
            <AreaChart data={sparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={sparkColor} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={sparkColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <YAxis hide domain={domain} />
              <Area
                type="monotone"
                dataKey="v"
                stroke={sparkColor}
                strokeWidth={2}
                strokeLinecap="round"
                fill={`url(#${gradId})`}
                dot={false}
                activeDot={false}
                isAnimationActive
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mx-5 border-t border-border/60" />
      )}
    </Card>
  );
}
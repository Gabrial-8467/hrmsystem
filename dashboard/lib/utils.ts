import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugToTitle(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function formatDate(value: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", opts ?? { year: "numeric", month: "short", day: "numeric" }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function timeAgo(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  const units: [number, string][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.345, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];
  let amount = seconds;
  let unit = "second";
  for (const [div, name] of units) {
    if (amount < div) {
      unit = name;
      break;
    }
    amount /= div;
  }
  const rounded = Math.max(1, Math.floor(amount));
  return `${rounded} ${unit}${rounded > 1 ? "s" : ""} ago`;
}

export function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export function truncate(value: string, length = 24): string {
  return value.length > length ? value.slice(0, length - 1) + "…" : value;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, LayoutGrid, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS, type NavItem } from "@/components/layout/nav";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { APP_NAME } from "@/config/env";

export function Sidebar({
  collapsed,
  mobileOpen = false,
  onToggle,
  onCloseMobile,
}: {
  collapsed: boolean;
  mobileOpen?: boolean;
  onToggle: () => void;
  onCloseMobile?: () => void;
}) {
  const pathname = usePathname();
  const { user, orgName, hasPermission } = useSession();

  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(href);

  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (!item.permission) return true;
      const required = Array.isArray(item.permission) ? item.permission : [item.permission];
      return required.some((p) => hasPermission(p));
    }),
  })).filter((s) => s.items.length > 0);

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity"
        />
      )}

      <aside
        data-collapsed={collapsed}
        className={cn(
          "flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,translate] ease-out duration-200",
          "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-50",
          "lg:sticky lg:top-0 lg:h-dvh lg:self-start",
          collapsed ? "w-[var(--sidebar-width-collapsed)]" : "w-[var(--sidebar-width)]",
          // Mobile responsive positioning
          mobileOpen ? "translate-x-0 max-lg:w-[var(--sidebar-width)]" : "max-lg:-translate-x-full",
        )}
      >
        {/* Brand Header */}
        <div className="relative flex h-[var(--topbar-height)] shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-3">
          <Link
            href="/dashboard"
            onClick={onCloseMobile}
            className={cn("flex min-w-0 items-center gap-2.5 overflow-hidden", collapsed && "flex-1 justify-center")}
            aria-label={`${APP_NAME} home`}
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <LayoutGrid className="size-4" aria-hidden />
            </span>
            {!collapsed ? (
              <span className="truncate text-sm font-bold tracking-tight">{APP_NAME}</span>
            ) : null}
          </Link>

          {/* Desktop collapse toggle (kept out of flow in both states so the
              brand row never re-lays-out during the width animation) */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "absolute top-1/2 hidden size-6 shrink-0 -translate-y-1/2 text-sidebar-muted hover:text-sidebar-foreground lg:inline-flex",
              collapsed ? "right-0" : "right-3",
            )}
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronsLeft className={cn("size-4 rotate-0 transition-transform duration-200", collapsed && "rotate-180")} />
          </Button>

          {/* Mobile close button */}
          <Button
            variant="ghost"
            size="icon"
            className="inline-flex size-7 text-sidebar-muted hover:text-sidebar-foreground lg:hidden"
            onClick={onCloseMobile}
          >
            <X className="size-4" />
          </Button>
        </div>

        {/* Navigation Sections */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-4">
          {visibleSections.map((section) => (
            <div key={section.label} className="mb-5">
              {!collapsed ? (
                <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
                  {section.label}
                </p>
              ) : (
                <div className="mx-2 mb-2 border-t border-sidebar-border" />
              )}
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <SidebarItem
                    key={item.href}
                    item={item}
                    active={isActive(item.href)}
                    collapsed={collapsed}
                    onClickMobile={onCloseMobile}
                  />
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="shrink-0 border-t border-sidebar-border p-2.5">
          <div
            className={cn(
              "flex items-center gap-3 rounded-md px-2 py-1.5",
              collapsed && "justify-center px-0",
            )}
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-active text-sidebar-active-foreground text-xs font-semibold">
              {user ? user.firstName.charAt(0) : "?"}
            </span>
            {!collapsed ? (
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-sidebar-foreground">
                  {user ? `${user.firstName} ${user.lastName}` : "Signed out"}
                </p>
                <p className="truncate text-[11px] text-sidebar-muted">{orgName}</p>
              </div>
            ) : null}
          </div>
        </div>
      </aside>
    </>
  );
}

function SidebarItem({
  item,
  active,
  collapsed,
  onClickMobile,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onClickMobile?: () => void;
}) {
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      onClick={onClickMobile}
      className={cn(
        "group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
        "text-sidebar-foreground hover:bg-sidebar-active hover:text-sidebar-active-foreground",
        active && "bg-sidebar-active text-sidebar-active-foreground font-semibold",
        collapsed && "justify-center px-0",
      )}
      aria-current={active ? "page" : undefined}
    >
      <Icon className="size-4 shrink-0 text-sidebar-muted transition-colors group-hover:text-inherit" aria-hidden />
      {!collapsed ? (
        <span className="truncate">{item.label}</span>
      ) : null}
      {!collapsed && item.badge ? (
        <span className="ml-auto rounded-full bg-warning px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {item.badge}
        </span>
      ) : null}
      {active ? (
        <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" aria-hidden />
      ) : null}
    </Link>
  );

  if (collapsed) {
    return (
      <li>
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right" className="ml-2 font-medium">
            {item.label}
          </TooltipContent>
        </Tooltip>
      </li>
    );
  }

  return <li>{link}</li>;
}
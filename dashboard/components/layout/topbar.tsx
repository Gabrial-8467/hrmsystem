"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CheckCheck,
  ChevronDown,
  LogOut,
  Search,
  Settings,
  ShieldCheck,
  Menu,
  Sparkles,
} from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CommandPalette } from "@/components/shared/command-palette";
import { ThemeToggle } from "@/lib/theme";
import { api } from "@/lib/api/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const TYPE_BORDER: Record<string, string> = {
  SUCCESS: "border-emerald-500",
  ALERT: "border-rose-500",
  ACTION: "border-amber-500",
  INFO: "border-primary",
};

export function Topbar({
  onToggleMobileMenu,
}: {
  onToggleMobileMenu?: () => void;
}) {
  const { user, orgName, roleName, signOut } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: notifData } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () =>
      api.get<{ items: NotificationItem[]; unread: number; meta: unknown }>("/api/v1/notifications?limit=10"),
    refetchInterval: 60_000,
  });

  const notifications = notifData?.items ?? [];
  const unreadCount = notifData?.unread ?? 0;

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => api.patch(`/api/v1/notifications/${id}/read`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const readAllMutation = useMutation({
    mutationFn: async () => api.post("/api/v1/notifications/read-all", {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const openNotification = (item: NotificationItem) => {
    if (!item.isRead) markReadMutation.mutate(item.id);
    if (item.link) router.push(item.link);
  };

  const initials = user
    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
    : "?";

  const triggerCommandPalette = () => {
    const event = new KeyboardEvent("keydown", { key: "k", ctrlKey: true, metaKey: true });
    window.dispatchEvent(event);
  };

  return (
    <>
      <CommandPalette />
      <header className="sticky top-0 z-30 flex h-[var(--topbar-height)] items-center justify-between gap-3 border-b border-border bg-card px-3 sm:px-6">
        {/* Left Section: Mobile Menu Toggle & Global Search */}
        <div className="flex items-center gap-2 flex-1 min-w-0 max-w-xl">
          {/* Mobile Menu Hamburger */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleMobileMenu}
            className="size-8 text-muted-foreground hover:text-foreground lg:hidden shrink-0"
            aria-label="Toggle mobile menu"
          >
            <Menu className="size-5" />
          </Button>

          {/* Search Trigger - Desktop/Tablet View */}
          <button
            type="button"
            onClick={triggerCommandPalette}
            className="hidden sm:flex w-full max-w-md h-9 items-center justify-between px-3 text-xs text-muted-foreground rounded-lg border border-input bg-background/80 hover:bg-background hover:border-primary/50 transition-all shadow-sm group"
          >
            <span className="flex items-center gap-2">
              <Search className="size-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
              <span>Search employees, departments, commands...</span>
            </span>
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-90">
              <span className="text-xs">⌘</span>K
            </kbd>
          </button>

          {/* Search Trigger - Mobile Icon View */}
          <Button
            variant="ghost"
            size="icon"
            onClick={triggerCommandPalette}
            className="flex sm:hidden size-8 text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Search"
          >
            <Search className="size-4" />
          </Button>
        </div>

        {/* Right Section: Organization Badge, Theme Toggle, Notifications, User Profile */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Org Badge (Desktop) */}
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/5 border border-primary/10 text-xs text-primary font-medium">
            <Sparkles className="size-3.5" />
            <span className="truncate max-w-[140px]">{orgName || "Enterprise Organization"}</span>
          </div>

          {/* Theme Toggle Button */}
          <ThemeToggle />

          {/* Notifications Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative size-8 rounded-full" aria-label="Notifications">
                <Bell className="size-4" aria-hidden />
                {unreadCount > 0 && (
                  <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-destructive animate-pulse" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 p-0 overflow-hidden">
              <div className="p-3 bg-muted/40 border-b flex items-center justify-between">
                <DropdownMenuLabel className="p-0 font-semibold text-sm">Notifications</DropdownMenuLabel>
                {unreadCount > 0 ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">{unreadCount} New</Badge>
                    <button
                      type="button"
                      onClick={() => readAllMutation.mutate()}
                      className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
                    >
                      <CheckCheck className="size-3" /> Mark all read
                    </button>
                  </div>
                ) : (
                  <span className="text-[10px] text-muted-foreground">You&apos;re all caught up</span>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto p-2 space-y-1 text-xs">
                {notifications.length === 0 && (
                  <p className="px-3 py-6 text-center text-muted-foreground">No notifications yet.</p>
                )}
                {notifications.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openNotification(item)}
                    className="w-full text-left p-2.5 rounded-md hover:bg-muted/50 transition-colors cursor-pointer border-l-2 border-transparent"
                    style={{ borderColor: TYPE_BORDER[item.type] ?? undefined }}
                  >
                    <p className={`font-semibold text-foreground ${item.isRead ? "font-medium" : ""}`}>{item.title}</p>
                    <p className="text-muted-foreground mt-0.5 line-clamp-2">{item.message}</p>
                    <span className="text-[10px] text-muted-foreground mt-1 block">{timeAgo(item.createdAt)}</span>
                  </button>
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Profile Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-9 gap-2 px-1.5 rounded-full data-[state=open]:bg-muted">
                <Avatar className="size-7.5 border border-primary/20">
                  <AvatarFallback className="bg-primary text-primary-foreground font-bold text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden text-left leading-tight lg:block min-w-[90px]">
                  <p className="truncate text-xs font-semibold text-foreground">
                    {user ? `${user.firstName} ${user.lastName}` : "User"}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {roleName || "HR Admin"}
                  </p>
                </div>
                <ChevronDown className="hidden size-3.5 text-muted-foreground sm:block" aria-hidden />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-muted-foreground py-2">
                <span className="block truncate font-semibold text-foreground text-sm">{user ? `${user.firstName} ${user.lastName}` : "Admin"}</span>
                <span className="block truncate text-xs">{user?.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings className="size-4 mr-2" /> Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings/users">
                  <ShieldCheck className="size-4 mr-2 text-primary" /> Users & Permissions
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void signOut()} className="text-destructive focus:text-destructive">
                <LogOut className="size-4 mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
    </>
  );
}
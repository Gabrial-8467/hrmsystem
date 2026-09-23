"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Users,
  Building2,
  Fingerprint,
  CalendarDays,
  Wallet,
  UserPlus,
  TrendingUp,
  Receipt,
  Package,
  FolderOpen,
  Megaphone,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const navigationItems = [
    { label: "Dashboard", href: "/dashboard", icon: Search, group: "Navigation" },
    { label: "Employees Directory", href: "/employees", icon: Users, group: "People" },
    { label: "Departments", href: "/departments", icon: Building2, group: "People" },
    { label: "Org Hierarchy Chart", href: "/org-chart", icon: Users, group: "People" },
    { label: "Attendance Log", href: "/attendance", icon: Fingerprint, group: "Attendance" },
    { label: "Leave Requests", href: "/leave", icon: CalendarDays, group: "Leave" },
    { label: "Approval Center", href: "/approvals", icon: ShieldCheck, group: "Leave" },
    { label: "Payroll Cycles", href: "/payroll", icon: Wallet, group: "Payroll" },
    { label: "Payslips Directory", href: "/payroll/payslips", icon: Wallet, group: "Payroll" },
    { label: "Recruitment Jobs", href: "/recruitment/jobs", icon: UserPlus, group: "Recruitment" },
    { label: "Candidates Pipeline", href: "/recruitment/candidates", icon: UserPlus, group: "Recruitment" },
    { label: "Performance Goals", href: "/performance", icon: TrendingUp, group: "Operations" },
    { label: "Expense Claims", href: "/expenses", icon: Receipt, group: "Operations" },
    { label: "Company Assets", href: "/assets", icon: Package, group: "Operations" },
    { label: "Documents Repository", href: "/documents", icon: FolderOpen, group: "Operations" },
    { label: "Announcements", href: "/announcements", icon: Megaphone, group: "Operations" },
    { label: "Analytics & Reports", href: "/reports", icon: TrendingUp, group: "Insights" },
    { label: "Users & Roles RBAC", href: "/settings/users", icon: Settings, group: "Settings" },
    { label: "Audit Log Trail", href: "/settings/audit", icon: ShieldCheck, group: "Settings" },
  ];

  const filtered = navigationItems.filter(
    (item) =>
      item.label.toLowerCase().includes(search.toLowerCase()) ||
      item.group.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (href: string) => {
    setOpen(false);
    setSearch("");
    router.push(href);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 max-w-xl overflow-hidden shadow-2xl border">
        <div className="flex items-center border-b px-3 py-2.5">
          <Search className="size-4 text-muted-foreground mr-2.5 shrink-0" />
          <Input
            placeholder="Type a command or search employees, pages, payroll... (Ctrl + K)"
            className="border-0 focus-visible:ring-0 shadow-none h-8 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <Badge variant="outline" className="text-[10px] uppercase font-mono">
            ESC
          </Badge>
        </div>

        <div className="max-h-[320px] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No matching pages or commands found.</p>
          ) : (
            <div className="space-y-1">
              {filtered.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.href}
                    onClick={() => handleSelect(item.href)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm rounded-md hover:bg-muted/70 transition-colors text-left group"
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="size-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      <span className="font-medium">{item.label}</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded">
                      {item.group}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

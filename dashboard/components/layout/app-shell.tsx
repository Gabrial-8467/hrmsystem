"use client";

import { useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex min-h-dvh bg-background text-foreground">
        <Sidebar
          collapsed={sidebarCollapsed}
          mobileOpen={mobileMenuOpen}
          onToggle={() => setSidebarCollapsed((v) => !v)}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onToggleMobileMenu={() => setMobileMenuOpen((v) => !v)} />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}
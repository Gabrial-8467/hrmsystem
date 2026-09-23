"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PageLoader } from "@/components/ui/spinner";
import { useSession, useUser } from "@/lib/auth/session";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useSession();
  const user = useUser();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
    } else if (user?.mustChangePassword) {
      router.replace("/change-password");
    }
  }, [isLoading, isAuthenticated, user, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <PageLoader label="Loading your workspace…" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (user?.mustChangePassword) {
    return null;
  }

  return <AppShell>{children}</AppShell>;
}
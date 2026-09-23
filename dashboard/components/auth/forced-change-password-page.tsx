"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { ForcedChangePasswordForm } from "@/components/auth/forced-change-password-form";
import { PageLoader } from "@/components/ui/spinner";
import { useSession, useUser } from "@/lib/auth/session";
import { APP_NAME, APP_TAGLINE } from "@/config/env";
import { Button } from "@/components/ui/button";

export function ForcedChangePasswordPage() {
  const router = useRouter();
  const { isLoading } = useSession();
  const user = useUser();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    } else if (!isLoading && user && !user.mustChangePassword) {
      router.replace("/dashboard");
    }
  }, [isLoading, user, router]);

  if (isLoading) {
    return (
      <div className="login-grid flex min-h-dvh items-center justify-center bg-background p-4">
        <PageLoader label="Checking your session…" />
      </div>
    );
  }

  if (!user || !user.mustChangePassword) {
    return (
      <div className="login-grid flex min-h-dvh items-center justify-center bg-background p-4">
        <Button asChild>
          <Link href="/login">Go to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="login-grid flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-[26rem]">
        <div className="mb-6 flex items-center justify-center gap-2 text-foreground">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <LayoutGrid className="size-4" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-tight">{APP_NAME}</p>
            <p className="text-xs text-muted-foreground">{APP_TAGLINE}</p>
          </div>
        </div>
        <ForcedChangePasswordForm />
      </div>
    </div>
  );
}
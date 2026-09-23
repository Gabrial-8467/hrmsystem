import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = { title: "Set new password" };

export default function ResetPasswordPage() {
  return (
    <div className="login-grid flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-[26rem]">
        <Suspense>
          <ResetPasswordForm />
        </Suspense>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="login-grid flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-[26rem]">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
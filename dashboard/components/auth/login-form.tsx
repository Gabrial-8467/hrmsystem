"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Eye, EyeOff, LayoutGrid, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useSession } from "@/lib/auth/session";
import { errorMessage } from "@/lib/api/client";
import { APP_NAME, APP_TAGLINE } from "@/config/env";

const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional(),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn } = useSession();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", rememberMe: false },
  });

  const [rememberMe, setRememberMe] = useState(false);

  function getRedirectTarget(): string {
    const next = searchParams.get("next");
    // Only allow same-site absolute paths to prevent open redirects.
    if (next && next.startsWith("/") && !next.startsWith("//")) {
      return next;
    }
    return "/dashboard";
  }

  async function onSubmit(values: LoginValues) {
    try {
      await signIn(values.email, values.password, values.rememberMe ?? rememberMe);
      toast.success("Signed in successfully");
      router.push(getRedirectTarget());
      router.refresh();
    } catch (err) {
      toast.error("Sign in failed", { description: errorMessage(err) });
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
      {/* Brand */}
      <div className="mb-8 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <LayoutGrid className="size-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">{APP_NAME}</h1>
          <p className="text-xs text-muted-foreground">{APP_TAGLINE}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Work email</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              className="pl-9"
              aria-invalid={Boolean(errors.email)}
              {...register("email")}
            />
          </div>
          {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              className="pl-9 pr-10"
              aria-invalid={Boolean(errors.password)}
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {errors.password ? <p className="text-xs text-destructive">{errors.password.message}</p> : null}
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="rememberMe"
            checked={rememberMe}
            onCheckedChange={(checked) => setRememberMe(checked === true)}
          />
          <Label htmlFor="rememberMe" className="font-normal text-muted-foreground">
            Keep me signed in
          </Label>
        </div>

        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
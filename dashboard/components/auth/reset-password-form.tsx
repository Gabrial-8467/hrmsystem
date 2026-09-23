"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { KeyRound, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPassword } from "@/lib/api/auth";
import { errorMessage } from "@/lib/api/client";

const schema = z
  .object({
    password: z
      .string()
      .min(8, "At least 8 characters")
      .regex(/[A-Z]/, "Include an uppercase letter")
      .regex(/[a-z]/, "Include a lowercase letter")
      .regex(/[0-9]/, "Include a number")
      .regex(/[^A-Za-z0-9]/, "Include a symbol"),
    passwordConfirmation: z.string().min(1, "Confirm your password"),
  })
  .refine((v) => v.password === v.passwordConfirmation, {
    path: ["passwordConfirmation"],
    message: "Passwords do not match",
  });

type Values = z.infer<typeof schema>;

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", passwordConfirmation: "" },
  });

  useEffect(() => {
    if (!token) {
      toast.error("Missing reset token", {
        description: "Open the reset link from your email to continue.",
      });
    }
  }, [token]);

  async function onSubmit(values: Values) {
    try {
      await resetPassword(token, values.password);
      setDone(true);
      reset();
      toast.success("Password updated");
    } catch (err) {
      toast.error("Could not reset password", { description: errorMessage(err) });
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 shadow-[var(--shadow-card)] text-center">
        <KeyRound className="mx-auto mb-4 size-10 text-success" aria-hidden />
        <h1 className="text-lg font-semibold tracking-tight">Password updated</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your password has been changed. You can now sign in with your new password.
        </p>
        <Button asChild className="mt-6 w-full">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
      <div className="mb-8 text-center">
        <h1 className="text-lg font-semibold tracking-tight">Set a new password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a strong password you don&apos;t use elsewhere.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="password" type="password" autoComplete="new-password" className="pl-9" {...register("password")} />
          </div>
          {errors.password ? <p className="text-xs text-destructive">{errors.password.message}</p> : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="passwordConfirmation">Confirm password</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="passwordConfirmation" type="password" autoComplete="new-password" className="pl-9" {...register("passwordConfirmation")} />
          </div>
          {errors.passwordConfirmation ? (
            <p className="text-xs text-destructive">{errors.passwordConfirmation.message}</p>
          ) : null}
        </div>

        <Button type="submit" className="w-full" loading={isSubmitting} disabled={!token}>
          {isSubmitting ? "Updating…" : "Update password"}
        </Button>
      </form>
    </div>
  );
}
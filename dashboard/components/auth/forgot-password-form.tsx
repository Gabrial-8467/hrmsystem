"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { CheckCircle2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "@/lib/api/auth";
import { errorMessage } from "@/lib/api/client";
import { APP_NAME } from "@/config/env";

const schema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
});

type Values = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  async function onSubmit(values: Values) {
    try {
      // Always return success-wording to avoid user enumeration.
      await requestPasswordReset(values.email);
      setSent(true);
    } catch (err) {
      toast.error("Could not request reset", { description: errorMessage(err) });
    }
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 shadow-[var(--shadow-card)] text-center">
        <CheckCircle2 className="mx-auto mb-4 size-10 text-success" aria-hidden />
        <h1 className="text-lg font-semibold tracking-tight">Check your inbox</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          If an account exists for that address, we&apos;ve emailed you a reset link. The link expires
          in 30 minutes.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
      <div className="mb-8 text-center">
        <h1 className="text-lg font-semibold tracking-tight">Reset your password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter your {APP_NAME} work email and we&apos;ll send you a reset link.
        </p>
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

        <Button type="submit" className="w-full" loading={isSubmitting}>
          {isSubmitting ? "Sending…" : "Send reset link"}
        </Button>
      </form>
    </div>
  );
}
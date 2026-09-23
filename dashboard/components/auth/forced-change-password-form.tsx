"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword } from "@/lib/api/auth";
import { errorMessage } from "@/lib/api/client";
import { useSession } from "@/lib/auth/session";
import { useQueryClient } from "@tanstack/react-query";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
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

export function ForcedChangePasswordForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { signOut } = useSession();
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", password: "", passwordConfirmation: "" },
  });

  async function onSubmit(values: Values) {
    try {
      await changePassword(values.currentPassword, values.password);
      await queryClient.invalidateQueries({ queryKey: ["session", "me"] });
      await queryClient.refetchQueries({ queryKey: ["session", "me"] });
      toast.success("Password updated. You can now use the app.");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      if (errorMessage(err).includes("Current password")) {
        setError("currentPassword", { message: "Current password is incorrect" });
      }
      toast.error("Could not update password", { description: errorMessage(err) });
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
      <div className="mb-8 text-center">
        <span className="mx-auto mb-4 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <KeyRound className="size-5" aria-hidden />
        </span>
        <h1 className="text-lg font-semibold tracking-tight">Set a new password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          For security, you must change the temporary password before continuing.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="currentPassword">Current password</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id="currentPassword"
              type={showCurrent ? "text" : "password"}
              autoComplete="current-password"
              className="pl-9 pr-10"
              aria-invalid={Boolean(errors.currentPassword)}
              {...register("currentPassword")}
            />
            <button
              type="button"
              onClick={() => setShowCurrent((v) => !v)}
              aria-label={showCurrent ? "Hide current password" : "Show current password"}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showCurrent ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {errors.currentPassword ? (
            <p className="text-xs text-destructive">{errors.currentPassword.message}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id="password"
              type={showNew ? "text" : "password"}
              autoComplete="new-password"
              className="pl-9 pr-10"
              aria-invalid={Boolean(errors.password)}
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShowNew((v) => !v)}
              aria-label={showNew ? "Hide new password" : "Show new password"}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {errors.password ? <p className="text-xs text-destructive">{errors.password.message}</p> : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="passwordConfirmation">Confirm new password</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id="passwordConfirmation"
              type={showNew ? "text" : "password"}
              autoComplete="new-password"
              className="pl-9"
              aria-invalid={Boolean(errors.passwordConfirmation)}
              {...register("passwordConfirmation")}
            />
          </div>
          {errors.passwordConfirmation ? (
            <p className="text-xs text-destructive">{errors.passwordConfirmation.message}</p>
          ) : null}
        </div>

        <Button type="submit" className="w-full" loading={isSubmitting}>
          {isSubmitting ? "Updating…" : "Update password"}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Changed your mind?{" "}
        <button type="button" onClick={signOut} className="text-primary hover:underline">
          Sign out
        </button>
      </p>
    </div>
  );
}
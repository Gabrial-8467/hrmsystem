"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import {
  fetchMe,
  login as loginRequest,
  logout as logoutRequest,
} from "@/lib/api/auth";
import { clearTokens } from "@/lib/auth/token-store";
import type { CurrentUser } from "@/lib/types";

interface SessionContextValue {
  user: CurrentUser | null;
  orgName: string;
  roleName: string;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const {
    data: user,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["session", "me"],
    queryFn: fetchMe,
    staleTime: 60_000,
    retry: (failureCount, err) => {
      if (err instanceof ApiError && err.status === 401) return false;
      return failureCount < 1;
    },
  });

  const isAuthenticated = Boolean(user) && !isError;

  const signIn = useCallback(
    async (email: string, password: string, rememberMe = false) => {
      await loginRequest(email, password, rememberMe);
      await queryClient.invalidateQueries({ queryKey: ["session", "me"] });
      await queryClient.refetchQueries({ queryKey: ["session", "me"] });
    },
    [queryClient],
  );

  const signOut = useCallback(async () => {
    try {
      await logoutRequest();
    } catch (err) {
      // Even if the network request fails, clear the local session.
      void err;
    }
    clearTokens();
    queryClient.clear();
    router.push("/login");
    router.refresh();
  }, [queryClient, router]);

  useEffect(() => {
    if (isError && error && (!(error instanceof ApiError) || error.status !== 401)) {
      toast.error("Session unavailable", {
        description: "Your session may have expired. Please sign in again.",
      });
    }
  }, [isError, error]);

  const value = useMemo<SessionContextValue>(() => {
    const permissionSet = new Set(user?.permissions ?? []);
    const isSuper = user?.isSuperAdmin ?? false;
    return {
      user: user ?? null,
      isLoading,
      isAuthenticated,
      signIn,
      signOut,
      hasPermission: (prefix: string) =>
        isSuper || permissionSet.has(prefix) || permissionSet.has("*"),
      hasAnyPermission: (permissions: string[]) =>
        isSuper ||
        (user?.permissions ?? []).some((p) => permissions.includes(p)),
      orgName: user?.organization?.name ?? "Your organization",
      roleName: user?.roles[0]?.name ?? "User",
    };
  }, [user, isLoading, isAuthenticated, signIn, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return ctx;
}

export function useUser(): CurrentUser | null {
  return useSession().user;
}
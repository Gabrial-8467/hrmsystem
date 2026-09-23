"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionProvider } from "@/lib/auth/session";
import { Toaster } from "sonner";

import { ThemeProvider } from "@/lib/theme";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider delayDuration={400}>
          <SessionProvider>{children}</SessionProvider>
          <Toaster
            position="top-right"
            closeButton
            toastOptions={{
              className: "text-sm",
            }}
            richColors
          />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
import { AlertTriangle, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api/client";

export function ErrorState({
  title = "Something went wrong",
  error,
  retry,
  offline,
}: {
  title?: string;
  error?: unknown;
  retry?: () => void;
  offline?: boolean;
}) {
  const Icon = offline ? WifiOff : AlertTriangle;
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-red-50 text-red-600">
        <Icon className="size-6" aria-hidden />
      </div>
      <h3 className="text-sm font-semibold text-foreground">
        {offline ? "You're offline" : title}
      </h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        {offline
          ? "Check your network connection and try again."
          : error
            ? errorMessage(error)
            : "We couldn't load this content. Try again in a moment."}
      </p>
      {retry ? (
        <div className="mt-4">
          <Button variant="outline" size="sm" onClick={retry}>
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function PermissionDenied({ resource = "this section" }: { resource?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-secondary">
        <AlertTriangle className="size-6 text-muted-foreground" aria-hidden />
      </div>
      <h3 className="text-sm font-semibold text-foreground">Permission required</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        You don&apos;t have permission to view {resource}. Contact an administrator if you believe this is a mistake.
      </p>
    </div>
  );
}
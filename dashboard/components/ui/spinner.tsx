import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 aria-hidden className={cn("size-4 animate-spin", className)} />;
}

export function PageLoader({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex h-64 w-full items-center justify-center" role="status" aria-label={label}>
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" aria-hidden />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}
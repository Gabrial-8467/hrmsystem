import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  compact?: boolean;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, compact }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "py-10" : "py-16"
      }`}
    >
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-secondary">
        <Icon className="size-6 text-muted-foreground" aria-hidden />
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? (
        <div className="mt-4">
          {action.href ? (
            <Button size="sm" asChild>
              <a href={action.href}>{action.label}</a>
            </Button>
          ) : (
            <Button size="sm" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
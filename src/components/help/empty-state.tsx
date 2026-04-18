"use client";

import Link from "next/link";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  helpSlug,
  className,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  helpSlug?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center",
        className
      )}
    >
      <Inbox className="size-12 text-muted-foreground/60" aria-hidden />
      <div>
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-muted-foreground mt-1 max-w-sm text-sm leading-relaxed">{description}</p>
      </div>
      {actionLabel && actionHref ? (
        <Button asChild variant="secondary" size="sm">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      ) : null}
      {helpSlug ? (
        <Link
          href={`/help/${encodeURIComponent(helpSlug)}`}
          className="text-xs font-medium text-primary underline underline-offset-2"
        >
          더 알아보기 →
        </Link>
      ) : null}
    </div>
  );
}

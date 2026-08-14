import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { chipClass, type ChipTone } from "@/lib/color-chip";

export function ColorChip({
  tone,
  icon,
  emphasis = false,
  size = "md",
  selected = false,
  className,
  children,
}: {
  tone: ChipTone;
  icon?: ReactNode;
  emphasis?: boolean;
  size?: "sm" | "md";
  selected?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn(chipClass(tone, { emphasis, size, selected }), className)}>
      {icon ? <span className="color-chip__icon">{icon}</span> : null}
      {children}
    </span>
  );
}

export function BirthdayTodayBadge({ className }: { className?: string }) {
  return (
    <ColorChip tone="pink" size="sm" emphasis className={className}>
      🎂 생일
    </ColorChip>
  );
}

export function NameWithBirthday({
  name,
  birthdayToday,
  className,
}: {
  name: string;
  birthdayToday?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      <span>{name}</span>
      {birthdayToday ? <BirthdayTodayBadge /> : null}
    </span>
  );
}

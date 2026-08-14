export const CHIP_TONES = ["red", "yellow", "green", "blue", "purple", "pink", "gray"] as const;

export type ChipTone = (typeof CHIP_TONES)[number];

export function isChipTone(value: string): value is ChipTone {
  return (CHIP_TONES as readonly string[]).includes(value);
}

export function chipClass(tone: ChipTone, opts?: { emphasis?: boolean; size?: "sm" | "md"; selected?: boolean }): string {
  const parts = ["color-chip", `color-chip--${tone}`];
  if (opts?.size === "sm") parts.push("color-chip--sm");
  if (opts?.emphasis) parts.push("color-chip--emphasis");
  if (opts?.selected) parts.push("color-chip--selected");
  return parts.join(" ");
}

export function chipAccentBorderClass(tone: ChipTone): string {
  return `chip-accent-border chip-accent-border--${tone}`;
}

export function chipCardHoverClass(tone: ChipTone): string {
  return `chip-card-hover chip-card-hover--${tone}`;
}

export function attendanceStatusChipTone(status: "AWAY" | "OUT" | "IN" | "ABSENT"): ChipTone {
  if (status === "IN") return "green";
  if (status === "AWAY") return "yellow";
  if (status === "OUT") return "blue";
  return "red";
}

export function leaveStatusChipTone(status: string): ChipTone {
  if (status === "APPROVED") return "green";
  if (status === "REJECTED") return "red";
  if (status === "CANCELLED") return "gray";
  return "yellow";
}

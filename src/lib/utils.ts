import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 이름 + 직책 + (선택) 브랜드/프로젝트 호칭 표기 */
export function formatUserName(user: {
  name: string;
  position?: string | null;
  currentProject?: { name: string; brand?: { name: string } | null } | null;
}): string {
  if (!user?.name) return "";
  const pos = user.position?.trim();
  const base = pos ? `${user.name} (${pos})` : user.name;
  const pName = user.currentProject?.name?.trim();
  const bName = user.currentProject?.brand?.name?.trim();
  const title = pName ? (bName ? `${bName}/${pName}` : pName) : "";
  return title ? `${base} · ${title}` : base;
}

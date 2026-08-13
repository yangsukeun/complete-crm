import { canAccessCsLounge, canPostCsNotice } from "@/lib/cs-lounge-access";

export function canViewCsClients(opts: {
  role: string | null | undefined;
  department: string | null | undefined;
}): boolean {
  return canAccessCsLounge(opts);
}

export function canManageCsClients(opts: {
  role: string | null | undefined;
  department: string | null | undefined;
}): boolean {
  return canPostCsNotice(opts);
}

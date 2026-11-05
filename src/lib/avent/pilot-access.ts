import { WORKSPACE_OWNER } from '../workspace-areas';

// Existing CRM account verified by exact name lookup on 2026-11-05.
// This allowlist grants only the fixed synthetic pilot, never logistics data access.
export const AVENT_PILOT_STAFF = 'cmqu62595000d94im1hdpj79t';

export function isAventPilotId(id: string): boolean {
  return id === WORKSPACE_OWNER || id === AVENT_PILOT_STAFF;
}

export function canAccessAventPilot(user: { id: string; accountDisabled: boolean } | null): boolean {
  return !!user && !user.accountDisabled && isAventPilotId(user.id);
}

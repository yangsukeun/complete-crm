import { signedIn, ownerOnly } from "./rua-work";

// Only accepts the existing server-authenticated session, never request actor/role.
export function ruaSessionActor(session: { user?: { id?: string } } | null, owner = false) {
  const actor = session?.user?.id ?? null;
  signedIn(actor);
  if (owner) ownerOnly(actor);
  return actor;
}

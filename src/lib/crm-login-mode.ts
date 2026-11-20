import "server-only";
import type { cookies } from "next/headers";

export function setCompanyModeCookie(store: Awaited<ReturnType<typeof cookies>>, secure: boolean) {
  store.set("app_mode", "company", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", secure });
}

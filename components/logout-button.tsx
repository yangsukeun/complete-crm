"use client";

import { signOut } from "next-auth/react";
import { onesignalOptOutAndDeregister } from "@/lib/onesignal/client-logout";

export function LogoutButton() {
  return (
    <button
      type="button"
      onClick={async () => {
        await onesignalOptOutAndDeregister();
        await signOut({ callbackUrl: "/login" });
      }}
      className="fixed top-4 right-4 text-xs text-slate-400 hover:text-slate-200 transition-colors py-1.5 px-2.5 rounded border border-slate-600/50 hover:border-slate-500 bg-slate-800/50 hover:bg-slate-700/50"
    >
      로그아웃
    </button>
  );
}

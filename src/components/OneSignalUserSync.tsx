"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

declare global {
  interface Window {
    OneSignalDeferred?: ((oneSignal: any) => void)[];
  }
}

export function OneSignalUserSync() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ? String(session.user.id) : null;

  useEffect(() => {
    if (status === "loading") return;
    if (typeof window === "undefined") return;

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    const deferred = window.OneSignalDeferred;

    if (userId) {
      deferred.push(async (OneSignal) => {
        try {
          await OneSignal.login(userId);
        } catch (e) {
          if (process.env.NODE_ENV === "development") {
            console.warn("[OneSignalUserSync] login failed:", e);
          }
        }
      });
    } else {
      deferred.push(async (OneSignal) => {
        try {
          await OneSignal.logout();
        } catch (e) {
          if (process.env.NODE_ENV === "development") {
            console.warn("[OneSignalUserSync] logout failed:", e);
          }
        }
      });
    }
  }, [userId, status]);

  return null;
}


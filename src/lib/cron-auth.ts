import { NextResponse } from "next/server";

/** Vercel Cron 등: `Authorization: Bearer ${CRON_SECRET}` */
export function verifyCronRequest(req: Request, operation?: "website-inquiry-key-expiry"): NextResponse | null {
  // Only this explicitly approved operation may use the newly configured secret.
  // Default-deny existing jobs before authentication or any handler side effects.
  // Use a handler-supplied identifier, never a client-controlled URL/header.
  if (operation !== "website-inquiry-key-expiry") {
    return NextResponse.json({ error: "Cron operation disabled", code: "CRON_OPERATION_DISABLED" }, { status: 503 });
  }
  const secret = process.env.CRON_SECRET;
  if (!secret || !secret.trim()) {
    console.error("[cron] CRON_SECRET is not set");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const CLIENT_TOKEN = process.env.IDLE_CLIENT_TOKEN;

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-client-token");
  if (!CLIENT_TOKEN || token !== CLIENT_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { employee_id, device_id, idle_start, idle_end, duration_seconds } = body ?? {};
  if (!employee_id || !device_id || !idle_start || !idle_end || duration_seconds == null) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  await prisma.idleSession.create({
    data: {
      employeeId: String(employee_id),
      deviceId: String(device_id),
      idleStart: new Date(idle_start),
      idleEnd: new Date(idle_end),
      durationSeconds: Math.trunc(Number(duration_seconds)),
    },
  });

  return NextResponse.json({ ok: true });
}

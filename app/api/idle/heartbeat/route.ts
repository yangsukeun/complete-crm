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

  const { employee_id, device_id, is_idle, client_version } = body ?? {};
  if (!employee_id || !device_id) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  await prisma.deviceStatus.upsert({
    where: { deviceId: String(device_id) },
    create: {
      deviceId: String(device_id),
      employeeId: String(employee_id),
      isIdle: Boolean(is_idle),
      clientVersion: client_version ?? null,
      lastSeen: new Date(),
    },
    update: {
      employeeId: String(employee_id),
      isIdle: Boolean(is_idle),
      clientVersion: client_version ?? null,
      lastSeen: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}

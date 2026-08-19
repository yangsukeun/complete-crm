import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const CLIENT_TOKEN = process.env.IDLE_CLIENT_TOKEN;

function parseClientStatus(value: unknown): "running" | "stopped" {
  return typeof value === "string" && value.trim().toLowerCase() === "stopped"
    ? "stopped"
    : "running";
}

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

  const { employee_id, device_id, is_idle, client_version, status } = body ?? {};
  if (!employee_id || !device_id) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const now = new Date();
  const deviceId = String(device_id);
  const isIdle = Boolean(is_idle);
  let clientStatus = parseClientStatus(status);
  const existing = await prisma.deviceStatus.findUnique({ where: { deviceId } });
  // 트레이 종료 직후 감지 루프가 running을 한 번 더 보내 stopped를 덮어쓰는 것을 막는다.
  if (
    clientStatus === "running" &&
    existing?.status === "stopped" &&
    now.getTime() - existing.updatedAt.getTime() < 5_000
  ) {
    clientStatus = "stopped";
  }
  const keepIdleStart = existing?.isIdle === true && isIdle && clientStatus === "running";

  await prisma.deviceStatus.upsert({
    where: { deviceId },
    create: {
      deviceId,
      employeeId: String(employee_id),
      isIdle,
      status: clientStatus,
      clientVersion: client_version ?? null,
      lastSeen: now,
    },
    update: {
      employeeId: String(employee_id),
      isIdle,
      status: clientStatus,
      clientVersion: client_version ?? null,
      ...(keepIdleStart ? {} : { lastSeen: now }),
    },
  });

  return NextResponse.json({ ok: true, status: clientStatus });
}

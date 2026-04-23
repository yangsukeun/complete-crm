import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import { autoReadNotifications } from "@/lib/notifications/auto-read";

export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // all
    if (body.all === true) {
      const out = await autoReadNotifications({ userId: session.user.id, all: true });
      return NextResponse.json(out);
    }

    // notificationIds
    if (Array.isArray(body.notificationIds)) {
      const ids = body.notificationIds.filter((x): x is string => typeof x === "string");
      const out = await autoReadNotifications({ userId: session.user.id, notificationIds: ids });
      return NextResponse.json(out);
    }

    // relatedType / relatedId
    const relatedType = typeof body.relatedType === "string" ? body.relatedType : "";
    const relatedId =
      body.relatedId === null || body.relatedId === undefined
        ? body.relatedId
        : typeof body.relatedId === "string"
          ? body.relatedId
          : String(body.relatedId);

    const types = Array.isArray(body.types)
      ? body.types.filter((x): x is string => typeof x === "string")
      : undefined;
    const linkFallback = Array.isArray(body.linkFallback)
      ? body.linkFallback.filter((x): x is string => typeof x === "string")
      : undefined;

    if (!relatedType) {
      return NextResponse.json(
        { error: "relatedType 또는 all=true 또는 notificationIds가 필요합니다." },
        { status: 400 }
      );
    }

    const out = await autoReadNotifications({
      userId: session.user.id,
      relatedType: relatedType as any,
      relatedId: relatedId as any,
      ...(types ? { types } : {}),
      ...(linkFallback ? { linkFallback } : {}),
    });
    return NextResponse.json(out);
  } catch (e) {
    console.error("[notifications/auto-read]", e);
    return NextResponse.json({ error: "읽음 처리에 실패했습니다." }, { status: 500 });
  }
}


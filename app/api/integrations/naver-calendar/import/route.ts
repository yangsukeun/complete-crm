import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { parseIcalEvents } from "@/lib/ical-parse";

export const runtime = "nodejs";

const SOURCE = "naver_ics";
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_EVENTS = 5000;
/** 업로드 시 전개할 기간 */
const IMPORT_WINDOW_PAST_DAYS = 365;
const IMPORT_WINDOW_FUTURE_DAYS = 365 * 2;

/** 네이버에서 내보낸 .ics 업로드 → 스냅샷 저장 (기존 업로드분은 대체) */
export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: ".ics 파일을 첨부해 주세요." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "파일이 너무 큽니다. (최대 5MB)" }, { status: 400 });
    }

    const text = await file.text();
    if (!/BEGIN:VCALENDAR/i.test(text)) {
      return NextResponse.json(
        { error: "iCalendar 형식이 아닙니다. 네이버 캘린더에서 내보낸 .ics 파일인지 확인해 주세요." },
        { status: 400 }
      );
    }

    const now = Date.now();
    const windowStart = new Date(now - IMPORT_WINDOW_PAST_DAYS * 24 * 60 * 60 * 1000);
    const windowEnd = new Date(now + IMPORT_WINDOW_FUTURE_DAYS * 24 * 60 * 60 * 1000);
    const parsed = parseIcalEvents(text, { windowStart, windowEnd });

    // 같은 UID+시작시각 중복 제거 (unique 제약 충돌 방지)
    const deduped = new Map<string, (typeof parsed)[number]>();
    for (const event of parsed) {
      deduped.set(`${event.uid}|${event.start.getTime()}`, event);
    }
    const rows = [...deduped.values()].slice(0, MAX_EVENTS);

    await prisma.$transaction([
      prisma.externalCalendarEvent.deleteMany({
        where: { userId: session.user.id, source: SOURCE },
      }),
      prisma.externalCalendarEvent.createMany({
        data: rows.map((event) => ({
          userId: session.user.id,
          source: SOURCE,
          uid: event.uid,
          title: event.summary,
          description: event.description,
          location: event.location,
          startTime: event.start,
          endTime: event.end,
          isAllDay: event.isAllDay,
        })),
        skipDuplicates: true,
      }),
    ]);

    return NextResponse.json({ ok: true, imported: rows.length });
  } catch (e) {
    console.error("[naver-calendar/import] POST", e);
    return NextResponse.json({ error: ".ics 파일을 읽지 못했습니다." }, { status: 500 });
  }
}

/** 업로드로 들여온 일정 전체 삭제 */
export async function DELETE() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { count } = await prisma.externalCalendarEvent.deleteMany({
      where: { userId: session.user.id, source: SOURCE },
    });
    return NextResponse.json({ ok: true, removed: count });
  } catch (e) {
    console.error("[naver-calendar/import] DELETE", e);
    return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
  }
}

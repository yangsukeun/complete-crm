import prisma from "@/lib/prisma";

type Related = {
  relatedType:
    | "PROJECT"
    | "TASK"
    | "CHAT"
    | "LEAVE"
    | "ATTENDANCE"
    | "FINANCE"
    | "BOARD"
    | "NOTICE"
    | "WORK_LOG"
    | "SYSTEM";
  relatedId: string | null;
};

function toPath(link: string): string {
  const raw = (link ?? "").trim();
  if (!raw) return "";
  try {
    // absolute url
    return new URL(raw).pathname || "/";
  } catch {
    // relative
    return raw.split("?")[0]?.split("#")[0] ?? raw;
  }
}

function parseRelatedFromLink(link: string): Related | null {
  const p = toPath(link);
  if (!p) return null;

  let m: RegExpMatchArray | null = null;

  m = p.match(/^\/projects\/([^/?#]+)/);
  if (m) return { relatedType: "PROJECT", relatedId: m[1] };

  m = p.match(/^\/tasks\/([^/?#]+)/);
  if (m) return { relatedType: "TASK", relatedId: m[1] };

  m = p.match(/^\/chat\/([^/?#]+)/);
  if (m) return { relatedType: "CHAT", relatedId: m[1] };
  m = p.match(/^\/chats\/([^/?#]+)/);
  if (m) return { relatedType: "CHAT", relatedId: m[1] };

  if (/^\/leave(?:[/?#]|$)/.test(p)) return { relatedType: "LEAVE", relatedId: null };
  m = p.match(/^\/leave\/([^/?#]+)/);
  if (m) return { relatedType: "LEAVE", relatedId: m[1] };

  if (/^\/finance\/requests(?:[/?#]|$)/.test(p)) return { relatedType: "FINANCE", relatedId: null };

  m = p.match(/^\/board\/([^/?#]+)/);
  if (m) return { relatedType: "BOARD", relatedId: m[1] };

  m = p.match(/^\/announcements\/([^/?#]+)/);
  if (m) return { relatedType: "NOTICE", relatedId: m[1] };

  return null;
}

async function main() {
  const batch = 500;
  let cursor: string | null = null;
  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  for (;;) {
    const rows: { id: string; link: string }[] = await prisma.notification.findMany({
      where: { relatedType: null },
      orderBy: { id: "asc" },
      take: batch,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true, link: true },
    });
    if (rows.length === 0) break;

    for (const n of rows) {
      scanned++;
      cursor = n.id;

      const rel = parseRelatedFromLink(n.link || "");
      if (!rel) {
        skipped++;
        continue;
      }

      await prisma.notification.update({
        where: { id: n.id },
        data: { relatedType: rel.relatedType as any, relatedId: rel.relatedId },
      });
      updated++;
    }
  }

  console.log(
    JSON.stringify(
      { ok: true, scanned, updated, skipped, hint: "마이그레이션 후 1회 실행이면 충분합니다." },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


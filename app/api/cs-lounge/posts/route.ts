import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import {
  canAccessCsLounge,
  canPostCsNotice,
  escapePlainText,
  randomCsLoungeNickname,
} from "@/lib/cs-lounge-access";
import {
  loadLoungeViewer,
  loungePostSelect,
  noticePostSelect,
  serializeLoungePost,
} from "@/lib/cs-lounge-serialize";

const MAX_LEN = 2000;

export async function GET(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const me = await loadLoungeViewer(session.user.id);
    if (!me || !canAccessCsLounge(me)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const typeRaw = (url.searchParams.get("type") ?? "").toUpperCase();
    const type = typeRaw === "NOTICE" || typeRaw === "LOUNGE" ? typeRaw : undefined;
    const limitRaw = Number(url.searchParams.get("limit") ?? "50");
    const take = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;

    const posts =
      type === "LOUNGE"
        ? (
            await prisma.csLoungePost.findMany({
              where: { deletedAt: null, type: "LOUNGE" },
              orderBy: { createdAt: "desc" },
              take,
              select: loungePostSelect,
            })
          ).map((r) => serializeLoungePost(r, me.id))
        : type === "NOTICE"
          ? (
              await prisma.csLoungePost.findMany({
                where: { deletedAt: null, type: "NOTICE" },
                orderBy: { createdAt: "desc" },
                take,
                select: noticePostSelect,
              })
            ).map((r) =>
              serializeLoungePost(
                { ...r, authorName: r.author.name },
                me.id
              )
            )
          : await (async () => {
              const [notices, lounge] = await Promise.all([
                prisma.csLoungePost.findMany({
                  where: { deletedAt: null, type: "NOTICE" },
                  orderBy: { createdAt: "desc" },
                  take,
                  select: noticePostSelect,
                }),
                prisma.csLoungePost.findMany({
                  where: { deletedAt: null, type: "LOUNGE" },
                  orderBy: { createdAt: "desc" },
                  take,
                  select: loungePostSelect,
                }),
              ]);
              return [...notices.map((r) => serializeLoungePost({ ...r, authorName: r.author.name }, me.id)), ...lounge.map((r) => serializeLoungePost(r, me.id))]
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .slice(0, take);
            })();

    return NextResponse.json({
      posts,
      canPostNotice: canPostCsNotice(me),
      viewerName: me.name,
    });
  } catch {
    console.error("[cs-lounge] list failed");
    return NextResponse.json({ error: "목록을 불러올 수 없습니다." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const me = await loadLoungeViewer(session.user.id);
    if (!me || !canAccessCsLounge(me)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as { type?: unknown; content?: unknown };
    const type = String(body.type ?? "").toUpperCase();
    if (type !== "NOTICE" && type !== "LOUNGE") {
      return NextResponse.json({ error: "type이 올바르지 않습니다." }, { status: 400 });
    }
    if (type === "NOTICE" && !canPostCsNotice(me)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const raw = typeof body.content === "string" ? body.content.trim() : "";
    if (!raw) {
      return NextResponse.json({ error: "내용을 입력하세요." }, { status: 400 });
    }
    if (raw.length > MAX_LEN) {
      return NextResponse.json({ error: `내용은 ${MAX_LEN}자 이하여야 합니다.` }, { status: 400 });
    }
    const content = escapePlainText(raw);
    const nickname = type === "LOUNGE" ? randomCsLoungeNickname() : null;

    if (type === "NOTICE") {
      const created = await prisma.csLoungePost.create({
        data: { type, content, nickname, authorId: me.id },
        select: noticePostSelect,
      });
      return NextResponse.json(
        serializeLoungePost(
          {
            id: created.id,
            type: created.type,
            content: created.content,
            nickname: created.nickname,
            createdAt: created.createdAt,
            authorId: created.authorId,
            authorName: created.author.name,
            votes: created.votes,
          },
          me.id
        )
      );
    }

    const created = await prisma.csLoungePost.create({
      data: { type, content, nickname, authorId: me.id },
      select: loungePostSelect,
    });
    return NextResponse.json(serializeLoungePost(created, me.id));
  } catch {
    console.error("[cs-lounge] create failed");
    return NextResponse.json({ error: "작성에 실패했습니다." }, { status: 500 });
  }
}

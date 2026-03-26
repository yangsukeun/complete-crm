import { getAppSession } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import prisma from "@/lib/prisma";
import { PageHeadline } from "@/components/page-headline";
import { AnnouncementPollClient } from "./announcement-poll-client";
import { AnnouncementDetailActions } from "./announcement-detail-actions";
import { isExecutiveOrAdmin } from "@/lib/role-access";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Calendar, MapPin } from "lucide-react";

export const dynamic = "force-dynamic";

type PollStored = { text: string; voterIds: string[] };

export default async function AnnouncementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");

  const cookieStore = await cookies();
  const appMode = cookieStore.get("app_mode")?.value;
  if (appMode !== "company") redirect("/choose-mode");

  const { id } = await params;
  const announcement = await prisma.announcement.findUnique({
    where: { id },
    include: { createdBy: { select: { name: true, position: true } } },
  });
  if (!announcement) notFound();

  const poll: PollStored[] | null = announcement.pollData
    ? (JSON.parse(announcement.pollData) as PollStored[])
    : null;

  const myVoteIndex =
    poll && session.user.id
      ? poll.findIndex((o) => o.voterIds.includes(session.user.id))
      : -1;

  const pollOptionsForUi =
    poll?.map((o) => ({ text: o.text, count: o.voterIds.length })) ?? [];

  const authorLine = `${announcement.createdBy?.name ?? "삭제된 사용자"}${
    announcement.createdBy?.position ? ` · ${announcement.createdBy.position}` : ""
  }`;

  const sessionRole = (session.user as { role?: string }).role ?? "";
  const canManageAnnouncement =
    announcement.createdById === session.user.id || isExecutiveOrAdmin(sessionRole);

  const pollOptionTexts = poll?.map((o) => o.text) ?? [];

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <div className="flex items-center gap-3">
        <Link
          href="/announcements"
          prefetch={true}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          목록
        </Link>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeadline
          title={announcement.title}
          description={`${authorLine} · ${format(new Date(announcement.createdAt), "yyyy.MM.dd (EEE) HH:mm", { locale: ko })}`}
        />
        <AnnouncementDetailActions
          announcementId={announcement.id}
          initialTitle={announcement.title}
          initialContent={announcement.content}
          initialEventDateIso={announcement.eventDate?.toISOString() ?? null}
          initialEventEndDateIso={announcement.eventEndDate?.toISOString() ?? null}
          initialLocation={announcement.location ?? null}
          initialPollOptionTexts={pollOptionTexts}
          canManage={canManageAnnouncement}
        />
      </div>

      <article className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
            {announcement.content}
          </pre>
        </div>

        {(announcement.eventDate || announcement.location) && (
          <div className="text-muted-foreground mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-4 text-sm">
            {announcement.eventDate && (
              <span className="flex items-center gap-1">
                <Calendar className="size-4 shrink-0" />
                {format(new Date(announcement.eventDate), "M/d (EEE) HH:mm", { locale: ko })}
                {announcement.eventEndDate &&
                  ` ~ ${format(new Date(announcement.eventEndDate), "M/d HH:mm", { locale: ko })}`}
              </span>
            )}
            {announcement.location && (
              <span className="flex items-center gap-1">
                <MapPin className="size-4 shrink-0" />
                {announcement.location}
              </span>
            )}
          </div>
        )}

        {pollOptionsForUi.length > 0 && (
          <AnnouncementPollClient
            announcementId={announcement.id}
            pollOptions={pollOptionsForUi}
            initialMyVoteIndex={myVoteIndex >= 0 ? myVoteIndex : null}
          />
        )}
      </article>
    </div>
  );
}

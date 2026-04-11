"use client";

import Link from "next/link";
import useSWR from "swr";
import { Megaphone, Loader2 } from "lucide-react";
import { jsonFetcher, SWR_KEYS } from "@/lib/api-swr";
import { formatKstMdEeeHm } from "@/lib/date-kst";

const NEW_ANNOUNCEMENT_HOURS = 72; // 3일 이내 공지는 "새 공지"로 표시

type AnnouncementItem = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  createdByName: string;
  createdByPosition: string | null;
};

export function DashboardAnnouncements({
  canCreate: _canCreate,
  fallbackData,
  nowMs,
}: {
  canCreate: boolean;
  /** 서버에서 prefetch 한 공지 — 첫 페인트 시 로딩 스피너 없음 */
  fallbackData: AnnouncementItem[];
  /** SSR/Hydration 불일치 방지용 기준 시각(ms) */
  nowMs: number;
}) {
  const { data: list = fallbackData, isLoading: loading } = useSWR<AnnouncementItem[]>(
    SWR_KEYS.announcements,
    jsonFetcher,
    {
      fallbackData,
      dedupingInterval: 15_000,
      revalidateOnFocus: true,
    }
  );

  const isNew = (createdAt: string) => {
    const created = new Date(createdAt).getTime();
    return nowMs - created < NEW_ANNOUNCEMENT_HOURS * 60 * 60 * 1000;
  };

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/board"
          className="flex items-center gap-2 font-semibold text-foreground hover:text-primary hover:underline"
        >
          <Megaphone className="size-5" />
          회사 공지사항
        </Link>
        <Link
          href="/board"
          className="text-primary text-sm font-medium hover:underline"
        >
          게시판에서 보기 →
        </Link>
      </div>

      {loading && (list?.length ?? 0) === 0 ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 py-8 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span>불러오는 중...</span>
        </div>
      ) : list.length === 0 ? (
        <Link
          href="/board"
          className="block rounded-lg border border-dashed bg-muted/30 py-8 text-center text-muted-foreground transition-colors hover:bg-muted/50"
        >
          등록된 공지사항이 없습니다. 게시판에서 공지·자료를 확인하세요.
        </Link>
      ) : (
        <ul className="space-y-2">
          {list.map((a: any) => {
            const newAnnouncement = isNew(a.createdAt);
            return (
              <li key={a.id}>
                <Link
                  href={`/announcements/${a.id}`}
                  className={
                    newAnnouncement
                      ? "announcement-new block rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50"
                      : "block rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50"
                  }
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{a.title}</span>
                      {newAnnouncement && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                          <span className="announcement-sparkle">✨</span> 새 공지
                        </span>
                      )}
                    </div>
                    <span className="text-muted-foreground text-sm shrink-0">
                      {formatKstMdEeeHm(a.createdAt)}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap break-words text-sm">
                    {a.content}
                  </p>
                  <p className="text-muted-foreground mt-2 text-xs">
                    {a.createdByName}
                    {a.createdByPosition ? ` · ${a.createdByPosition}` : ""}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

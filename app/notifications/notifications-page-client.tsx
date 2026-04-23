"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type NotificationItem = {
  id: string;
  type: string;
  message: string;
  link: string;
  isRead: boolean;
  createdAt: string;
};

const TYPE_LABELS: Record<string, string> = {
  DEADLINE: "마감",
  ASSIGNED: "배정",
  COMMENT: "댓글",
  STAGNANT: "미진행",
  BOARD_MENTION: "태그",
  TASK_BODY_MENTION: "프로젝트 호출",
  CHAT_MESSAGE: "채팅",
  NOTICE_POSTED: "공지",
  WORK_LOG_SUBMITTED: "업무일지",
  LEAVE_REQUEST: "휴가",
  PROJECT_COMPLETED: "프로젝트 완료",
};

export function NotificationsPageClient() {
  const router = useRouter();
  const [list, setList] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [readAllLoading, setReadAllLoading] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=50");
      if (!res.ok) throw new Error("알림 목록 조회 실패");
      const data = await res.json();
      setList(Array.isArray(data) ? data : []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    const refreshQuiet = () => {
      void fetch("/api/notifications?limit=50")
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => setList(Array.isArray(data) ? data : []))
        .catch(() => {});
    };
    window.addEventListener("notification-realtime", refreshQuiet);
    return () => window.removeEventListener("notification-realtime", refreshQuiet);
  }, []);

  const handleReadAll = useCallback(async () => {
    setReadAllLoading(true);
    try {
      const res = await fetch("/api/notifications/read-all", { method: "PATCH" });
      if (res.ok) await fetchList();
    } finally {
      setReadAllLoading(false);
    }
  }, [fetchList]);

  const handleClick = useCallback(
    async (n: NotificationItem) => {
      if (n.link) router.push(n.link);
      if (!n.isRead) {
        try {
          await fetch(`/api/notifications/${n.id}/read`, { method: "PATCH", credentials: "include" });
          setList((prev) =>
            prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x))
          );
        } catch {
          // ignore
        }
      }
    },
    [router]
  );

  const unreadCount = list.filter((n) => !n.isRead).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-sm">
          미읽음 {unreadCount}건
        </span>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleReadAll}
            disabled={readAllLoading}
          >
            <CheckCheck className="mr-1.5 size-4" />
            모두 읽음
          </Button>
        )}
      </div>

      <div className="rounded-lg border bg-card">
        {loading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            불러오는 중...
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <Bell className="size-10 opacity-50" />
            <p className="text-sm">알림이 없습니다.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {list.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => handleClick(n)}
                  className={cn(
                    "w-full px-4 py-3 text-left transition-colors hover:bg-muted/60",
                    !n.isRead && "bg-violet-50/50 dark:bg-violet-950/20"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 rounded bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">
                      {TYPE_LABELS[n.type] ?? n.type}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground">{n.message}</p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {formatDistanceToNow(new Date(n.createdAt), {
                          addSuffix: true,
                          locale: ko,
                        })}
                      </p>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

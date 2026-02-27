"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";

type NotificationItem = {
  id: string;
  type: string;
  message: string;
  link: string;
  isRead: boolean;
  createdAt: string;
};

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=20");
      if (!res.ok) return;
      const data = await res.json();
      setList(Array.isArray(data) ? data : []);
      setUnreadCount(data.filter((n: NotificationItem) => !n.isRead).length);
    } catch {
      setList([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=100&unreadOnly=true");
      if (!res.ok) return;
      const data = await res.json();
      setUnreadCount(Array.isArray(data) ? data.length : 0);
    } catch {
      setUnreadCount(0);
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const t = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(t);
  }, [fetchUnreadCount]);

  useEffect(() => {
    if (open) fetchList();
  }, [open, fetchList]);

  const handleClickNotification = useCallback(
    async (n: NotificationItem) => {
      if (n.link) router.push(n.link);
      if (!n.isRead) {
        try {
          await fetch(`/api/notifications/${n.id}/read`, { method: "PATCH" });
          setList((prev) =>
            prev.map((x: any) => (x.id === n.id ? { ...x, isRead: true } : x))
          );
          setUnreadCount((c) => Math.max(0, c - 1));
        } catch {
          // ignore
        }
      }
      setOpen(false);
    },
    [router]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full hover:bg-gray-100"
          aria-label="알림"
        >
          <Bell className="size-5 text-gray-600" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {unreadCount > 99 ? "99" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-3 py-2 font-medium text-sm">알림</div>
        <div className="max-h-[320px] overflow-y-auto">
          {loading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              불러오는 중...
            </div>
          ) : list.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              알림이 없습니다.
            </div>
          ) : (
            <ul className="divide-y">
              {list.map((n: any) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleClickNotification(n)}
                    className={cn(
                      "w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/60",
                      !n.isRead && "bg-violet-50/50"
                    )}
                  >
                    <p className="line-clamp-2 font-medium text-foreground">
                      {n.message}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {formatDistanceToNow(new Date(n.createdAt), {
                        addSuffix: true,
                        locale: ko,
                      })}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

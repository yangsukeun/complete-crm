"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ArrowLeft, Folder, File, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

type TrashItem = {
  id: string;
  name: string;
  isFolder: boolean;
  parentName: string | null;
  trashedAt: string | null;
  trashedByName: string | null;
  createdByName: string | null;
};

const fetcher = (url: string) => fetch(url).then(async (r) => {
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "불러오기 실패");
  return j as { items: TrashItem[] };
});

export function DriveTrashClient() {
  const { data, error, isLoading, mutate } = useSWR("/api/drive/trash", fetcher, {
    revalidateOnFocus: false,
  });
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((c) => (c === msg ? null : c)), 4000);
  }, []);

  const restore = async (id: string) => {
    setRestoringId(id);
    try {
      const res = await fetch(`/api/drive/file/${encodeURIComponent(id)}/restore`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "복원 실패");
      showToast("복원했습니다.");
      await mutate();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "복원 실패");
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/drive"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          탐색기로
        </Link>
        <Link href="/drive/activity" className="text-sm text-sky-700 hover:underline">
          활동 이력
        </Link>
      </div>

      {toast && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          {toast}
        </p>
      )}

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> 불러오는 중…
        </p>
      ) : error ? (
        <p className="text-sm text-destructive">{error.message}</p>
      ) : !data?.items?.length ? (
        <p className="text-sm text-muted-foreground">휴지통이 비어 있습니다.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-white">
          {data.items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              {item.isFolder ? (
                <Folder className="size-4 shrink-0 text-amber-600" />
              ) : (
                <File className="size-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  위치: {item.parentName ?? "루트"} · 삭제: {item.trashedByName ?? "—"} ·{" "}
                  {item.trashedAt
                    ? new Date(item.trashedAt).toLocaleString("ko-KR")
                    : "—"}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1"
                disabled={restoringId === item.id}
                onClick={() => void restore(item.id)}
              >
                {restoringId === item.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="size-3.5" />
                )}
                복원
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

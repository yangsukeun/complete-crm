"use client";

import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Loader2 } from "lucide-react";

type LogRow = {
  id: string;
  action: string;
  detail: string | null;
  createdAt: string;
  actorName: string;
  fileName: string;
  isFolder: boolean;
};

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "불러오기 실패");
    return j as { logs: LogRow[] };
  });

const ACTION_LABEL: Record<string, string> = {
  DELETE: "삭제",
  RESTORE: "복원",
  RENAME: "이름변경",
  MOVE: "이동",
};

export function DriveActivityClient() {
  const { data, error, isLoading } = useSWR("/api/drive/activity", fetcher, {
    revalidateOnFocus: false,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/drive/trash"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          휴지통
        </Link>
        <Link href="/drive" className="text-sm text-sky-700 hover:underline">
          탐색기
        </Link>
      </div>

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> 불러오는 중…
        </p>
      ) : error ? (
        <p className="text-sm text-destructive">{error.message}</p>
      ) : !data?.logs?.length ? (
        <p className="text-sm text-muted-foreground">기록이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">시각</th>
                <th className="px-3 py-2 font-medium">액션</th>
                <th className="px-3 py-2 font-medium">대상</th>
                <th className="px-3 py-2 font-medium">행위자</th>
                <th className="px-3 py-2 font-medium">상세</th>
              </tr>
            </thead>
            <tbody>
              {data.logs.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-xs">
                    {new Date(l.createdAt).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-3 py-2">{ACTION_LABEL[l.action] ?? l.action}</td>
                  <td className="px-3 py-2">
                    {l.isFolder ? "📁 " : ""}
                    {l.fileName}
                  </td>
                  <td className="px-3 py-2">{l.actorName}</td>
                  <td className="max-w-[280px] truncate px-3 py-2 text-xs text-muted-foreground">
                    {l.detail ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

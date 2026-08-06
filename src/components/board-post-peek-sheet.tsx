"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Maximize2, Loader2, Pencil, Trash2 } from "lucide-react";
import { BoardPostContent } from "../../app/board/[id]/board-post-content";
import { BoardPostComments } from "../../app/board/[id]/board-post-comments";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { toast } from "sonner";

type BoardPeekPayload = {
  id: string;
  title: string;
  description: string;
  contentType: string;
  category: string;
  attachments: { url: string; name: string }[];
  createdAt: string;
  createdById: string | null;
  createdByName: string;
  createdByPosition: string | null;
};

type Props = {
  postId: string | null;
  onClose: () => void;
  /** 삭제 성공 후 목록 갱신 */
  onDeleted?: () => void;
  currentUserId?: string;
  /** 상세 페이지와 동일: TEAM_LEAD | EXECUTIVE | ADMIN */
  currentUserRole?: string;
};

export function BoardPostPeekSheet({
  postId,
  onClose,
  onDeleted,
  currentUserId,
  currentUserRole,
}: Props) {
  const router = useRouter();
  const [data, setData] = useState<BoardPeekPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!postId) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/board/${postId}`)
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(
            typeof (j as { error?: string }).error === "string"
              ? (j as { error: string }).error
              : "불러오지 못했습니다."
          );
        }
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setData(json as BoardPeekPayload);
      })
      .catch((e) => {
        if (!cancelled) {
          setData(null);
          setError(e instanceof Error ? e.message : "오류");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  const role = currentUserRole ?? "";
  const isAdmin = role === "TEAM_LEAD" || role === "EXECUTIVE" || role === "ADMIN";
  const canEdit =
    !!data &&
    !!currentUserId &&
    (data.createdById === currentUserId || isAdmin);

  const handleDelete = async () => {
    if (!data) return;
    if (
      !confirm(
        "이 자료를 삭제(숨김)할까요? 관리자는 휴지통에서 복원하거나 영구 삭제할 수 있습니다."
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/board/${data.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof (body as { error?: string }).error === "string"
            ? (body as { error: string }).error
            : "삭제 실패"
        );
      }
      toast.success("삭제되었습니다.");
      onClose();
      onDeleted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Sheet open={!!postId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={true}
        ariaTitle="게시글 미리보기"
        className="max-h-[100vh] w-full gap-0 overflow-hidden border-0 bg-background p-0 sm:max-w-[min(99vw,min(1600px,calc(100vw-1rem)))]"
      >
        <div className="flex shrink-0 items-center justify-end gap-1 border-b px-4 py-2">
          {data ? (
            <>
              {canEdit ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => router.push(`/board/${data.id}`)}
                  >
                    <Pencil className="mr-2 size-4" />
                    수정
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deleting}
                    className="text-destructive hover:text-destructive"
                    onClick={() => void handleDelete()}
                  >
                    {deleting ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 size-4" />
                    )}
                    삭제
                  </Button>
                </>
              ) : null}
              <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
                <Link href={`/board/${data.id}`}>
                  <Maximize2 className="mr-2 size-4" />
                  전체 화면
                </Link>
              </Button>
            </>
          ) : null}
        </div>
        <div className="max-h-[calc(100vh-2.5rem)] min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-8 sm:py-6">
          {loading && (
            <div className="flex justify-center py-16">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          )}
          {error && !loading ? <p className="text-sm text-destructive">{error}</p> : null}
          {data && !loading ? (
            <>
              <h2 className="pr-8 text-xl font-semibold tracking-tight">{data.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {data.createdByName}
                {data.createdByPosition ? ` · ${data.createdByPosition}` : ""} ·{" "}
                {format(new Date(data.createdAt), "yyyy.MM.dd HH:mm", { locale: ko })}
              </p>
              <div className="mt-6">
                <BoardPostContent
                  description={data.description}
                  contentType={data.contentType}
                  attachments={data.attachments}
                  category={data.category}
                />
              </div>
              <div className="mt-8 border-t pt-6">
                <BoardPostComments postId={data.id} />
              </div>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeadline } from "@/components/page-headline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FolderKanban, FileText, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

type TrashProject = {
  id: string;
  name: string;
  deletedAt: string | null;
  brand: { id: string; name: string };
  deletedBy?: { id: string; name: string } | null;
};

type TrashBoard = {
  id: string;
  title: string;
  category: string;
  deletedAt: string | null;
  createdBy?: { id: string; name: string } | null;
  deletedBy?: { id: string; name: string } | null;
};

export function TrashClient() {
  const [projects, setProjects] = useState<TrashProject[]>([]);
  const [boardPosts, setBoardPosts] = useState<TrashBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchTrash = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/trash");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "불러오기 실패");
      setProjects(Array.isArray(data.projects) ? data.projects : []);
      setBoardPosts(Array.isArray(data.boardPosts) ? data.boardPosts : []);
    } catch {
      setProjects([]);
      setBoardPosts([]);
      toast.error("휴지통 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrash();
  }, [fetchTrash]);

  const mutate = async (
    op: "restore" | "permanent_delete",
    entity: "project" | "board",
    id: string
  ) => {
    const key = `${op}:${entity}:${id}`;
    setBusyId(key);
    try {
      const res = await fetch("/api/admin/trash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op, entity, id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "처리 실패");
      toast.success(op === "restore" ? "복원했습니다." : "영구 삭제했습니다.");
      await fetchTrash();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "처리에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4 md:p-6">
      <PageHeadline
        title="삭제된 항목"
        description="삭제(숨김)된 프로젝트와 게시판 자료입니다. 복원하거나 영구 삭제할 수 있습니다."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderKanban className="size-5" />
            삭제된 프로젝트
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">불러오는 중...</p>
          ) : projects.length === 0 ? (
            <p className="text-muted-foreground text-sm">항목이 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {projects.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-col gap-2 rounded-md border bg-muted/30 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-0.5">
                    <span className="font-medium">
                      {p.brand.name} / {p.name}
                    </span>
                    <div className="text-muted-foreground text-xs">
                      {p.deletedAt ? `삭제: ${new Date(p.deletedAt).toLocaleString("ko-KR")}` : ""}
                      {p.deletedBy?.name ? ` · ${p.deletedBy.name}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      disabled={busyId !== null}
                      onClick={() => {
                        if (!confirm("이 프로젝트를 복원할까요?")) return;
                        void mutate("restore", "project", p.id);
                      }}
                    >
                      <RotateCcw className="size-3.5" />
                      복원
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="gap-1"
                      disabled={busyId !== null}
                      onClick={() => {
                        if (
                          !confirm(
                            "영구 삭제하면 되돌릴 수 없습니다. DB에서 완전히 제거됩니다. 계속할까요?"
                          )
                        )
                          return;
                        void mutate("permanent_delete", "project", p.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                      영구 삭제
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-5" />
            삭제된 게시물 (자료실)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">불러오는 중...</p>
          ) : boardPosts.length === 0 ? (
            <p className="text-muted-foreground text-sm">항목이 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {boardPosts.map((b) => (
                <li
                  key={b.id}
                  className="flex flex-col gap-2 rounded-md border bg-muted/30 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-0.5">
                    <span className="font-medium">{b.title}</span>
                    <div className="text-muted-foreground text-xs">
                      {b.category === "COMPANY" ? "회사 자료" : "교육자료"}
                      {b.createdBy?.name ? ` · 작성: ${b.createdBy.name}` : ""}
                      {b.deletedAt ? ` · 삭제: ${new Date(b.deletedAt).toLocaleString("ko-KR")}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      disabled={busyId !== null}
                      onClick={() => {
                        if (!confirm("이 게시물을 복원할까요?")) return;
                        void mutate("restore", "board", b.id);
                      }}
                    >
                      <RotateCcw className="size-3.5" />
                      복원
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="gap-1"
                      disabled={busyId !== null}
                      onClick={() => {
                        if (
                          !confirm(
                            "영구 삭제하면 글과 댓글이 DB에서 제거되고, 구글 드라이브 첨부도 삭제됩니다. 계속할까요?"
                          )
                        )
                          return;
                        void mutate("permanent_delete", "board", b.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                      영구 삭제
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

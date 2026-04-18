"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeadline } from "@/components/page-headline";
import { workspaceFetchHeaders } from "@/lib/workspace-fetch-headers";
import { toast } from "sonner";
import Link from "next/link";

type TrashItem = {
  id: string;
  title: string;
  day: number;
  deletedAt: string | null;
  taskId?: string;
  bodyPreview?: string;
  subtitle?: string | null;
  project?: { id: string; name: string } | null;
};

export default function TrashPage() {
  const { status } = useSession();
  const [tab, setTab] = useState<"tasks" | "projects" | "comments">("tasks");
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (t: typeof tab) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/trash?tab=${t}`, {
        credentials: "include",
        headers: workspaceFetchHeaders(),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "목록 실패");
      setItems(Array.isArray(j.items) ? j.items : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "불러오기 실패");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    void load(tab);
  }, [status, tab, load]);

  const restoreTask = async (id: string) => {
    try {
      const res = await fetch(`/api/tasks/${id}/restore`, {
        method: "POST",
        credentials: "include",
        headers: workspaceFetchHeaders(),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "복구 실패");
      }
      toast.success("복구되었습니다.");
      void load("tasks");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "복구 실패");
    }
  };

  const restoreProject = async (id: string) => {
    try {
      const res = await fetch(`/api/projects/${id}/restore`, {
        method: "POST",
        credentials: "include",
        headers: workspaceFetchHeaders(),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "복구 실패");
      }
      toast.success("복구되었습니다.");
      void load("projects");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "복구 실패");
    }
  };

  const restoreComment = async (taskId: string, commentId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments/${commentId}/restore`, {
        method: "POST",
        credentials: "include",
        headers: workspaceFetchHeaders(),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "복구 실패");
      }
      toast.success("복구되었습니다.");
      void load("comments");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "복구 실패");
    }
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-8">
        <p className="text-muted-foreground text-sm">불러오는 중...</p>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-8">
        <p className="text-muted-foreground text-sm">로그인이 필요합니다.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 md:p-8">
      <PageHeadline title="휴지통" description="삭제 후 30일 이내만 복구할 수 있습니다. 이후에는 시스템에서 영구 삭제됩니다." />
      <p className="text-muted-foreground text-sm">
        <Link href="/tasks" className="text-primary hover:underline">
          ← Projects
        </Link>
      </p>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="tasks">업무</TabsTrigger>
          <TabsTrigger value="projects">프로젝트</TabsTrigger>
          <TabsTrigger value="comments">댓글</TabsTrigger>
        </TabsList>
        <TabsContent value="tasks" className="mt-4 space-y-3">
          {loading ? (
            <p className="text-muted-foreground text-sm">불러오는 중...</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground text-sm">휴지통에 삭제된 업무가 없습니다.</p>
          ) : (
            items.map((it) => (
              <div
                key={it.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium">{it.title}</p>
                  {it.project ? (
                    <p className="text-muted-foreground mt-0.5 truncate text-xs">{it.project.name}</p>
                  ) : null}
                  <p className="text-muted-foreground mt-1 text-xs">
                    삭제 후 {it.day}일째 · 30일 경과 시 영구 삭제
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => restoreTask(it.id)}>
                  복구
                </Button>
              </div>
            ))
          )}
        </TabsContent>
        <TabsContent value="projects" className="mt-4 space-y-3">
          {loading ? (
            <p className="text-muted-foreground text-sm">불러오는 중...</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground text-sm">휴지통에 삭제된 프로젝트가 없습니다.</p>
          ) : (
            items.map((it) => (
              <div
                key={it.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium">{it.title}</p>
                  {it.subtitle ? <p className="text-muted-foreground text-xs">{it.subtitle}</p> : null}
                  <p className="text-muted-foreground mt-1 text-xs">
                    삭제 후 {it.day}일째 · 30일 경과 시 영구 삭제
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => restoreProject(it.id)}>
                  복구
                </Button>
              </div>
            ))
          )}
        </TabsContent>
        <TabsContent value="comments" className="mt-4 space-y-3">
          {loading ? (
            <p className="text-muted-foreground text-sm">불러오는 중...</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground text-sm">휴지통에 삭제된 댓글이 없습니다.</p>
          ) : (
            items.map((it) => (
              <div
                key={it.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{it.title}</p>
                  <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">{it.bodyPreview}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    삭제 후 {it.day}일째 · 30일 경과 시 영구 삭제
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!it.taskId}
                  onClick={() => it.taskId && restoreComment(it.taskId, it.id)}
                >
                  복구
                </Button>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeadline } from "@/components/page-headline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderKanban } from "lucide-react";

type DeletedProject = {
  id: string;
  name: string;
  deletedAt: string | null;
  brand: { id: string; name: string };
  deletedBy?: { id: string; name: string; email: string | null } | null;
};

function projectLabel(p: DeletedProject): string {
  return `${p.brand.name} / ${p.name}`;
}

export function DeletedProjectsClient() {
  const [deletedProjects, setDeletedProjects] = useState<DeletedProject[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDeleted = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/projects?includeDeleted=1");
      const data = await res.json();
      const list = Array.isArray(data?.deletedProjects) ? data.deletedProjects : [];
      setDeletedProjects(list);
    } catch {
      setDeletedProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeleted();
  }, [fetchDeleted]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-4xl mx-auto">
      <PageHeadline
        title="삭제된 프로젝트"
        description="삭제(숨김) 처리된 프로젝트 목록입니다. 관리자만 확인할 수 있습니다."
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderKanban className="size-5" />
            삭제된 프로젝트 목록
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">불러오는 중...</p>
          ) : deletedProjects.length === 0 ? (
            <p className="text-muted-foreground text-sm">삭제된 프로젝트가 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {deletedProjects.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2"
                >
                  <div className="space-y-0.5">
                    <span className="font-medium">{projectLabel(p)}</span>
                    <div className="text-muted-foreground text-xs">
                      {p.deletedAt ? `삭제일: ${new Date(p.deletedAt).toLocaleString("ko-KR")}` : ""}
                      {p.deletedBy?.name ? ` · 삭제자: ${p.deletedBy.name}` : ""}
                    </div>
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

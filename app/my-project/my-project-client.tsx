"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageHeadline } from "@/components/page-headline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FolderKanban, Trash2, Loader2 } from "lucide-react";

type Project = {
  id: string;
  name: string;
  brand: { id: string; name: string };
} | null;

export function MyProjectClient({ initialProject }: { initialProject: Project }) {
  const router = useRouter();
  const [project, setProject] = useState<Project>(initialProject);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setProject(initialProject);
  }, [initialProject]);

  const handleDelete = async () => {
    if (!project) return;
    const label = `${project.brand.name} / ${project.name}`;
    if (!confirm(`"${label}" 프로젝트를 삭제(숨김)할까요?\n삭제된 프로젝트는 관리자 전용 페이지에서 확인할 수 있습니다.`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "삭제 실패");
      toast.success("프로젝트를 삭제 처리했습니다.");
      setProject(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeadline
        title="내 프로젝트"
        description="현재 부여된 프로젝트를 확인하고, 필요 시 삭제(숨김)할 수 있습니다."
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderKanban className="size-5" />
            현재 부여된 프로젝트
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!project ? (
            <p className="text-muted-foreground text-sm">부여된 프로젝트가 없습니다.</p>
          ) : (
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="font-medium">
                {project.brand.name} / {project.name}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={loading}
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="mr-2 size-4" />}
                삭제(숨김)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

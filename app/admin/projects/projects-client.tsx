"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthorMetaLine } from "@/components/author-meta-line";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatUserName } from "@/lib/utils";
import { PageHeadline } from "@/components/page-headline";
import { SplitView, useIsMdUp } from "@/components/ui/split-view";
import { ProjectDetailEmbed } from "../../projects/components/project-detail-embed";
import { cn } from "@/lib/utils";

type Brand = { id: string; name: string };
type Project = { id: string; name: string; brand: { id: string; name: string } };
type DeletedProject = Project & { deletedAt: string | null; deletedBy?: { id: string; name: string; email: string | null } | null };
type User = {
  id: string;
  name: string;
  email: string;
  department: string | null;
  position: string | null;
  currentProject: { id: string; name: string; brand: { name: string } } | null;
};

function projectLabel(p: Project | null): string {
  if (!p) return "";
  return `${p.brand.name} / ${p.name}`;
}

export function AdminProjectsClient() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [deletedProjects, setDeletedProjects] = useState<DeletedProject[]>([]);
  const [isMaster, setIsMaster] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [newBrandName, setNewBrandName] = useState("");
  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [newProjectName, setNewProjectName] = useState("");

  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [splitPreviewProjectId, setSplitPreviewProjectId] = useState<string | null>(null);
  const [savingAssign, setSavingAssign] = useState(false);
  const isMdUp = useIsMdUp();

  const fetchAll = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const [bRes, pRes, uRes] = await Promise.all([
        fetch("/api/brands"),
        fetch("/api/projects?includeDeleted=1"),
        fetch("/api/users/list"),
      ]);
      const b = bRes.ok ? await bRes.json() : [];
      const pJson = pRes.ok ? await pRes.json() : [];
      const p = Array.isArray(pJson) ? pJson : (pJson?.projects ?? []);
      const del = Array.isArray(pJson?.deletedProjects) ? pJson.deletedProjects : [];
      const master = pJson?.isMaster === true;
      const u = uRes.ok ? await uRes.json() : [];
      setBrands(b);
      setProjects(p);
      setDeletedProjects(del);
      setIsMaster(master);
      setUsers(u);
    } catch {
      setBrands([]);
      setProjects([]);
      setDeletedProjects([]);
      setIsMaster(false);
      setUsers([]);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    setSplitPreviewProjectId(null);
  }, [selectedBrandId]);

  const projectsInBrand = useMemo(() => {
    if (!selectedBrandId) return projects;
    return projects.filter((p: any) => p?.brand?.id === selectedBrandId);
  }, [projects, selectedBrandId]);

  const deletedProjectsInBrand = useMemo(() => {
    if (!selectedBrandId) return deletedProjects;
    return deletedProjects.filter((p: any) => p?.brand?.id === selectedBrandId);
  }, [deletedProjects, selectedBrandId]);

  const selectedUser = users.find((u: any) => u?.id === selectedUserId) ?? null;
  const selectedProject = projects.find((p: any) => p?.id === selectedProjectId) ?? null;

  const handleCreateBrand = async () => {
    const name = newBrandName.trim();
    if (!name) return toast.error("브랜드명을 입력하세요.");
    try {
      const res = await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "생성 실패");
      toast.success("브랜드가 생성되었습니다.");
      setNewBrandName("");
      fetchAll({ silent: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "브랜드 생성 실패");
    }
  };

  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    if (!selectedBrandId) return toast.error("브랜드를 먼저 선택하세요.");
    if (!name) return toast.error("프로젝트명을 입력하세요.");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: selectedBrandId, name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "생성 실패");
      toast.success("프로젝트가 생성되었습니다.");
      setNewProjectName("");
      fetchAll({ silent: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "프로젝트 생성 실패");
    }
  };

  const handleAssign = async (clear?: boolean) => {
    if (!selectedUserId) return toast.error("담당자를 선택하세요.");
    if (!clear && !selectedProjectId) return toast.error("프로젝트를 선택하세요.");
    setSavingAssign(true);
    try {
      const res = await fetch(`/api/users/${selectedUserId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentProjectId: clear ? null : selectedProjectId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "부여 실패");
      toast.success(clear ? "부여를 해제했습니다." : "프로젝트/브랜드를 부여했습니다.");
      fetchAll({ silent: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "부여 실패");
    } finally {
      setSavingAssign(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    const p = projects.find((x: any) => x.id === projectId) ?? null;
    const label = p ? projectLabel(p) : "이 프로젝트";
    if (!confirm(`${label}를 삭제(숨김)할까요?\n(퇴사 등 이력 보존을 위해 실제 삭제가 아니라 '삭제된 프로젝트'로 분리됩니다.)`)) return;
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "삭제 실패");
      toast.success("프로젝트를 삭제 처리했습니다.");
      fetchAll({ silent: true });
      setSplitPreviewProjectId((prev) => (prev === projectId ? null : prev));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제 실패");
    }
  };

  const selectedUserCurrentLabel = selectedUser?.currentProject
    ? `${selectedUser.currentProject.brand.name} / ${selectedUser.currentProject.name}`
    : "없음";

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <p className="text-muted-foreground">불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-5xl">
      <PageHeadline
        title="브랜드 / 프로젝트 관리"
        description="신규 브랜드·프로젝트를 등록하고, 직원에게 호칭처럼 부여할 수 있습니다."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">브랜드 생성</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="brand-name">브랜드명</Label>
              <Input
                id="brand-name"
                value={newBrandName}
                onChange={(e: any) => setNewBrandName(e.target.value)}
                placeholder="예: A브랜드"
              />
            </div>
            <Button onClick={handleCreateBrand}>브랜드 생성</Button>
          </CardContent>
        </Card>

        <Card className="border-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">프로젝트 생성</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>브랜드 선택</Label>
              <select
                className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                value={selectedBrandId}
                onChange={(e: any) => setSelectedBrandId(e.target.value)}
              >
                <option value="">브랜드 선택...</option>
                {brands.map((b: any) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-name">프로젝트명</Label>
              <Input
                id="project-name"
                value={newProjectName}
                onChange={(e: any) => setNewProjectName(e.target.value)}
                placeholder="예: 2026 SS 런칭"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreateProject} disabled={!selectedBrandId || !newProjectName.trim()}>
                프로젝트 생성
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => { setNewProjectName(""); setSelectedBrandId(""); }}
                disabled={!selectedBrandId && !newProjectName.trim()}
              >
                취소(초기화)
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">담당자에게 부여</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>담당자</Label>
              <select
                className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                value={selectedUserId}
                onChange={(e: any) => setSelectedUserId(e.target.value)}
              >
                <option value="">담당자 선택...</option>
                {users.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {formatUserName(u)}
                    {u.department ? ` · ${u.department}` : ""}
                    {u.currentProject ? ` · [${u.currentProject.brand.name}/${u.currentProject.name}]` : ""}
                  </option>
                ))}
              </select>
              {selectedUser && (
                <p className="text-muted-foreground text-xs">
                  현재 부여: <strong>{selectedUserCurrentLabel}</strong>
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>프로젝트</Label>
              <select
                className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                value={selectedProjectId}
                onChange={(e: any) => setSelectedProjectId(e.target.value)}
              >
                <option value="">프로젝트 선택...</option>
                {projectsInBrand.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {projectLabel(p)}
                  </option>
                ))}
              </select>
              <p className="text-muted-foreground text-xs">
                팁: 브랜드를 먼저 선택하면 해당 브랜드의 프로젝트만 보입니다.
              </p>
            </div>

            <div className="flex items-end gap-2">
              <Button onClick={() => handleAssign(false)} disabled={savingAssign || !selectedUserId || !selectedProjectId}>
                {savingAssign ? "저장 중..." : "부여"}
              </Button>
              <Button variant="outline" onClick={() => handleAssign(true)} disabled={savingAssign || !selectedUserId}>
                해제
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">프로젝트 목록</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-sm">
            개인이 퇴사/정리 시 프로젝트를 지울 수 있지만, 실제 삭제 대신 “삭제된 프로젝트”로 숨김 처리합니다.
          </p>
          {projectsInBrand.length === 0 ? (
            <p className="text-muted-foreground text-sm">표시할 프로젝트가 없습니다.</p>
          ) : isMdUp ? (
            <SplitView
              className="min-h-[480px] w-full max-w-full"
              defaultSplit={0.35}
              list={
                <div className="flex flex-col gap-2 p-1">
                  {projectsInBrand.map((p: any) => (
                    <div
                      key={p.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSplitPreviewProjectId(p.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSplitPreviewProjectId(p.id);
                        }
                      }}
                      className={cn(
                        "flex cursor-pointer items-center justify-between rounded-md border px-3 py-2 transition-colors hover:bg-muted/60",
                        splitPreviewProjectId === p.id && "border-l-4 border-l-primary bg-primary/5"
                      )}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{projectLabel(p)}</div>
                        <AuthorMetaLine
                          authorName={p.createdBy?.name}
                          editorName={p.lastEditedBy?.name}
                          dateIso={p.updatedAt}
                          className="mt-0.5 block text-[11px]"
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteProject(p.id);
                        }}
                      >
                        삭제
                      </Button>
                    </div>
                  ))}
                </div>
              }
              detail={
                splitPreviewProjectId ? (
                  <ProjectDetailEmbed projectId={splitPreviewProjectId} />
                ) : null
              }
              onClose={() => setSplitPreviewProjectId(null)}
            />
          ) : (
            <div className="space-y-2">
              {projectsInBrand.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div className="text-sm font-medium">{projectLabel(p)}</div>
                  <Button variant="outline" size="sm" onClick={() => handleDeleteProject(p.id)}>
                    삭제
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {(deletedProjects.length > 0 || isMaster) && (
        <Card className="border-2 border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">삭제된 프로젝트</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-muted-foreground text-sm">
              삭제된 프로젝트입니다. 퇴사 등 이력 보존을 위해 관리자만 확인할 수 있습니다. 전체 목록은 <Link href="/admin/trash" className="text-primary underline">삭제된 항목</Link>에서 볼 수 있습니다.
            </p>
            {deletedProjectsInBrand.length === 0 ? (
              <p className="text-muted-foreground text-sm">삭제된 프로젝트가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {deletedProjectsInBrand.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between rounded-md border bg-slate-50 px-3 py-2">
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium">{projectLabel(p)}</div>
                      <div className="text-muted-foreground text-xs">
                        {p.deletedAt ? `삭제일: ${new Date(p.deletedAt).toLocaleString("ko-KR")}` : ""}
                        {p.deletedBy?.name ? ` · 삭제자: ${p.deletedBy.name}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}


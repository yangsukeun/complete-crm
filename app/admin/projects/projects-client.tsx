"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatUserName } from "@/lib/utils";
import { PageHeadline } from "@/components/page-headline";

type Brand = { id: string; name: string };
type Project = { id: string; name: string; brand: { id: string; name: string } };
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
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [newBrandName, setNewBrandName] = useState("");
  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [newProjectName, setNewProjectName] = useState("");

  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [savingAssign, setSavingAssign] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, pRes, uRes] = await Promise.all([
        fetch("/api/brands"),
        fetch("/api/projects"),
        fetch("/api/users/list"),
      ]);
      const b = bRes.ok ? await bRes.json() : [];
      const p = pRes.ok ? await pRes.json() : [];
      const u = uRes.ok ? await uRes.json() : [];
      setBrands(b);
      setProjects(p);
      setUsers(u);
    } catch {
      setBrands([]);
      setProjects([]);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const projectsInBrand = useMemo(() => {
    if (!selectedBrandId) return projects;
    return projects.filter((p) => p.brand.id === selectedBrandId);
  }, [projects, selectedBrandId]);

  const selectedUser = users.find((u) => u.id === selectedUserId) ?? null;
  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;

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
      fetchAll();
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
      fetchAll();
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
      fetchAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "부여 실패");
    } finally {
      setSavingAssign(false);
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
                onChange={(e) => setNewBrandName(e.target.value)}
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
                onChange={(e) => setSelectedBrandId(e.target.value)}
              >
                <option value="">브랜드 선택...</option>
                {brands.map((b) => (
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
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="예: 2026 SS 런칭"
              />
            </div>
            <Button onClick={handleCreateProject} disabled={!selectedBrandId}>
              프로젝트 생성
            </Button>
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
                onChange={(e) => setSelectedUserId(e.target.value)}
              >
                <option value="">담당자 선택...</option>
                {users.map((u) => (
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
                onChange={(e) => setSelectedProjectId(e.target.value)}
              >
                <option value="">프로젝트 선택...</option>
                {projectsInBrand.map((p) => (
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
    </div>
  );
}


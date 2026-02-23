"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Building2, Briefcase, Plus, Trash2 } from "lucide-react";

type Item = { id: string; name: string; sortOrder: number };

export function DepartmentsPositionsClient() {
  const [departments, setDepartments] = useState<Item[]>([]);
  const [positions, setPositions] = useState<Item[]>([]);
  const [newDept, setNewDept] = useState("");
  const [newPos, setNewPos] = useState("");
  const [loading, setLoading] = useState(true);
  const [submittingDept, setSubmittingDept] = useState(false);
  const [submittingPos, setSubmittingPos] = useState(false);

  const fetchDepartments = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/departments");
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setDepartments(Array.isArray(data) ? data : []);
    } catch {
      setDepartments([]);
    }
  }, []);

  const fetchPositions = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/positions");
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setPositions(Array.isArray(data) ? data : []);
    } catch {
      setPositions([]);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchDepartments(), fetchPositions()]).finally(() => setLoading(false));
  }, [fetchDepartments, fetchPositions]);

  const handleAddDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newDept.trim();
    if (!name) {
      toast.error("부서명을 입력하세요.");
      return;
    }
    setSubmittingDept(true);
    try {
      const res = await fetch("/api/settings/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details ?? data.error ?? "등록 실패");
      toast.success("부서가 추가되었습니다.");
      setNewDept("");
      fetchDepartments();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "등록에 실패했습니다.");
    } finally {
      setSubmittingDept(false);
    }
  };

  const handleAddPosition = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newPos.trim();
    if (!name) {
      toast.error("직책명을 입력하세요.");
      return;
    }
    setSubmittingPos(true);
    try {
      const res = await fetch("/api/settings/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details ?? data.error ?? "등록 실패");
      toast.success("직책이 추가되었습니다.");
      setNewPos("");
      fetchPositions();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "등록에 실패했습니다.");
    } finally {
      setSubmittingPos(false);
    }
  };

  const handleDeleteDepartment = async (id: string) => {
    if (!confirm("이 부서를 삭제할까요? 이미 배정된 직원의 부서값은 빈 칸으로 남습니다.")) return;
    try {
      const res = await fetch(`/api/settings/departments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "삭제 실패");
      }
      toast.success("삭제되었습니다.");
      fetchDepartments();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    }
  };

  const handleDeletePosition = async (id: string) => {
    if (!confirm("이 직책을 삭제할까요? 이미 배정된 직원의 직책값은 빈 칸으로 남습니다.")) return;
    try {
      const res = await fetch(`/api/settings/positions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "삭제 실패");
      }
      toast.success("삭제되었습니다.");
      fetchPositions();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    }
  };

  if (loading) {
    return <p className="text-muted-foreground text-sm py-4">불러오는 중...</p>;
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="size-4" />
            부서
          </CardTitle>
          <p className="text-muted-foreground text-xs font-normal">부서명을 등록하면 기본정보에서 선택할 수 있습니다.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleAddDepartment} className="flex gap-2">
            <Input
              value={newDept}
              onChange={(e) => setNewDept(e.target.value)}
              placeholder="예: 개발팀, 영업팀"
              className="flex-1"
            />
            <Button type="submit" size="sm" disabled={submittingDept}>
              <Plus className="size-4" />
              추가
            </Button>
          </form>
          <ul className="max-h-[240px] overflow-y-auto rounded border bg-muted/30 p-2 space-y-1">
            {departments.length === 0 ? (
              <li className="text-muted-foreground text-sm py-2 text-center">등록된 부서가 없습니다.</li>
            ) : (
              departments.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm hover:bg-background">
                  <span>{d.name}</span>
                  <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => handleDeleteDepartment(d.id)} aria-label="삭제">
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </li>
              ))
            )}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Briefcase className="size-4" />
            직책
          </CardTitle>
          <p className="text-muted-foreground text-xs font-normal">직책을 등록하면 기본정보에서 선택할 수 있습니다.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleAddPosition} className="flex gap-2">
            <Input
              value={newPos}
              onChange={(e) => setNewPos(e.target.value)}
              placeholder="예: 사원, 대리, 과장"
              className="flex-1"
            />
            <Button type="submit" size="sm" disabled={submittingPos}>
              <Plus className="size-4" />
              추가
            </Button>
          </form>
          <ul className="max-h-[240px] overflow-y-auto rounded border bg-muted/30 p-2 space-y-1">
            {positions.length === 0 ? (
              <li className="text-muted-foreground text-sm py-2 text-center">등록된 직책이 없습니다.</li>
            ) : (
              positions.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm hover:bg-background">
                  <span>{p.name}</span>
                  <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => handleDeletePosition(p.id)} aria-label="삭제">
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </li>
              ))
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

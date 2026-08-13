"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PageHeadline } from "@/components/page-headline";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type MatchStatus = "matched" | "unmatched" | "linked";

type EmployeeRow = {
  machineNo: string;
  name: string;
  status: MatchStatus;
  userId: string | null;
  userName: string | null;
  userDepartment: string | null;
  existingMachineNo: string | null;
  note: string | null;
  punchDays: number;
};

type PunchRow = {
  machineNo: string;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  raw: string | null;
  incomplete: boolean;
};

type Preview = {
  year: number;
  month: number;
  periodLabel: string;
  employees: EmployeeRow[];
  punches: PunchRow[];
  stats: {
    employeeCount: number;
    punchRowCount: number;
    matched: number;
    unmatched: number;
    linked: number;
  };
};

type CreatedCs = {
  machineNo: string;
  name: string;
  userId: string;
  email: string;
  password: string;
  department: string | null;
};

const STATUS_LABEL: Record<MatchStatus, string> = {
  linked: "이미 기록기번호 연결됨",
  matched: "매칭됨",
  unmatched: "미매칭",
};

export function AttendanceImportClient({
  canCreateCsAccounts,
}: {
  canCreateCsAccounts: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [createdCs, setCreatedCs] = useState<CreatedCs[]>([]);

  const unmatched = useMemo(
    () => preview?.employees.filter((e) => e.status === "unmatched") ?? [],
    [preview],
  );
  const readyCount = useMemo(
    () => preview?.employees.filter((e) => e.userId).length ?? 0,
    [preview],
  );

  const uploadPreview = async () => {
    if (!file) {
      toast.error("엑셀 파일을 선택하세요.");
      return;
    }
    setLoading(true);
    setCreatedCs([]);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/attendance/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "미리보기에 실패했습니다.");
        return;
      }
      setPreview(data as Preview);
      toast.success(`${data.stats.employeeCount}명 파싱 · 아직 저장하지 않았습니다.`);
    } catch {
      toast.error("미리보기에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const createCs = async () => {
    if (unmatched.length === 0) {
      toast.error("미매칭 인원이 없습니다.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/attendance/import/create-cs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employees: unmatched.map((e) => ({ machineNo: e.machineNo, name: e.name })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "계정 생성에 실패했습니다.");
        return;
      }
      const list = (data.createdList ?? []) as CreatedCs[];
      setCreatedCs(list);
      setPreview((prev) => {
        if (!prev) return prev;
        const byNo = new Map(list.map((c) => [c.machineNo, c]));
        const employees = prev.employees.map((e) => {
          const c = byNo.get(e.machineNo);
          if (!c) return e;
          return {
            ...e,
            status: "linked" as const,
            userId: c.userId,
            userName: c.name,
            userDepartment: c.department,
            existingMachineNo: c.machineNo,
            note: "CS팀 계정을 새로 만들었습니다.",
          };
        });
        return {
          ...prev,
          employees,
          stats: {
            ...prev.stats,
            matched: employees.filter((e) => e.status === "matched").length,
            unmatched: employees.filter((e) => e.status === "unmatched").length,
            linked: employees.filter((e) => e.status === "linked").length,
          },
        };
      });
      if (data.failed > 0) {
        toast.error(`${data.created}명 생성, ${data.failed}명 실패`);
      } else {
        toast.success(`CS팀 계정 ${list.length}명 생성. 로그인 정보를 확인하세요.`);
      }
    } catch {
      toast.error("계정 생성에 실패했습니다.");
    } finally {
      setCreating(false);
    }
  };

  const commit = async () => {
    if (!preview) return;
    const links = preview.employees
      .filter((e) => e.userId)
      .map((e) => ({ machineNo: e.machineNo, userId: e.userId as string }));
    if (links.length === 0) {
      toast.error("연결된 계정이 없습니다.");
      return;
    }
    setCommitting(true);
    try {
      const res = await fetch("/api/attendance/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links, punches: preview.punches }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "저장에 실패했습니다.");
        return;
      }
      toast.success(`근태 ${data.upserted}건 저장 (기록기 번호 ${data.linkedCount}건 연결)`);
    } catch {
      toast.error("저장에 실패했습니다.");
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeadline
          title="출퇴근 기록기 엑셀 임포트"
          description="근태기록 시트를 미리보기한 뒤, 계정 매핑을 확인하고 커밋해야 저장됩니다. 기존 버튼 출근 기록은 건드리지 않습니다."
        />
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/attendance">월별 근태 조회</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. 엑셀 업로드 (미리보기)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <input
            type="file"
            accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
            }}
            className="text-sm"
          />
          <Button type="button" onClick={() => void uploadPreview()} disabled={loading || !file}>
            {loading ? "파싱 중…" : "미리보기"}
          </Button>
        </CardContent>
      </Card>

      {preview && (
        <>
          <p className="text-muted-foreground text-sm">
            {preview.periodLabel} · {preview.stats.employeeCount}명 · 타각 {preview.stats.punchRowCount}건
            · 매칭 {preview.stats.matched} · 연결됨 {preview.stats.linked} · 미매칭 {preview.stats.unmatched}
          </p>

          {(["linked", "matched", "unmatched"] as MatchStatus[]).map((status) => {
            const rows = preview.employees.filter((e) => e.status === status);
            if (rows.length === 0) return null;
            return (
              <Card key={status}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">
                    {STATUS_LABEL[status]} ({rows.length})
                  </CardTitle>
                  {status === "unmatched" && canCreateCsAccounts && (
                    <Button type="button" onClick={() => void createCs()} disabled={creating}>
                      {creating ? "생성 중…" : "CS팀 계정 일괄 생성"}
                    </Button>
                  )}
                  {status === "unmatched" && !canCreateCsAccounts && (
                    <p className="text-muted-foreground text-sm">관리자에게 계정 생성을 요청하세요</p>
                  )}
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-2 pr-3">사원번호</th>
                        <th className="py-2 pr-3">엑셀 성명</th>
                        <th className="py-2 pr-3">CRM 계정</th>
                        <th className="py-2 pr-3">부서</th>
                        <th className="py-2 pr-3">타각일수</th>
                        <th className="py-2">메모</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((e) => (
                        <tr key={e.machineNo} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-mono">{e.machineNo}</td>
                          <td className="py-2 pr-3">{e.name}</td>
                          <td className="py-2 pr-3">{e.userName ?? "—"}</td>
                          <td className="py-2 pr-3">{e.userDepartment ?? "—"}</td>
                          <td className="py-2 pr-3">{e.punchDays}</td>
                          <td className="text-muted-foreground py-2">{e.note ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            );
          })}

          {createdCs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">신규 CS팀 로그인 정보 (지금만 표시)</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 pr-3">이름</th>
                      <th className="py-2 pr-3">이메일</th>
                      <th className="py-2">임시 비밀번호</th>
                    </tr>
                  </thead>
                  <tbody>
                    {createdCs.map((c) => (
                      <tr key={c.userId} className="border-b last:border-0">
                        <td className="py-2 pr-3">{c.name}</td>
                        <td className="py-2 pr-3 font-mono">{c.email}</td>
                        <td className="py-2 font-mono">{c.password}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => void commit()} disabled={committing || readyCount === 0}>
              {committing ? "저장 중…" : `확인 후 근태 저장 (${readyCount}명)`}
            </Button>
            <Badge variant="outline">미리보기 상태 — 커밋 전까지 AttendanceRecord에 쓰지 않습니다</Badge>
          </div>
        </>
      )}
    </div>
  );
}

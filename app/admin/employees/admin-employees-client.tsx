"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Pencil, UserPlus } from "lucide-react";
import { formatUserName } from "@/lib/utils";

type Employee = {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string;
  position?: string;
  bankAccount?: string;
  address?: string;
  workPhone?: string;
  workEmail?: string;
  currentProject?: { id: string; name: string; brand?: { name: string } | null } | null;
  joinDate?: string;
  permissions?: string | null;
};

export function AdminEmployeesClient({
  employees: initial,
}: {
  employees: Employee[];
}) {
  const [employees, setEmployees] = useState(initial);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [address, setAddress] = useState("");
  const [workPhone, setWorkPhone] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [role, setRole] = useState<"USER" | "TEAM_LEAD">("USER");
  const [joinDate, setJoinDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [positions, setPositions] = useState<{ id: string; name: string }[]>([]);
  const [features, setFeatures] = useState<{ key: string; label: string }[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [useCustomPermissions, setUseCustomPermissions] = useState(false);
  const saveSafetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!saving) return;
    saveSafetyRef.current = setTimeout(() => {
      setSaving(false);
      toast.error("저장이 지연되고 있습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.");
    }, 25_000);
    return () => {
      if (saveSafetyRef.current) clearTimeout(saveSafetyRef.current);
      saveSafetyRef.current = null;
    };
  }, [saving]);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings/departments").then((r: any) => (r.ok ? r.json() : [])),
      fetch("/api/settings/positions").then((r: any) => (r.ok ? r.json() : [])),
      fetch("/api/permissions/features").then((r: any) => (r.ok ? r.json() : [])),
    ]).then(([depts, pos, feats]) => {
      setDepartments(Array.isArray(depts) ? depts : []);
      setPositions(Array.isArray(pos) ? pos : []);
      setFeatures(Array.isArray(feats) ? feats : []);
    });
  }, []);

  const openEdit = (e: any) => {
    setEditing(e);
    setName(e?.name ?? "");
    setDepartment(e?.department ?? "");
    setPosition(e?.position ?? "");
    setBankAccount(e?.bankAccount ?? "");
    setAddress(e?.address ?? "");
    setWorkPhone(e?.workPhone ?? "");
    setWorkEmail(e?.workEmail ?? "");
    setRole((e?.role === "TEAM_LEAD" ? "TEAM_LEAD" : "USER") as "USER" | "TEAM_LEAD");
    setJoinDate(e?.joinDate ?? "");
    if (e?.permissions != null && e?.permissions !== "") {
      try {
        const arr = JSON.parse(String(e?.permissions ?? "")) as unknown;
        setSelectedPermissions(Array.isArray(arr) ? arr.filter((x: any) => typeof x === "string") : []);
        setUseCustomPermissions(true);
      } catch {
        setSelectedPermissions([]);
        setUseCustomPermissions(false);
      }
    } else {
      setSelectedPermissions([]);
      setUseCustomPermissions(false);
    }
  };

  const handleSave = async () => {
    if (!editing || saving) return;
    setSaving(true);
    const ac = new AbortController();
    const timeoutId = setTimeout(() => ac.abort(), 18_000);
    try {
      const isAdminOrExecutive = editing.role === "ADMIN" || editing.role === "EXECUTIVE";
      const body: Record<string, unknown> = {
        name: name.trim(),
        department: department.trim() || null,
        position: position.trim() || null,
        bankAccount: bankAccount.trim() || null,
        address: address.trim() || null,
        workPhone: workPhone.trim() || null,
        workEmail: workEmail.trim() || null,
        joinDate:
          joinDate && !Number.isNaN(new Date(joinDate).getTime())
            ? new Date(joinDate).toISOString().slice(0, 10)
            : undefined,
        permissions: useCustomPermissions ? selectedPermissions : null,
      };
      if (!isAdminOrExecutive) (body as { role?: string }).role = role;
      const res = await fetch(`/api/users/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = typeof data?.details === "string" ? data.details : (data?.error ?? "저장 실패");
        throw new Error(msg);
      }
      const updated = await res.json();
      setEmployees((prev: any) =>
        prev.map((p: any) =>
          p.id === editing.id
            ? ({
                ...p,
                name: (updated as any).name ?? p.name,
                role: (updated as any).role ?? p.role,
                department: (updated as any).department ?? "",
                position: (updated as any).position ?? "",
                bankAccount: (updated as any).bankAccount ?? "",
                address: (updated as any).address ?? "",
                workPhone: (updated as any).workPhone ?? "",
                workEmail: (updated as any).workEmail ?? "",
                currentProject: (updated as any).currentProject ?? null,
                joinDate: (updated as any).joinDate
                  ? new Date((updated as any).joinDate).toISOString().slice(0, 10)
                  : p.joinDate,
                permissions: (updated as any).permissions ?? null,
              } as any)
            : p
        )
      );
      toast.success("저장되었습니다.");
      setEditing(null);
    } catch (e) {
      const isAbort = e instanceof Error && e.name === "AbortError";
      toast.error(
        isAbort ? "저장 요청이 시간 초과되었습니다. 다시 시도해 주세요." : e instanceof Error ? e.message : "저장에 실패했습니다."
      );
    } finally {
      clearTimeout(timeoutId);
      setSaving(false);
    }
  };

  return (
    <>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>이메일</TableHead>
              <TableHead>역할</TableHead>
              <TableHead>부서</TableHead>
              <TableHead>직책</TableHead>
              <TableHead>입사일</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground text-center">
                  등록된 직원이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              employees.map((emp: any) => (
                <TableRow key={emp.id}>
                  <TableCell className="font-medium">{formatUserName(emp)}</TableCell>
                  <TableCell>{emp.email ?? ""}</TableCell>
                  <TableCell>
                    {emp.role === "EXECUTIVE" ? "대표/임원" : emp.role === "ADMIN" ? "관리자" : emp.role === "TEAM_LEAD" ? "팀장" : "직원"}
                  </TableCell>
                  <TableCell>
                    {emp.department ? (
                      <Badge variant="secondary" className="font-normal">
                        {emp.department}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {emp.position ? (
                      <Badge variant="outline" className="font-normal">
                        {emp.position}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>{emp.joinDate ?? "—"}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(emp)}
                      aria-label="수정"
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={(open: any) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>직원 정보 수정</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>이메일</Label>
                <Input value={editing.email} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-name">이름</Label>
                <Input
                  id="edit-name"
                  value={name}
                  onChange={(e: any) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>역할 (직책에 따른 기능)</Label>
                {(editing.role === "ADMIN" || editing.role === "EXECUTIVE") ? (
                  <p className="text-muted-foreground rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                    {editing.role === "EXECUTIVE" ? "대표/임원" : "관리자"} — 역할 변경 불가
                  </p>
                ) : (
                  <>
                    <Select value={role} onValueChange={(v: any) => setRole(v as "USER" | "TEAM_LEAD")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USER">직원 — 기본 업무(일정·업무·연차 신청·자금 요청)</SelectItem>
                        <SelectItem value="TEAM_LEAD">팀장 — 직원 기능 + 휴가 1차 승인, 자금이체 결재(확인)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-muted-foreground text-xs">
                      {role === "TEAM_LEAD"
                        ? "팀장: 휴가 1차 승인, 자금이체 등록 시 알람 수신 및 이체 확인 가능."
                        : "직원: 본인 업무·연차 신청·결제 요청만 가능."}
                    </p>
                  </>
                )}
              </div>
              <div className="space-y-2">
                <Label>부서</Label>
                <Select value={department || "none"} onValueChange={(v: any) => setDepartment(v === "none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">선택 안 함</SelectItem>
                    {departments.map((d: any) => (
                      <SelectItem key={d.id} value={d.name}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>직책</Label>
                <Select value={position || "none"} onValueChange={(v: any) => setPosition(v === "none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">선택 안 함</SelectItem>
                    {positions.map((p: any) => (
                      <SelectItem key={p.id} value={p.name}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-address">주소지</Label>
                <Input
                  id="edit-address"
                  value={address}
                  onChange={(e: any) => setAddress(e.target.value)}
                  placeholder="주소를 입력하세요"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-bankAccount">은행계좌번호</Label>
                <Input
                  id="edit-bankAccount"
                  value={bankAccount}
                  onChange={(e: any) => setBankAccount(e.target.value)}
                  placeholder="은행명 계좌번호"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-workPhone">업무 연락처</Label>
                <Input
                  id="edit-workPhone"
                  value={workPhone}
                  onChange={(e: any) => setWorkPhone(e.target.value)}
                  placeholder="업무용 전화번호"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-workEmail">업무 이메일</Label>
                <Input
                  id="edit-workEmail"
                  type="email"
                  value={workEmail}
                  onChange={(e: any) => setWorkEmail(e.target.value)}
                  placeholder="업무용 이메일 (선택)"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-joindate">입사일</Label>
                <Input
                  id="edit-joindate"
                  type="date"
                  value={joinDate}
                  onChange={(e: any) => setJoinDate(e.target.value)}
                />
              </div>
              <div className="space-y-2 border-t pt-4">
                <div className="flex items-center justify-between">
                  <Label>사용 가능 기능</Label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={useCustomPermissions}
                      onChange={(e: any) => {
                        setUseCustomPermissions(e.target.checked);
                        if (!e.target.checked) setSelectedPermissions([]);
                      }}
                      className="rounded border-gray-300"
                    />
                    역할 기본값 대신 직접 지정
                  </label>
                </div>
                {useCustomPermissions && (
                  <div className="max-h-48 overflow-y-auto rounded border bg-muted/30 p-3 space-y-2">
{features.map((f: any) => (
                        <label key={f.key} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedPermissions.includes(f.key)}
                          onChange={(e: any) => {
                            if (e.target.checked) setSelectedPermissions((prev: any) => [...prev, f.key]);
                            else setSelectedPermissions((prev: any) => prev.filter((k: any) => k !== f.key));
                          }}
                          className="rounded border-gray-300"
                        />
                        {f.label}
                      </label>
                    ))}
                  </div>
                )}
                {!useCustomPermissions && (
                  <p className="text-muted-foreground text-xs">
                    현재 역할({role === "TEAM_LEAD" ? "팀장" : "직원"})에 따른 기본 기능이 적용됩니다. 위 체크 시 계정별로 사용할 기능만 골라 지정할 수 있습니다.
                  </p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

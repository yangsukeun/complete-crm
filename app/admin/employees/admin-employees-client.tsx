"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Pencil, Shield, ChevronDown, KeyRound } from "lucide-react";
import { formatUserName } from "@/lib/utils";
import { Trash2 } from "lucide-react";
import { canManageEmployeesSync, isPrivilegedStaffRole, type EmployeeManagerKind } from "@/lib/employee-admin-access";
import { parseAdditionalDepartments } from "@/lib/user-departments";

/** 직원 목록/편집용 타입. currentProject.brand는 객체 { name: string } 또는 null만 사용 */
export type Employee = {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string;
  additionalDepartments?: string | string[] | null;
  position?: string;
  bankAccount?: string;
  address?: string;
  workPhone?: string;
  workEmail?: string;
  currentProject?: { id: string; name: string; brand?: { name: string } | null } | null;
  joinDate?: string;
  permissions?: string | null;
};

type AppRole = "USER" | "TEAM_LEAD" | "CENTER_CHIEF" | "EXECUTIVE" | "ADMIN";

const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: "USER", label: "일반 직원" },
  { value: "TEAM_LEAD", label: "팀장" },
  { value: "CENTER_CHIEF", label: "센터장" },
  { value: "EXECUTIVE", label: "대표/임원" },
  { value: "ADMIN", label: "시스템 관리자" },
];

function normalizeEmployeeRole(r: string | undefined): AppRole {
  const u = String(r ?? "USER").toUpperCase();
  if (u === "TEAM_LEAD" || u === "CENTER_CHIEF" || u === "EXECUTIVE" || u === "ADMIN") {
    return u as AppRole;
  }
  return "USER";
}

function roleDisplayLabel(role: string): string {
  const r = String(role ?? "").toUpperCase();
  if (r === "EXECUTIVE") return "대표/임원";
  if (r === "ADMIN") return "관리자";
  if (r === "CENTER_CHIEF") return "센터장";
  if (r === "TEAM_LEAD") return "팀장";
  return "직원";
}

export function AdminEmployeesClient({
  employees: initial,
  managerKind = "privileged",
}: {
  employees: Employee[];
  managerKind?: EmployeeManagerKind;
}) {
  const { data: session } = useSession();
  const myId = (session?.user as any)?.id as string | undefined;
  const myRole = String((session?.user as any)?.role ?? "").toUpperCase();
  const myPosition = (session?.user as { position?: string | null } | undefined)?.position ?? null;
  const myPermissions = (session?.user as { permissions?: string | null } | undefined)?.permissions ?? null;
  const canAlwaysEditLeave = canManageEmployeesSync({
    role: myRole,
    position: myPosition,
    permissionsJson: myPermissions,
  });
  const isDelegated = managerKind === "employee_manage";
  const canEditPermissions = managerKind === "privileged";

  const [employees, setEmployees] = useState(initial);
  const [deptFilter, setDeptFilter] = useState<string>("__ALL__");
  const [posFilter, setPosFilter] = useState<string>("__ALL__");
  const [editing, setEditing] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState<Employee | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [additionalDepartments, setAdditionalDepartments] = useState<string[]>([]);
  const [position, setPosition] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [address, setAddress] = useState("");
  const [workPhone, setWorkPhone] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [role, setRole] = useState<AppRole>("USER");
  const [roleChangingId, setRoleChangingId] = useState<string | null>(null);
  const [joinDate, setJoinDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [positions, setPositions] = useState<{ id: string; name: string }[]>([]);
  const [features, setFeatures] = useState<{ key: string; label: string }[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [useCustomPermissions, setUseCustomPermissions] = useState(false);
  const [manualDeduction, setManualDeduction] = useState("");
  const [leaveBalance, setLeaveBalance] = useState<{
    manualDeduction: number;
    leaveRemaining: number;
    annualCarryOver?: number;
    totalAvailable?: number;
  } | null>(null);
  const [annualCarryOver, setAnnualCarryOver] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);
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
    if (isDelegated && isPrivilegedStaffRole(e?.role)) {
      toast.error("대표/관리자 계정은 수정할 수 없습니다.");
      return;
    }
    setEditing(e);
    setName(e?.name ?? "");
    setDepartment(e?.department ?? "");
    setAdditionalDepartments(parseAdditionalDepartments(e?.additionalDepartments ?? null));
    setPosition(e?.position ?? "");
    setBankAccount(e?.bankAccount ?? "");
    setAddress(e?.address ?? "");
    setWorkPhone(e?.workPhone ?? "");
    setWorkEmail(e?.workEmail ?? "");
    setRole(normalizeEmployeeRole(e?.role));
    setJoinDate(e?.joinDate ?? "");
    setManualDeduction("");
    setAnnualCarryOver("");
    setLeaveBalance(null);
    setNewPassword("");
    setNewPasswordConfirm("");
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
    if (e?.id) {
      fetch(`/api/users/${e.id}/leave-balance`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { manualDeduction?: number; leaveRemaining?: number; annualCarryOver?: number; totalAvailable?: number } | null) => {
          if (d) {
            setLeaveBalance({
              manualDeduction: d.manualDeduction ?? 0,
              leaveRemaining: d.leaveRemaining ?? 0,
              annualCarryOver: d.annualCarryOver ?? 0,
              totalAvailable: d.totalAvailable,
            });
            setAnnualCarryOver(String(d.annualCarryOver ?? 0));
            setManualDeduction(String(d.manualDeduction ?? 0));
          }
        })
        .catch(() => setLeaveBalance(null));
    }
  };

  const handleResetPassword = async () => {
    if (!editing || resettingPassword) return;
    const pw = newPassword.trim();
    if (pw.length < 8) {
      toast.error("비밀번호는 8자 이상 입력하세요.");
      return;
    }
    if (pw !== newPasswordConfirm.trim()) {
      toast.error("비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    setResettingPassword(true);
    try {
      const res = await fetch(`/api/users/${editing.id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "비밀번호 재설정 실패");
      }
      setNewPassword("");
      setNewPasswordConfirm("");
      toast.success("비밀번호를 재설정했습니다.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "비밀번호 재설정에 실패했습니다.");
    } finally {
      setResettingPassword(false);
    }
  };

  const changeRoleQuick = async (emp: Employee, newRole: AppRole) => {
    if (!myId || emp.id === myId || myRole !== "ADMIN" || newRole === emp.role) return;
    setRoleChangingId(emp.id);
    try {
      const res = await fetch(`/api/users/${emp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(typeof (data as { error?: string }).error === "string" ? (data as { error: string }).error : "역할 변경 실패");
      setEmployees((prev: Employee[]) =>
        prev.map((p) => (p.id === emp.id ? { ...p, role: newRole } : p))
      );
      toast.success("역할이 변경되었습니다.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "역할 변경에 실패했습니다.");
    } finally {
      setRoleChangingId(null);
    }
  };

  const handleSave = async () => {
    if (!editing || saving) return;
    const pw = newPassword.trim();
    const pwConfirm = newPasswordConfirm.trim();
    if (pw || pwConfirm) {
      if (pw.length < 8) {
        toast.error("비밀번호는 8자 이상 입력하세요.");
        return;
      }
      if (pw !== pwConfirm) {
        toast.error("비밀번호 확인이 일치하지 않습니다.");
        return;
      }
    }
    setSaving(true);
    const ac = new AbortController();
    const timeoutId = setTimeout(() => ac.abort(), 18_000);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        department: department.trim() || null,
        additionalDepartments: additionalDepartments.filter((d) => d && d !== department.trim()),
        position: position.trim() || null,
        bankAccount: bankAccount.trim() || null,
        address: address.trim() || null,
        workPhone: workPhone.trim() || null,
        workEmail: workEmail.trim() || null,
        joinDate:
          joinDate && !Number.isNaN(new Date(joinDate).getTime())
            ? new Date(joinDate).toISOString().slice(0, 10)
            : undefined,
      };
      if (canEditPermissions) {
        body.permissions = useCustomPermissions ? selectedPermissions : null;
      }
      if (pw) body.password = pw;
      if (myRole === "ADMIN" && editing.id !== myId && !isDelegated) {
        (body as { role?: AppRole }).role = role;
      }
      const manualNum = manualDeduction.trim() === "" ? undefined : parseFloat(manualDeduction);
      if (manualNum !== undefined && !Number.isNaN(manualNum) && manualNum >= 0) {
        (body as { manualDeduction?: number }).manualDeduction = manualNum;
      }
      const carryNum = annualCarryOver.trim() === "" ? undefined : parseFloat(annualCarryOver);
      if (carryNum !== undefined && !Number.isNaN(carryNum) && carryNum >= 0) {
        (body as { annualCarryOver?: number }).annualCarryOver = carryNum;
      }
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
                additionalDepartments: (updated as any).additionalDepartments ?? null,
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
      toast.success(pw ? "저장했습니다. 새 비밀번호로 로그인할 수 있습니다." : "저장되었습니다.");
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

  const confirmDelete = async () => {
    if (!deleting || deletingBusy) return;
    setDeletingBusy(true);
    try {
      const res = await fetch(`/api/users/${deleting.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "계정 삭제에 실패했습니다.");
      setEmployees((prev: any) => prev.filter((u: any) => u.id !== deleting.id));
      toast.success("계정이 삭제되었습니다.");
      setDeleting(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "계정 삭제에 실패했습니다.");
    } finally {
      setDeletingBusy(false);
    }
  };

  const visibleEmployees = employees.filter((emp) => {
    if (deptFilter !== "__ALL__" && (emp.department || "") !== deptFilter) return false;
    if (posFilter !== "__ALL__" && (emp.position || "") !== posFilter) return false;
    return true;
  });

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-40" size="sm">
            <SelectValue placeholder="부서" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__ALL__">전체 부서</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.name}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={posFilter} onValueChange={setPosFilter}>
          <SelectTrigger className="w-40" size="sm">
            <SelectValue placeholder="직책" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__ALL__">전체 직책</SelectItem>
            {positions.map((p) => (
              <SelectItem key={p.id} value={p.name}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
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
              <TableHead className="w-[220px] text-right">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleEmployees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground text-center">
                  등록된 직원이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              visibleEmployees.map((emp: Employee) => (
                <TableRow key={emp.id}>
                  <TableCell className="font-medium">
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {formatUserName(emp)}
                      {(emp.role === "ADMIN" || emp.role === "EXECUTIVE") && (
                        <Badge variant="default" className="shrink-0 gap-0.5 text-[10px] font-normal">
                          <Shield className="size-3" />
                          {emp.role === "ADMIN" ? "관리자" : "대표"}
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>{emp.email ?? ""}</TableCell>
                  <TableCell>{roleDisplayLabel(emp.role)}</TableCell>
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
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      {myRole === "ADMIN" && myId != null && emp.id !== myId && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1 px-2"
                              disabled={roleChangingId === emp.id}
                            >
                              권한 변경
                              <ChevronDown className="size-3.5 opacity-60" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                              역할 선택
                            </DropdownMenuLabel>
                            {ROLE_OPTIONS.map((opt) => (
                              <DropdownMenuItem
                                key={opt.value}
                                disabled={opt.value === normalizeEmployeeRole(emp.role)}
                                onClick={() => void changeRoleQuick(emp, opt.value)}
                              >
                                {opt.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(emp)}
                        aria-label="수정"
                        disabled={isDelegated && isPrivilegedStaffRole(emp.role)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="삭제"
                        disabled={
                          deletingBusy ||
                          (myId != null && emp.id === myId) ||
                          (isPrivilegedStaffRole(emp.role) && !isPrivilegedStaffRole(myRole))
                        }
                        onClick={() => setDeleting(emp)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!deleting} onOpenChange={(open: any) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>계정 삭제</DialogTitle>
          </DialogHeader>
          {deleting && (
            <div className="space-y-2">
              <p className="text-sm">
                <span className="font-medium">{formatUserName(deleting)}</span> 계정을 삭제하시겠습니까?
              </p>
              <p className="text-muted-foreground text-xs">
                삭제하면 로그인/데이터 접근이 불가능해집니다. (마지막 관리자 계정은 삭제할 수 없습니다.)
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={deletingBusy}>
              취소
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deletingBusy}>
              {deletingBusy ? "삭제 중..." : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <div className="space-y-2 border-b pb-4">
                <Label>비밀번호 재설정</Label>
                <p className="text-muted-foreground text-xs">
                  새 비밀번호를 입력한 뒤 아래 저장을 누르면 함께 변경됩니다. 비밀번호만 바꾸려면 재설정 버튼을 누르세요.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e: any) => setNewPassword(e.target.value)}
                    placeholder="새 비밀번호 (8자 이상)"
                  />
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={newPasswordConfirm}
                    onChange={(e: any) => setNewPasswordConfirm(e.target.value)}
                    placeholder="비밀번호 확인"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  disabled={resettingPassword}
                  onClick={() => void handleResetPassword()}
                >
                  <KeyRound className="mr-1.5 size-3.5" />
                  {resettingPassword ? "재설정 중..." : "비밀번호 재설정"}
                </Button>
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
                {editing.id === myId ? (
                  <p className="text-muted-foreground rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                    본인의 역할은 여기서 변경할 수 없습니다. ({roleDisplayLabel(editing.role)})
                  </p>
                ) : myRole !== "ADMIN" ? (
                  <p className="text-muted-foreground rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                    역할 변경은 시스템 관리자(ADMIN)만 할 수 있습니다. ({roleDisplayLabel(editing.role)})
                  </p>
                ) : (
                  <>
                    <Select value={role} onValueChange={(v: string) => setRole(v as AppRole)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USER">직원 — 기본 권한(일정·프로젝트·연차·자금 요청)</SelectItem>
                        <SelectItem value="TEAM_LEAD">팀장 — 휴가 1차 승인, 자금이체 결재(확인)</SelectItem>
                        <SelectItem value="CENTER_CHIEF">센터장 — CS팀 자금이체 2차 결재</SelectItem>
                        <SelectItem value="EXECUTIVE">대표/임원 — 경영·전체 관리</SelectItem>
                        <SelectItem value="ADMIN">시스템 관리자 — 직원 역할·설정</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-muted-foreground text-xs">
                      {role === "TEAM_LEAD"
                        ? "팀장: 휴가 1차 승인, 자금이체 등록 시 알람 수신 및 이체 확인 가능."
                        : role === "EXECUTIVE" || role === "ADMIN"
                          ? "대표/관리자: 공지 작성·직원 관리 등 상위 권한이 적용됩니다."
                          : "직원: 본인 프로젝트·연차 신청·결제 요청만 가능."}
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
                <Label>겸직 부서</Label>
                <div className="max-h-36 overflow-y-auto rounded border bg-muted/30 p-3 space-y-2">
                  {departments
                    .filter((d: any) => d.name !== department)
                    .map((d: any) => (
                      <label key={d.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={additionalDepartments.includes(d.name)}
                          onChange={(e: any) => {
                            if (e.target.checked) {
                              setAdditionalDepartments((prev) => [...prev, d.name]);
                            } else {
                              setAdditionalDepartments((prev) => prev.filter((x) => x !== d.name));
                            }
                          }}
                          className="rounded border-gray-300"
                        />
                        {d.name}
                      </label>
                    ))}
                  {departments.filter((d: any) => d.name !== department).length === 0 && (
                    <p className="text-muted-foreground text-xs">선택 가능한 부서가 없습니다.</p>
                  )}
                </div>
                <p className="text-muted-foreground text-xs">
                  겸직 부서가 있으면 자금 조회(finance_view) 시 해당 부서 건을 함께 볼 수 있습니다. 결재 권한은 생기지 않습니다.
                </p>
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
              {/* 휴가 소진(차감): 대표/관리자는 언제든 수정·되돌리기 가능, 그 외는 최초 1회만 */}
              <div className="space-y-2 border-t pt-4">
                <Label className="text-sm font-medium">휴가 소진 (이미 사용한 연차, 일)</Label>
                {leaveBalance && leaveBalance.manualDeduction > 0 && !canAlwaysEditLeave ? (
                  <p className="text-muted-foreground text-sm">
                    이미 소진 처리됨: <strong>{leaveBalance.manualDeduction}일</strong> (수정 불가)
                  </p>
                ) : (
                  <>
                    <p className="text-muted-foreground text-xs">
                      {(canAlwaysEditLeave)
                        ? "대표/관리자·경영관리 매니저: 연차 차감을 언제든 다시 입력하거나 0으로 되돌릴 수 있습니다."
                        : "시스템 도입 전에 이미 사용한 연차가 있으면 여기 입력 후 저장하세요. 최초 1회만 설정 가능합니다."}
                    </p>
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      value={manualDeduction}
                      onChange={(e: any) => setManualDeduction(e.target.value)}
                      placeholder="0"
                      className="w-32"
                    />
                    {leaveBalance != null && (
                      <p className="text-muted-foreground text-xs">
                        현재 잔여 연차: {leaveBalance.leaveRemaining}일
                        {(leaveBalance.annualCarryOver ?? 0) > 0 && (
                          <> (전체 휴가 {leaveBalance.totalAvailable ?? "-"}일, 이월 {leaveBalance.annualCarryOver}일)</>
                        )}
                      </p>
                    )}
                  </>
                )}
              </div>
              <div className="space-y-2 border-t pt-4">
                <Label className="text-sm font-medium">이월 연차 (전년도 미사용분, 일)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={annualCarryOver}
                  onChange={(e: any) => setAnnualCarryOver(e.target.value)}
                  placeholder="0"
                  className="w-32"
                />
              </div>
              {canEditPermissions && (
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
                    현재 역할({roleDisplayLabel(role)})에 따른 기본 기능이 적용됩니다. 위 체크 시 계정별로 사용할 기능만 골라 지정할 수 있습니다.
                  </p>
                )}
              </div>
              )}
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

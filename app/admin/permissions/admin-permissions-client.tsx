"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";
import { formatUserName } from "@/lib/utils";
import { parsePermissions } from "@/lib/permissions";

export type PositionPermissionRow = {
  id: string;
  name: string;
  sortOrder: number;
  permissions: string | null;
};

export type UserPermissionRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  position: string;
  permissions: string | null;
};

function permissionSourceLabel(
  user: UserPermissionRow,
  positionByName: Map<string, string | null>
): "개별" | "직책 템플릿" | "역할 기본" {
  const u = parsePermissions(user.permissions);
  if (u !== null) return "개별";
  const pos = user.position?.trim();
  if (pos) {
    const tmpl = positionByName.get(pos);
    if (parsePermissions(tmpl ?? null) !== null) return "직책 템플릿";
  }
  return "역할 기본";
}

export function AdminPermissionsClient({
  initialUsers,
  initialPositions,
}: {
  initialUsers: UserPermissionRow[];
  initialPositions: PositionPermissionRow[];
}) {
  const [positions, setPositions] = useState(initialPositions);
  const [users, setUsers] = useState(initialUsers);
  const [features, setFeatures] = useState<{ key: string; label: string }[]>([]);
  const [userQuery, setUserQuery] = useState("");

  const [posDialog, setPosDialog] = useState<PositionPermissionRow | null>(null);
  const [posSelected, setPosSelected] = useState<string[]>([]);
  const [posUseTemplate, setPosUseTemplate] = useState(false);
  const [posSaving, setPosSaving] = useState(false);

  const [userDialog, setUserDialog] = useState<UserPermissionRow | null>(null);
  const [userSelected, setUserSelected] = useState<string[]>([]);
  const [userUseCustom, setUserUseCustom] = useState(false);
  const [userSaving, setUserSaving] = useState(false);

  const positionByName = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const p of positions) m.set(p.name, p.permissions);
    return m;
  }, [positions]);

  const loadFeatures = useCallback(async () => {
    const res = await fetch("/api/permissions/features");
    const data = res.ok ? await res.json() : [];
    setFeatures(Array.isArray(data) ? data : []);
  }, []);

  const refreshPositions = useCallback(async () => {
    const res = await fetch("/api/settings/positions");
    const data = res.ok ? await res.json() : [];
    if (Array.isArray(data)) setPositions(data);
  }, []);

  useEffect(() => {
    void loadFeatures();
  }, [loadFeatures]);

  const openPosition = (p: PositionPermissionRow) => {
    setPosDialog(p);
    const parsed = parsePermissions(p.permissions);
    if (parsed !== null) {
      setPosUseTemplate(true);
      setPosSelected(parsed);
    } else {
      setPosUseTemplate(false);
      setPosSelected([]);
    }
  };

  const savePosition = async () => {
    if (!posDialog || posSaving) return;
    setPosSaving(true);
    try {
      const body = { permissions: posUseTemplate ? posSelected : null };
      const res = await fetch(`/api/settings/positions/${posDialog.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "저장 실패");
      await refreshPositions();
      toast.success("직책 권한이 저장되었습니다. 해당 직책 직원은 다시 로그인하면 반영됩니다.");
      setPosDialog(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setPosSaving(false);
    }
  };

  const openUser = (u: UserPermissionRow) => {
    setUserDialog(u);
    const parsed = parsePermissions(u.permissions);
    if (parsed !== null) {
      setUserUseCustom(true);
      setUserSelected(parsed);
    } else {
      setUserUseCustom(false);
      setUserSelected([]);
    }
  };

  const saveUser = async () => {
    if (!userDialog || userSaving) return;
    setUserSaving(true);
    try {
      const res = await fetch(`/api/users/${userDialog.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: userUseCustom ? userSelected : null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "저장 실패");
      setUsers((prev) =>
        prev.map((row) =>
          row.id === userDialog.id ? { ...row, permissions: (data as { permissions?: string | null }).permissions ?? null } : row
        )
      );
      toast.success("저장되었습니다. 해당 계정은 다시 로그인하면 메뉴 권한이 갱신됩니다.");
      setUserDialog(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setUserSaving(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.position.toLowerCase().includes(q)
    );
  }, [users, userQuery]);

  return (
    <>
      <Tabs defaultValue="positions" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="positions">직책(직급)별</TabsTrigger>
          <TabsTrigger value="users">사용자별</TabsTrigger>
        </TabsList>

        <TabsContent value="positions" className="mt-4 space-y-3">
          <p className="text-muted-foreground text-sm">
            마스터에 등록된 직책명과 직원 프로필의 직책이 같으면, 아래에서 지정한 기능이 적용됩니다. 개별 직원에 권한을 직접
            넣은 경우에는 직책 템플릿보다 개별 설정이 우선합니다.
          </p>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>직책</TableHead>
                  <TableHead>권한 템플릿</TableHead>
                  <TableHead className="w-[120px] text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground text-center">
                      등록된 직책이 없습니다.{" "}
                      <Link href="/admin/departments-positions" className="text-primary underline">
                        부서·직책
                      </Link>
                      에서 추가하세요.
                    </TableCell>
                  </TableRow>
                ) : (
                  positions.map((p) => {
                    const has = parsePermissions(p.permissions) !== null;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>
                          {has ? (
                            <Badge variant="secondary">직접 지정됨</Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">역할(role) 기본값 따름</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => openPosition(p)}>
                            <Settings2 className="size-3.5" />
                            설정
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="users" className="mt-4 space-y-3">
          <p className="text-muted-foreground text-sm">
            계정별로 메뉴·기능 접근을 덮어쓸 수 있습니다. 이름·이메일·부서 프로필 전체는{" "}
            <Link href="/admin/employees" className="text-primary underline">
              직원 관리
            </Link>
            에서 수정하세요.
          </p>
          <Input
            placeholder="이름·이메일·직책 검색"
            value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)}
            className="max-w-md"
          />
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>이메일</TableHead>
                  <TableHead>직책</TableHead>
                  <TableHead>적용 방식</TableHead>
                  <TableHead className="w-[100px] text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground text-center">
                      검색 결과가 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{formatUserName(u)}</TableCell>
                      <TableCell className="text-sm">{u.email}</TableCell>
                      <TableCell>{u.position ? <Badge variant="outline">{u.position}</Badge> : "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{permissionSourceLabel(u, positionByName)}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button type="button" variant="outline" size="sm" onClick={() => openUser(u)}>
                          권한
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!posDialog} onOpenChange={(open) => !open && setPosDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>직책 권한 — {posDialog?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm">이 직책에 기능 목록 지정</Label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={posUseTemplate}
                  onChange={(e) => {
                    setPosUseTemplate(e.target.checked);
                    if (!e.target.checked) setPosSelected([]);
                  }}
                  className="rounded border-gray-300"
                />
                사용
              </label>
            </div>
            {posUseTemplate && (
              <div className="max-h-56 space-y-2 overflow-y-auto rounded border bg-muted/30 p-3">
                {features.map((f) => (
                  <label key={f.key} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={posSelected.includes(f.key)}
                      onChange={(e) => {
                        setPosSelected((prev) =>
                          e.target.checked ? [...prev, f.key] : prev.filter((k) => k !== f.key)
                        );
                      }}
                      className="rounded border-gray-300"
                    />
                    <span>{f.label}</span>
                    <span className="text-muted-foreground text-xs">({f.key})</span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-muted-foreground text-xs">
              사용을 끄면 이 직책에 배정된 직원은 개별 권한이 없을 때 역할(role) 기본 메뉴를 따릅니다.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPosDialog(null)} disabled={posSaving}>
              취소
            </Button>
            <Button type="button" onClick={() => void savePosition()} disabled={posSaving}>
              {posSaving ? "저장 중…" : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!userDialog} onOpenChange={(open) => !open && setUserDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>개별 권한 — {userDialog ? formatUserName(userDialog) : ""}</DialogTitle>
          </DialogHeader>
          {userDialog && (
            <div className="grid gap-4 py-2">
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">이메일</Label>
                <p className="text-sm">{userDialog.email}</p>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm">역할 기본값 대신 직접 지정</Label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={userUseCustom}
                    onChange={(e) => {
                      setUserUseCustom(e.target.checked);
                      if (!e.target.checked) setUserSelected([]);
                    }}
                    className="rounded border-gray-300"
                  />
                  사용
                </label>
              </div>
              {userUseCustom && (
                <div className="max-h-56 space-y-2 overflow-y-auto rounded border bg-muted/30 p-3">
                  {features.map((f) => (
                    <label key={f.key} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={userSelected.includes(f.key)}
                        onChange={(e) => {
                          setUserSelected((prev) =>
                            e.target.checked ? [...prev, f.key] : prev.filter((k) => k !== f.key)
                          );
                        }}
                        className="rounded border-gray-300"
                      />
                      <span>{f.label}</span>
                      <span className="text-muted-foreground text-xs">({f.key})</span>
                    </label>
                  ))}
                </div>
              )}
              <p className="text-muted-foreground text-xs">
                사용을 끄면 DB의 개별 권한이 제거되고, 직책 템플릿(있으면) 또는 역할 기본값이 적용됩니다.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setUserDialog(null)} disabled={userSaving}>
              취소
            </Button>
            <Button type="button" onClick={() => void saveUser()} disabled={userSaving}>
              {userSaving ? "저장 중…" : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

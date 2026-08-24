"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FolderPickerModal,
  type FolderPickerSelection,
} from "@/components/drive/folder-picker-modal";
import { toast } from "sonner";

type Rule = {
  id: string;
  googleFolderId: string;
  folderName: string;
  targetType: "DEPARTMENT" | "USER";
  department: string | null;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  role: "READER" | "WRITER";
  lastSyncedAt: string | null;
  lastSyncSummary: string | null;
  lastSyncErrors: { email: string; reason: string }[] | null;
  needsResync: boolean;
};

type UserRow = { id: string; name: string; email: string; department: string | null };
type DeptRow = { id: string; name: string };

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "실패");
    return j;
  });

export function DriveSharesClient() {
  const { data, error, isLoading, mutate } = useSWR<{ rules: Rule[] }>(
    "/api/drive/team-share",
    fetcher
  );
  const { data: depts } = useSWR<DeptRow[]>("/api/settings/departments", fetcher);
  const { data: usersRaw } = useSWR<UserRow[]>("/api/users/list", fetcher);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [folder, setFolder] = useState<FolderPickerSelection | null>(null);
  const [targetType, setTargetType] = useState<"DEPARTMENT" | "USER">("DEPARTMENT");
  const [department, setDepartment] = useState("");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<"READER" | "WRITER">("WRITER");
  const [saving, setSaving] = useState(false);
  const [syncingFolder, setSyncingFolder] = useState<string | null>(null);

  const users = useMemo(() => (Array.isArray(usersRaw) ? usersRaw : []), [usersRaw]);

  const grouped = useMemo(() => {
    const map = new Map<string, Rule[]>();
    for (const r of data?.rules ?? []) {
      const list = map.get(r.googleFolderId) ?? [];
      list.push(r);
      map.set(r.googleFolderId, list);
    }
    return [...map.entries()];
  }, [data?.rules]);

  const startAdd = () => {
    setFolder(null);
    setTargetType("DEPARTMENT");
    setDepartment("");
    setUserId("");
    setRole("WRITER");
    setPickerOpen(true);
  };

  const onFolderPicked = (sel: FolderPickerSelection) => {
    setFolder(sel);
    setFormOpen(true);
  };

  const createRule = async () => {
    if (!folder) {
      toast.error("폴더를 선택하세요.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/drive/team-share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleFolderId: folder.driveFolderId,
          folderName: folder.name,
          targetType,
          department: targetType === "DEPARTMENT" ? department : undefined,
          userId: targetType === "USER" ? userId : undefined,
          role,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "등록 실패");
      toast.success("규칙을 등록했습니다. 동기화를 실행하세요.");
      setFormOpen(false);
      setFolder(null);
      await mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "등록 실패");
    } finally {
      setSaving(false);
    }
  };

  const syncFolder = async (googleFolderId: string) => {
    setSyncingFolder(googleFolderId);
    try {
      const res = await fetch("/api/drive/team-share/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleFolderId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "동기화 실패");
      const fails = Array.isArray(body.failures) ? body.failures : [];
      toast.success(body.summary || "동기화 완료");
      if (fails.length > 0) {
        toast.message(
          `실패 ${fails.length}건: ` +
            fails
              .slice(0, 3)
              .map((f: { email: string }) => f.email)
              .join(", ")
        );
      }
      await mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "동기화 실패");
    } finally {
      setSyncingFolder(null);
    }
  };

  const deleteRule = async (rule: Rule) => {
    if (!window.confirm("이 공유 규칙을 삭제할까요?")) return;
    const doRevoke = window.confirm("구글 Drive 권한도 함께 회수(동기화)할까요?");

    try {
      const res = await fetch(
        `/api/drive/team-share/${encodeURIComponent(rule.id)}${doRevoke ? "?revoke=1" : ""}`,
        { method: "DELETE" }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "삭제 실패");
      toast.success(doRevoke ? "삭제 및 회수 동기화 완료" : "규칙만 삭제했습니다.");
      await mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제 실패");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          폴더 단위로 부서·직원 Google Drive 권한을 동기화합니다. (파일별 JIT 대신)
        </p>
        <Button type="button" size="sm" className="gap-1" onClick={startAdd}>
          <Plus className="size-4" />
          규칙 추가
        </Button>
      </div>

      {formOpen && folder && (
        <div className="space-y-3 rounded-lg border bg-white p-4">
          <p className="text-sm font-medium">
            폴더: <span className="text-sky-800">{folder.name}</span>
          </p>
          <div className="flex flex-wrap gap-3">
            <Select
              value={targetType}
              onValueChange={(v) => setTargetType(v as "DEPARTMENT" | "USER")}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="대상" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DEPARTMENT">부서</SelectItem>
                <SelectItem value="USER">개별 직원</SelectItem>
              </SelectContent>
            </Select>
            {targetType === "DEPARTMENT" ? (
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="부서 선택" />
                </SelectTrigger>
                <SelectContent>
                  {(Array.isArray(depts) ? depts : []).map((d) => (
                    <SelectItem key={d.id} value={d.name}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder="직원 선택" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={role} onValueChange={(v) => setRole(v as "READER" | "WRITER")}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="READER">보기</SelectItem>
                <SelectItem value="WRITER">편집</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={saving} onClick={() => void createRule()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "등록"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setFormOpen(false);
                setFolder(null);
              }}
            >
              취소
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> 불러오는 중…
        </p>
      ) : error ? (
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      ) : grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground">등록된 규칙이 없습니다.</p>
      ) : (
        <div className="space-y-4">
          {grouped.map(([folderId, rules]) => {
            const head = rules[0]!;
            const needs = rules.some((r) => r.needsResync);
            const errors = rules.find(
              (r) => Array.isArray(r.lastSyncErrors) && r.lastSyncErrors.length > 0
            )?.lastSyncErrors;
            return (
              <div key={folderId} className="overflow-hidden rounded-lg border bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2">
                  <div>
                    <p className="font-medium">{head.folderName}</p>
                    <p className="text-xs text-muted-foreground">
                      {head.lastSyncSummary ?? "미동기화"}
                      {head.lastSyncedAt
                        ? ` · ${new Date(head.lastSyncedAt).toLocaleString("ko-KR")}`
                        : ""}
                      {needs ? (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">
                          재동기화 필요
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    disabled={syncingFolder === folderId}
                    onClick={() => void syncFolder(folderId)}
                  >
                    {syncingFolder === folderId ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3.5" />
                    )}
                    동기화
                  </Button>
                </div>
                <ul className="divide-y">
                  {rules.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
                      <span className="min-w-[140px]">
                        {r.targetType === "DEPARTMENT"
                          ? `부서: ${r.department}`
                          : `직원: ${r.userName ?? r.userEmail}`}
                      </span>
                      <span className="text-muted-foreground">
                        {r.role === "WRITER" ? "편집" : "보기"}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="ml-auto text-rose-700"
                        onClick={() => void deleteRule(r)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
                {errors && errors.length > 0 && (
                  <div className="border-t bg-rose-50 px-4 py-2 text-xs text-rose-900">
                    실패:{" "}
                    {errors.map((e) => `${e.email} (${e.reason.slice(0, 80)})`).join(" · ")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <FolderPickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        initialDriveFolderId={null}
        initialDbId={null}
        onConfirm={onFolderPicked}
        title="공유할 폴더 선택"
        description="규칙을 걸 탐색기 폴더를 고른 뒤 「여기에 저장」을 누르세요."
      />
    </div>
  );
}

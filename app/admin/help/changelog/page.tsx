"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type Note = {
  id: string;
  version: string;
  releasedAt: string;
  title: string;
  bodyMd: string;
  category: string;
};

const CATS = ["feature", "fix", "breaking"] as const;

function toLocalInput(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminHelpChangelogPage() {
  const [rows, setRows] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [category, setCategory] = useState<string>("feature");
  const [releasedAt, setReleasedAt] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/help/release-notes", { credentials: "include" });
      const data = res.ok ? ((await res.json()) as Note[]) : [];
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
      toast.error("목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setVersion("");
    setTitle("");
    setBodyMd("");
    setCategory("feature");
    setReleasedAt(toLocalInput(new Date().toISOString()));
  };

  const startNew = () => {
    resetForm();
    setEditingId("__new__");
  };

  const startEdit = (n: Note) => {
    setEditingId(n.id);
    setVersion(n.version);
    setTitle(n.title);
    setBodyMd(n.bodyMd);
    setCategory(n.category);
    setReleasedAt(toLocalInput(n.releasedAt));
  };

  const submit = async () => {
    const v = version.trim();
    const t = title.trim();
    if (!v || !t) {
      toast.error("버전과 제목을 입력하세요.");
      return;
    }
    const releasedIso = releasedAt ? new Date(releasedAt).toISOString() : new Date().toISOString();
    if (Number.isNaN(new Date(releasedIso).getTime())) {
      toast.error("날짜 형식이 올바르지 않습니다.");
      return;
    }

    try {
      if (editingId === "__new__") {
        const res = await fetch("/api/help/release-notes", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: v, title: t, bodyMd, category, releasedAt: releasedIso }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          toast.error(j.error ?? "생성 실패");
          return;
        }
        toast.success("릴리즈 노트를 게시했습니다.");
        resetForm();
        await load();
        return;
      }

      if (editingId && editingId !== "__new__") {
        const res = await fetch(`/api/help/release-notes/${encodeURIComponent(editingId)}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: v, title: t, bodyMd, category, releasedAt: releasedIso }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          toast.error(j.error ?? "수정 실패");
          return;
        }
        toast.success("저장했습니다.");
        resetForm();
        await load();
      }
    } catch {
      toast.error("요청 중 오류가 났습니다.");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("이 릴리즈 노트를 삭제할까요?")) return;
    try {
      const res = await fetch(`/api/help/release-notes/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        toast.error("삭제 실패");
        return;
      }
      toast.success("삭제했습니다.");
      if (editingId === id) resetForm();
      await load();
    } catch {
      toast.error("삭제 중 오류");
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">릴리즈 노트 편집</h1>
          <p className="text-muted-foreground text-sm">
            저장 즉시 <Link className="text-primary underline" href="/help/changelog">/help/changelog</Link>에 반영됩니다.
          </p>
        </div>
        <Button type="button" onClick={startNew}>
          새 릴리즈 노트
        </Button>
      </div>

      {editingId ? (
        <div className="space-y-4 rounded-xl border border-border bg-card p-4 md:p-6">
          <h2 className="text-sm font-semibold">{editingId === "__new__" ? "새 항목" : "항목 수정"}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rn-version">버전</Label>
              <Input id="rn-version" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="v0.16.0" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rn-date">게시 일시</Label>
              <Input
                id="rn-date"
                type="datetime-local"
                value={releasedAt}
                onChange={(e) => setReleasedAt(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rn-title">제목</Label>
            <Input id="rn-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>카테고리</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rn-body">본문 (마크다운)</Label>
            <Textarea id="rn-body" value={bodyMd} onChange={(e) => setBodyMd(e.target.value)} rows={10} className="font-mono text-sm" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void submit()}>
              게시 / 저장
            </Button>
            <Button type="button" variant="outline" onClick={resetForm}>
              취소
            </Button>
          </div>
        </div>
      ) : null}

      <div>
        <h2 className="mb-3 text-sm font-semibold">목록</h2>
        {loading ? (
          <p className="text-muted-foreground text-sm">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">등록된 노트가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {rows.map((n) => (
              <li key={n.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-medium">{n.version}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {n.category}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate font-medium">{n.title}</p>
                  <p className="text-muted-foreground text-xs">{new Date(n.releasedAt).toLocaleString("ko-KR")}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={() => startEdit(n)}>
                    편집
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => void remove(n.id)} aria-label="삭제">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

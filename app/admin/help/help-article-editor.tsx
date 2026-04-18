"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { cn } from "@/lib/utils";

const CATEGORIES = ["getting-started", "mindmap", "tasks", "notifications", "admin"] as const;

type Tab = "edit" | "preview";

export function HelpArticleEditor({ slug }: { slug: string }) {
  const router = useRouter();
  const isNew = slug === "new";
  const [tab, setTab] = useState<Tab>("edit");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [slugInput, setSlugInput] = useState(isNew ? "" : slug);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("getting-started");
  const [summary, setSummary] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [orderIndex, setOrderIndex] = useState(0);
  const [isPublished, setIsPublished] = useState(true);
  const [targetRolesStr, setTargetRolesStr] = useState("");
  const [relatedSlugsStr, setRelatedSlugsStr] = useState("");

  const load = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/help/articles/${encodeURIComponent(slug)}?admin=1`, { credentials: "include" });
      if (!res.ok) throw new Error("load failed");
      const row = (await res.json()) as {
        slug: string;
        title: string;
        category: string;
        summary: string;
        bodyMd: string;
        orderIndex: number;
        isPublished: boolean;
        targetRoles: string[];
        relatedSlugs: string[];
      };
      setSlugInput(row.slug);
      setTitle(row.title);
      setCategory(row.category);
      setSummary(row.summary);
      setBodyMd(row.bodyMd);
      setOrderIndex(row.orderIndex);
      setIsPublished(row.isPublished);
      setTargetRolesStr(row.targetRoles.join(", "));
      setRelatedSlugsStr(row.relatedSlugs.join(", "));
    } catch {
      setTitle("");
    } finally {
      setLoading(false);
    }
  }, [isNew, slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const parseList = (s: string) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

  const save = async () => {
    setSaving(true);
    try {
      const targetRoles = parseList(targetRolesStr);
      const relatedSlugs = parseList(relatedSlugsStr);
      const payload = {
        title: title.trim(),
        category,
        summary: summary.trim() || title.trim(),
        bodyMd,
        orderIndex,
        isPublished,
        targetRoles,
        relatedSlugs,
      };

      if (isNew) {
        const newSlug = slugInput.trim().toLowerCase();
        if (!/^[a-z0-9-]{1,128}$/.test(newSlug)) {
          alert("slug은 소문자 영문, 숫자, 하이픈만 사용하세요.");
          setSaving(false);
          return;
        }
        const res = await fetch("/api/help/articles", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: newSlug, ...payload }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          alert(j.error ?? "저장 실패");
          setSaving(false);
          return;
        }
        router.replace(`/admin/help/articles/${newSlug}`);
        router.refresh();
        return;
      }

      const res = await fetch(`/api/help/articles/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        alert(j.error ?? "저장 실패");
        setSaving(false);
        return;
      }
      router.refresh();
      alert("저장되었습니다.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (isNew) return;
    if (!confirm(`문서 "${slug}" 를 삭제할까요?`)) return;
    const res = await fetch(`/api/help/articles/${encodeURIComponent(slug)}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      alert("삭제 실패");
      return;
    }
    router.replace("/admin/help");
    router.refresh();
  };

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center text-muted-foreground text-sm">불러오는 중…</div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">{isNew ? "새 도움말 문서" : "문서 편집"}</h1>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setTab("edit")} className={cn(tab === "edit" && "bg-muted")}>
            편집
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setTab("preview")} className={cn(tab === "preview" && "bg-muted")}>
            미리보기
          </Button>
        </div>
      </div>

      {isNew && (
        <div className="space-y-2">
          <Label htmlFor="slug">slug (URL)</Label>
          <Input
            id="slug"
            value={slugInput}
            onChange={(e) => setSlugInput(e.target.value.toLowerCase())}
            placeholder="예: my-new-guide"
            className="font-mono text-sm"
          />
        </div>
      )}

      {tab === "edit" ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">제목</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="summary">요약 (목록·검색용)</Label>
            <Textarea id="summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} className="resize-y" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>카테고리</Label>
              <select
                className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="order">정렬 순서</Label>
              <Input
                id="order"
                type="number"
                value={orderIndex}
                onChange={(e) => setOrderIndex(Number(e.target.value) || 0)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="pub"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="size-4 rounded border"
            />
            <Label htmlFor="pub" className="font-normal">
              게시 (비공개 시 일반 사용자에게 숨김)
            </Label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="roles">대상 역할 (쉼표 구분, 비우면 전체)</Label>
            <Input id="roles" value={targetRolesStr} onChange={(e) => setTargetRolesStr(e.target.value)} placeholder="ADMIN" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="related">관련 slug (쉼표 구분)</Label>
            <Input id="related" value={relatedSlugsStr} onChange={(e) => setRelatedSlugsStr(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="body">본문 (Markdown)</Label>
            <Textarea
              id="body"
              value={bodyMd}
              onChange={(e) => setBodyMd(e.target.value)}
              rows={18}
              className="resize-y font-mono text-sm leading-relaxed"
            />
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-4">
          <MarkdownRenderer content={bodyMd || "*내용 없음*"} />
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button type="button" onClick={() => void save()} disabled={saving || !title.trim()}>
          {saving ? "저장 중…" : "저장"}
        </Button>
        {!isNew && (
          <Button type="button" variant="destructive" onClick={() => void remove()}>
            삭제
          </Button>
        )}
      </div>
    </div>
  );
}

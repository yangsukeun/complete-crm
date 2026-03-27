"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

export type QuoteProjectSuggestPayload = {
  quoteId: string;
  title: string;
  finalAmount: number;
  validUntil: string;
};

function formatWon(n: number) {
  return `${new Intl.NumberFormat("ko-KR").format(n)}원`;
}

type BrandOpt = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: QuoteProjectSuggestPayload | null;
  onSkip: () => void;
};

export function QuoteProjectSuggestModal({ open, onOpenChange, quote, onSkip }: Props) {
  const router = useRouter();
  const [brands, setBrands] = useState<BrandOpt[]>([]);
  const [brandId, setBrandId] = useState<string>("");
  const [createLeadTask, setCreateLeadTask] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCreateLeadTask(true);
    fetch("/api/brands")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: BrandOpt[]) => {
        const arr = Array.isArray(list) ? list : [];
        setBrands(arr);
        setBrandId((prev) => (prev && arr.some((b) => b.id === prev) ? prev : arr[0]?.id ?? ""));
      })
      .catch(() => {
        setBrands([]);
        setBrandId("");
      });
  }, [open, quote?.quoteId]);

  const handleSkip = () => {
    onOpenChange(false);
    onSkip();
  };

  const handleCreate = async () => {
    if (!quote) return;
    if (!brandId) {
      toast.error("브랜드를 선택하세요.");
      return;
    }
    const name = quote.title.trim();
    if (!name) {
      toast.error("프로젝트명으로 사용할 견적 건명이 없습니다.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId,
          name,
          quoteId: quote.quoteId,
          createLeadTask,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "프로젝트를 만들 수 없습니다.");
      }
      const projectId = data?.id as string | undefined;
      toast.success("프로젝트가 생성되었습니다.");
      onOpenChange(false);
      if (projectId) {
        router.push(`/projects/${projectId}`);
      } else {
        router.refresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "프로젝트를 만들 수 없습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!quote) return null;

  const dueLabel = (() => {
    try {
      return format(new Date(quote.validUntil), "yyyy년 MM월 dd일", { locale: ko });
    } catch {
      return quote.validUntil.slice(0, 10);
    }
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>프로젝트를 생성하시겠습니까?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground leading-relaxed">
            견적서·마감일·금액을 반영해 프로젝트를 만들 수 있습니다. 생성 후 프로젝트 상세로 이동합니다.
          </p>
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
            <p>
              <span className="text-muted-foreground">견적서: </span>
              <span className="font-medium">{quote.title}</span>
            </p>
            <p>
              <span className="text-muted-foreground">금액: </span>
              <span className="font-medium tabular-nums">{formatWon(quote.finalAmount)}</span>
            </p>
            <p>
              <span className="text-muted-foreground">마감일: </span>
              <span className="font-medium">{dueLabel}</span>
            </p>
          </div>
          <div className="grid gap-2">
            <Label>브랜드</Label>
            <Select value={brandId} onValueChange={setBrandId} disabled={brands.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={brands.length === 0 ? "브랜드 없음" : "브랜드 선택"} />
              </SelectTrigger>
              <SelectContent>
                {brands.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {brands.length === 0 && (
              <p className="text-xs text-muted-foreground">관리 메뉴에서 브랜드를 먼저 등록해 주세요.</p>
            )}
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={createLeadTask}
              onCheckedChange={(v) => setCreateLeadTask(v === true)}
            />
            <span>대표 프로젝트 자동 생성 ({quote.title.trim() || "프로젝트"} 완료 · 마감 동일 · 본인 담당)</span>
          </label>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={handleSkip} disabled={submitting}>
            건너뛰기
          </Button>
          <Button type="button" onClick={handleCreate} disabled={submitting || !brandId}>
            {submitting ? "생성 중…" : "프로젝트 생성"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

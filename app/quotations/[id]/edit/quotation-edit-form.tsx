"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { PageHeadline } from "@/components/page-headline";
import { ArrowLeft, Plus, Trash2, Save, Eye } from "lucide-react";
import { type QuotationItemInput } from "../../actions";
import {
  QuoteProjectSuggestModal,
  type QuoteProjectSuggestPayload,
} from "@/components/quote-project-suggest-modal";

type QuotationEditFormProps = {
  quotationId: string;
  initial: {
    quotationNumber: string;
    title: string;
    clientName: string;
    issuedAt: string;
    validUntil: string;
    remarks: string | null;
    projectId: string | null;
    items: { description: string; quantity: number; unitPrice: number; amount: number }[];
  };
};

function formatYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function QuotationEditForm({ quotationId, initial }: QuotationEditFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [clientName, setClientName] = useState(initial.clientName);
  const [issuedAt, setIssuedAt] = useState(initial.issuedAt.slice(0, 10) || formatYMD(new Date()));
  const [validUntil, setValidUntil] = useState(
    initial.validUntil.slice(0, 10) || formatYMD(new Date())
  );
  const [remarks, setRemarks] = useState(initial.remarks ?? "");
  const [finalAmountOverride, setFinalAmountOverride] = useState<string>("");
  const [items, setItems] = useState<QuotationItemInput[]>(
    initial.items.length > 0
      ? initial.items.map((i: any) => ({
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          amount: i.amount,
        }))
      : [{ description: "", quantity: 1, unitPrice: 0, amount: 0 }]
  );
  const [saving, setSaving] = useState(false);
  const [projectSuggestOpen, setProjectSuggestOpen] = useState(false);
  const [projectSuggestQuote, setProjectSuggestQuote] = useState<QuoteProjectSuggestPayload | null>(null);
  const [afterSkipToPreview, setAfterSkipToPreview] = useState(false);

  const updateItem = (index: number, patch: Partial<QuotationItemInput>) => {
    setItems((prev: any) => {
      const next = [...prev];
      const row = { ...next[index], ...patch };
      if ("quantity" in patch || "unitPrice" in patch) {
        row.amount = row.quantity * row.unitPrice;
      }
      next[index] = row;
      return next;
    });
  };

  const addRow = () =>
    setItems((prev: any) => [...prev, { description: "", quantity: 1, unitPrice: 0, amount: 0 }]);
  const removeRow = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev: any) => prev.filter((_: any, i: any) => i !== index));
  };

  const computedTotalAmount = items.reduce((sum, i) => sum + i.amount, 0);
  const computedVatAmount = Math.floor(computedTotalAmount * 0.1);
  const computedFinalAmount = computedTotalAmount + computedVatAmount;
  const overrideFinal = finalAmountOverride.trim() === "" ? null : Number(finalAmountOverride);
  const displayFinal =
    overrideFinal != null && Number.isFinite(overrideFinal) && overrideFinal >= 0
      ? Math.floor(overrideFinal)
      : computedFinalAmount;
  const displayTotal =
    overrideFinal != null && Number.isFinite(overrideFinal) && overrideFinal >= 0
      ? Math.round(displayFinal / 1.1)
      : computedTotalAmount;
  const displayVat =
    overrideFinal != null && Number.isFinite(overrideFinal) && overrideFinal >= 0
      ? displayFinal - displayTotal
      : computedVatAmount;

  const handleSave = async (openPreview: boolean) => {
    if (!title.trim()) {
      toast.error("건명을 입력하세요.");
      return;
    }
    if (!clientName.trim()) {
      toast.error("거래처명을 입력하세요.");
      return;
    }
    const validItems = items.filter((i: any) => i.description.trim() !== "" || i.amount > 0);
    if (validItems.length === 0) {
      toast.error("품목을 1개 이상 입력하세요.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/quotations/${quotationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          clientName: clientName.trim(),
          issuedAt,
          validUntil,
          items: validItems.map((i: any) => ({
            description: i.description.trim() || "(품목)",
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            amount: i.quantity * i.unitPrice,
          })),
          remarks: remarks.trim() || null,
          finalAmountOverride:
            overrideFinal != null && Number.isFinite(overrideFinal) && overrideFinal >= 0
              ? Math.floor(overrideFinal)
              : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "수정에 실패했습니다.");
        return;
      }
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      toast.success("견적서가 수정되었습니다.");
      if (initial.projectId) {
        if (openPreview) {
          router.push(`/quotations/${quotationId}`);
        } else {
          router.push("/quotations");
        }
        return;
      }
      const validIso = new Date(`${validUntil}T12:00:00`).toISOString();
      setAfterSkipToPreview(openPreview);
      setProjectSuggestQuote({
        quoteId: quotationId,
        title: title.trim(),
        finalAmount: displayFinal,
        validUntil: validIso,
      });
      setProjectSuggestOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "수정에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-4xl mx-auto">
      <QuoteProjectSuggestModal
        open={projectSuggestOpen}
        onOpenChange={setProjectSuggestOpen}
        quote={projectSuggestQuote}
        onSkip={() => {
          setProjectSuggestQuote(null);
          if (afterSkipToPreview) {
            router.push(`/quotations/${quotationId}`);
          } else {
            router.push("/quotations");
          }
        }}
      />
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/quotations/${quotationId}`}>
            <ArrowLeft className="mr-2 size-4" />
            견적서 보기
          </Link>
        </Button>
      </div>

      <PageHeadline
        title="견적서 수정"
        description={`문서번호 ${initial.quotationNumber} — 발행자만 수정할 수 있습니다.`}
      />

      <div className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950/50">
        <div className="grid gap-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="title">건명</Label>
              <Input
                id="title"
                value={title}
                onChange={(e: any) => setTitle(e.target.value)}
                placeholder="예: ○○ 프로젝트 인쇄물"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="clientName">거래처명</Label>
              <Input
                id="clientName"
                value={clientName}
                onChange={(e: any) => setClientName(e.target.value)}
                placeholder="(주)○○"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 sm:max-w-xl">
            <div className="grid gap-2">
              <Label htmlFor="issuedAt">발행일(작성일)</Label>
              <Input
                id="issuedAt"
                type="date"
                value={issuedAt}
                onChange={(e: any) => setIssuedAt(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">대시보드 월별 집계에 반영. 문서번호(EST-…)는 최초 저장 시 일자 기준입니다.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="validUntil">유효기간</Label>
              <Input
                id="validUntil"
                type="date"
                value={validUntil}
                onChange={(e: any) => setValidUntil(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <Label>품목</Label>
              <Button type="button" variant="outline" size="sm" onClick={addRow}>
                <Plus className="mr-2 size-4" />
                행 추가
              </Button>
            </div>
            <div className="rounded-lg border-2 border-slate-200 overflow-hidden dark:border-slate-800">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
                    <TableHead className="w-[40px] font-semibold">No</TableHead>
                    <TableHead className="font-semibold">품목명</TableHead>
                    <TableHead className="w-[100px] font-semibold text-right">수량</TableHead>
                    <TableHead className="w-[120px] font-semibold text-right">단가(원)</TableHead>
                    <TableHead className="w-[130px] font-semibold text-right">공급가액(원)</TableHead>
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((row, idx) => (
                    <TableRow key={idx} className="border-slate-200 dark:border-slate-800">
                      <TableCell className="font-medium text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell>
                        <Input
                          className="h-9 border-0 bg-transparent focus-visible:ring-1"
                          value={row.description}
                          onChange={(e: any) => updateItem(idx, { description: e.target.value })}
                          placeholder="품목명"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          className="h-9 text-right border-0 bg-transparent focus-visible:ring-1"
                          value={row.quantity || ""}
                          onChange={(e: any) =>
                            updateItem(idx, { quantity: parseInt(e.target.value, 10) || 0 })
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          className="h-9 text-right border-0 bg-transparent focus-visible:ring-1"
                          placeholder="원단위 (절사 시 -금액)"
                          value={row.unitPrice === 0 ? "" : row.unitPrice}
                          onChange={(e: any) => {
                            const v = e.target.value === "" ? 0 : Number(e.target.value);
                            updateItem(idx, { unitPrice: Number.isFinite(v) ? v : 0 });
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {new Intl.NumberFormat("ko-KR").format(row.amount)}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRow(idx)}
                          disabled={items.length <= 1}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3 sm:items-end">
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">총합계(부가세 포함) 직접 입력</Label>
                <Input
                  type="number"
                  min={0}
                  value={finalAmountOverride}
                  onChange={(e: any) => setFinalAmountOverride(e.target.value)}
                  placeholder={String(computedFinalAmount)}
                />
                <p className="text-[11px] text-muted-foreground">
                  입력 시 총합계에 맞춰 공급가/부가세를 원 단위로 조정합니다.
                </p>
              </div>
              <div className="flex flex-col gap-1 text-sm sm:items-end">
                <span className="text-muted-foreground">
                  공급가액: {new Intl.NumberFormat("ko-KR").format(displayTotal)}원
                </span>
                <span className="text-muted-foreground">
                  부가세(10%): {new Intl.NumberFormat("ko-KR").format(displayVat)}원
                </span>
              </div>
              <div className="text-sm font-semibold sm:text-right">
                총합계: {new Intl.NumberFormat("ko-KR").format(displayFinal)}원
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="remarks">특이사항 / 비고</Label>
            <Textarea
              id="remarks"
              value={remarks}
              onChange={(e: any) => setRemarks(e.target.value)}
              placeholder="선택 입력"
              rows={2}
              className="resize-none"
            />
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="bg-slate-800 hover:bg-slate-900"
            >
              <Save className="mr-2 size-4" />
              {saving ? "저장 중..." : "수정 저장"}
            </Button>
            <Button variant="outline" onClick={() => handleSave(true)} disabled={saving}>
              <Eye className="mr-2 size-4" />
              저장 후 보기
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

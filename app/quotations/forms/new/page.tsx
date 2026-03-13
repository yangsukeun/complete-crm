"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ArrowLeft, Plus, Trash2, Save } from "lucide-react";

type ItemRow = { description: string; quantity: number; unitPrice: number; amount: number };

const defaultItem = (): ItemRow => ({
  description: "",
  quantity: 1,
  unitPrice: 0,
  amount: 0,
});

export default function NewQuotationFormPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const role = session?.user?.role as string | undefined;
  const canAddForm = role === "EXECUTIVE" || role === "ADMIN";

  const [name, setName] = useState("");
  const [items, setItems] = useState<ItemRow[]>([defaultItem()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (session && !canAddForm) {
      toast.error("견적서 폼 추가는 관리자(대표/임원)만 가능합니다.");
      router.replace("/quotations/forms");
    }
  }, [session, canAddForm, router]);

  const updateItem = (index: number, patch: Partial<ItemRow>) => {
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

  const addRow = () => setItems((prev: any) => [...prev, defaultItem()]);
  const removeRow = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev: any) => prev.filter((_: any, i: any) => i !== index));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("폼명을 입력하세요.");
      return;
    }
    const validItems = items.filter((i: any) => i.description.trim() !== "" || i.amount > 0);
    const payload = validItems.length
      ? validItems.map((i: any) => ({
          description: i.description.trim() || "(품목)",
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        }))
      : [{ description: "", quantity: 1, unitPrice: 0 }];

    setSaving(true);
    try {
      const res = await fetch("/api/quotations/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), items: payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "저장에 실패했습니다.");
        return;
      }
      toast.success("견적서 폼이 추가되었습니다.");
      router.push("/quotations/forms");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (session && !canAddForm) {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6 max-w-4xl mx-auto items-center justify-center min-h-[40vh]">
        <p className="text-muted-foreground">견적서 폼 추가는 관리자(대표/임원)만 가능합니다.</p>
        <Button asChild variant="outline">
          <Link href="/quotations/forms">견적서 폼 목록으로</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/quotations/forms">
            <ArrowLeft className="mr-2 size-4" />
            견적서 폼
          </Link>
        </Button>
      </div>

      <PageHeadline
        title="견적서 폼 추가"
        description="자주 쓰는 품목 구성을 입력한 뒤 저장하면, 새 견적서 작성 시 이 폼을 불러와 사용할 수 있습니다."
      />

      <div className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950/50">
        <div className="grid gap-6">
          <div className="grid gap-2 max-w-md">
            <Label htmlFor="formName">폼명</Label>
            <Input
              id="formName"
              value={name}
              onChange={(e: any) => setName(e.target.value)}
              placeholder="예: 인쇄물 견적, 웹 개발 기본"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>품목 (기본값)</Label>
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
                          onChange={(e: any) => updateItem(idx, { quantity: parseInt(e.target.value, 10) || 0 })}
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
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving} className="bg-slate-800 hover:bg-slate-900">
              <Save className="mr-2 size-4" />
              {saving ? "저장 중..." : "폼 저장"}
            </Button>
            <Button variant="outline" asChild>
              <Link href="/quotations/forms">취소</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

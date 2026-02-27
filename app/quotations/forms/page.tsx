"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeadline } from "@/components/page-headline";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { ArrowLeft, Plus, FileText } from "lucide-react";

type FormRow = {
  id: string;
  name: string;
  items: { description: string; quantity: number; unitPrice: number }[];
  sortOrder: number;
  createdAt: string;
};

export default function QuotationFormsPage() {
  const { data: session } = useSession();

  const [list, setList] = useState<FormRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchList = useCallback(async () => {
    try {
      const res = await fetch("/api/quotations/forms");
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setList(Array.isArray(data) ? data : []);
    } catch {
      setList([]);
      toast.error("견적서 폼 목록을 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/quotations">
            <ArrowLeft className="mr-2 size-4" />
            견적서
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeadline
          title="견적서 폼"
          description="자주 쓰는 품목 구성을 폼으로 저장해 두고, 새 견적서 작성 시 불러와 사용할 수 있습니다."
        />
        <Button asChild className="bg-slate-800 hover:bg-slate-900 shrink-0">
          <Link href="/quotations/forms/new">
            <Plus className="mr-2 size-4" />
            폼 추가
          </Link>
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground py-8 text-center text-sm">목록을 불러오는 중...</p>
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30 py-12 text-center">
          <FileText className="mx-auto size-12 text-slate-400" />
          <p className="text-muted-foreground mt-2 text-sm">저장된 견적서 폼이 없습니다.</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/quotations/forms/new">
              <Plus className="mr-2 size-4" />
              폼 추가
            </Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-200 dark:border-slate-800">
                <TableHead className="font-medium">폼명</TableHead>
                <TableHead className="font-medium">품목 수</TableHead>
                <TableHead className="w-[100px] font-medium" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((f: any) => (
                <TableRow key={f.id} className="border-slate-200 dark:border-slate-800">
                  <TableCell className="font-medium">{f.name}</TableCell>
                  <TableCell className="text-muted-foreground">{f.items.length}개</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/quotations/new?formId=${f.id}`}>이 폼으로 작성</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

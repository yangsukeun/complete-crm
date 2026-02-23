"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeadline } from "@/components/page-headline";
import { toast } from "sonner";
import { FileText, Plus, LayoutTemplate } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

type Quotation = {
  id: string;
  quotationNumber: string;
  title: string;
  clientName: string;
  validUntil: string;
  finalAmount: number;
  status: string;
  issuedAt: string;
  issuedBy: { name: string };
};

const statusLabel: Record<string, string> = {
  DRAFT: "작성중",
  SENT: "발송",
  ACCEPTED: "수락",
  REJECTED: "거절",
};

const statusVariant: Record<string, "secondary" | "default" | "outline" | "destructive"> = {
  DRAFT: "secondary",
  SENT: "default",
  ACCEPTED: "outline",
  REJECTED: "destructive",
};

export default function QuotationsPage() {
  const { data: session, status } = useSession();
  const [list, setList] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchList = useCallback(async () => {
    try {
      const res = await fetch("/api/quotations");
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setList(Array.isArray(data) ? data : []);
    } catch {
      setList([]);
      toast.error("견적서 목록을 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") return;
    if (status === "loading") return;
    fetchList();
  }, [status, fetchList]);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">
          {status === "unauthenticated" ? "로그인이 필요합니다." : "불러오는 중..."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageHeadline
          title="스마트 견적서"
          description="견적서를 작성하고 PDF로 출력해 고객에게 전달하세요."
        />
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/quotations/forms">
              <LayoutTemplate className="mr-2 size-4" />
              견적서 폼
            </Link>
          </Button>
          <Button asChild className="bg-slate-800 hover:bg-slate-900">
            <Link href="/quotations/new">
              <Plus className="mr-2 size-4" />
              새 견적서 작성
            </Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground py-8 text-center text-sm">목록을 불러오는 중...</p>
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30 py-12 text-center">
          <FileText className="mx-auto size-12 text-slate-400" />
          <p className="text-muted-foreground mt-2 text-sm">등록된 견적서가 없습니다.</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/quotations/new">
              <Plus className="mr-2 size-4" />
              새 견적서 작성
            </Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-200 dark:border-slate-800">
                <TableHead className="font-medium">문서번호</TableHead>
                <TableHead className="font-medium">건명</TableHead>
                <TableHead className="font-medium">거래처</TableHead>
                <TableHead className="font-medium text-right">총합계</TableHead>
                <TableHead className="font-medium">상태</TableHead>
                <TableHead className="font-medium">발행일</TableHead>
                <TableHead className="w-[80px] font-medium" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((q) => (
                <TableRow key={q.id} className="border-slate-200 dark:border-slate-800">
                  <TableCell className="font-mono text-sm">{q.quotationNumber}</TableCell>
                  <TableCell className="font-medium">{q.title}</TableCell>
                  <TableCell>{q.clientName}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {new Intl.NumberFormat("ko-KR").format(q.finalAmount)}원
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[q.status] ?? "secondary"}>
                      {statusLabel[q.status] ?? q.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(q.issuedAt), "yyyy.MM.dd", { locale: ko })}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/quotations/${q.id}`}>보기</Link>
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

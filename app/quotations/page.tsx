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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, Plus, LayoutTemplate } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "@/lib/utils";

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

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "대기" },
  { value: "IN_PROGRESS", label: "작업중" },
  { value: "COMPLETED", label: "완료" },
  { value: "AWAITING_PAYMENT", label: "입금대기" },
  { value: "PAYMENT_COMPLETED", label: "입금완료" },
  { value: "SENT", label: "발송" },
  { value: "ACCEPTED", label: "수락" },
  { value: "REJECTED", label: "거절" },
] as const;

const statusLabel: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((o: any) => [o.value, o.label])
);

function StatusBadge({ status }: { status: string }) {
  const variant = {
    DRAFT: "secondary",
    SENT: "outline",
    ACCEPTED: "outline",
    REJECTED: "destructive",
    IN_PROGRESS: "default",
    COMPLETED: "secondary",
    AWAITING_PAYMENT: "destructive",
    PAYMENT_COMPLETED: "default",
  }[status] as "secondary" | "default" | "outline" | "destructive" | undefined;
  const className = {
    AWAITING_PAYMENT: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    PAYMENT_COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    IN_PROGRESS: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    COMPLETED: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  }[status];
  return (
    <Badge variant={variant} className={cn(className)}>
      {statusLabel[status] ?? status}
    </Badge>
  );
}

const FILTER_TABS = [
  { value: "", label: "전체보기" },
  { value: "IN_PROGRESS", label: "작업중" },
  { value: "COMPLETED", label: "완료" },
  { value: "AWAITING_PAYMENT", label: "입금대기" },
  { value: "PAYMENT_COMPLETED", label: "입금완료" },
  { value: "DRAFT", label: "대기" },
] as const;

export default function QuotationsPage() {
  const { data: session, status } = useSession();
  const [list, setList] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    try {
      const url = statusFilter
        ? `/api/quotations?status=${encodeURIComponent(statusFilter)}`
        : "/api/quotations";
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data?.error === "string" ? data.error : "견적서 목록을 불러올 수 없습니다.");
        setList([]);
        return;
      }
      if (data?.error) {
        toast.error(data.error);
        setList([]);
        return;
      }
      setList(Array.isArray(data) ? data : []);
    } catch {
      setList([]);
      toast.error("견적서 목록을 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (status === "unauthenticated") return;
    if (status === "loading") return;
    setLoading(true);
    fetchList();
  }, [status, fetchList]);

  const handleStatusChange = useCallback(async (quotationId: string, newStatus: string) => {
    setUpdatingId(quotationId);
    try {
      const res = await fetch(`/api/quotations/${quotationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "변경 실패");
      }
      setList((prev: any) =>
        prev.map((q: any) => (q.id === quotationId ? { ...q, status: newStatus } : q))
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "상태 변경에 실패했습니다.");
    } finally {
      setUpdatingId(null);
    }
  }, []);

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

      {/* 상태별 필터 탭 */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-50/50 p-1 dark:border-slate-800 dark:bg-slate-900/30">
        {FILTER_TABS.map((tab: any) => (
          <Button
            key={tab.value || "all"}
            variant={statusFilter === tab.value ? "secondary" : "ghost"}
            size="sm"
            className={cn(
              "shrink-0",
              statusFilter === tab.value && "bg-white shadow-sm dark:bg-slate-800"
            )}
            onClick={() => setStatusFilter(tab.value)}
          >
            {tab.label}
          </Button>
        ))}
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
              {list.map((q: any) => (
                <TableRow key={q.id} className="border-slate-200 dark:border-slate-800">
                  <TableCell className="font-mono text-sm">{q.quotationNumber}</TableCell>
                  <TableCell className="font-medium">{q.title}</TableCell>
                  <TableCell>{q.clientName}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {new Intl.NumberFormat("ko-KR").format(q.finalAmount)}원
                  </TableCell>
                  <TableCell>
                    <Select
                      value={q.status}
                      onValueChange={(v: any) => handleStatusChange(q.id, v)}
                      disabled={updatingId === q.id}
                    >
                      <SelectTrigger className="h-8 w-[140px] border-0 bg-transparent shadow-none hover:bg-slate-100 dark:hover:bg-slate-800">
                        <SelectValue>
                          <span className="inline-flex">
                            <StatusBadge status={q.status} />
                          </span>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((opt: any) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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

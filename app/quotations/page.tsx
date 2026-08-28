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
import { canApproveQuotationDelete } from "@/lib/quotation-delete-access";

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
  projectId: string | null;
  project?: { id: string; name: string } | null;
  deleteRequestedAt?: string | null;
  deleteRequestedBy?: { id: string; name: string } | null;
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

type QuotationsListJson = {
  items?: Quotation[];
  total?: number;
  hasMore?: boolean;
  error?: string;
};

export default function QuotationsPage() {
  const { status, data: session } = useSession();
  const canApproveDelete = canApproveQuotationDelete(session?.user?.role);
  const [list, setList] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [deleteRequestedOnly, setDeleteRequestedOnly] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  /** // [PERF-E] 견적 목록 페이지 크기 */
  const pageSize = 50;

  const loadPage = useCallback(
    async (offset: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (statusFilter) qs.set("status", statusFilter);
        if (deleteRequestedOnly) qs.set("deleteRequested", "1");
        qs.set("limit", String(pageSize));
        qs.set("offset", String(offset));
        const res = await fetch(`/api/quotations?${qs.toString()}`);
        const data = (await res.json().catch(() => ({}))) as QuotationsListJson | Quotation[];
        if (!res.ok) {
          toast.error(
            typeof (data as QuotationsListJson)?.error === "string"
              ? (data as QuotationsListJson).error!
              : "견적서 목록을 불러올 수 없습니다."
          );
          if (!append) setList([]);
          return;
        }
        if (
          data &&
          typeof data === "object" &&
          !Array.isArray(data) &&
          "error" in data &&
          data.error
        ) {
          toast.error(data.error);
          if (!append) setList([]);
          return;
        }
        const payload = data as QuotationsListJson;
        const items = Array.isArray(payload.items) ? payload.items : [];
        if (append) {
          setList((prev) => [...prev, ...items]);
        } else {
          setList(items);
        }
        setHasMore(payload.hasMore === true);
      } catch {
        if (!append) setList([]);
        toast.error("견적서 목록을 불러올 수 없습니다.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [statusFilter, deleteRequestedOnly, pageSize]
  );

  useEffect(() => {
    if (status === "unauthenticated" || status === "loading") return;
    void loadPage(0, false);
  }, [status, statusFilter, deleteRequestedOnly, loadPage]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loadingMore) return;
    void loadPage(list.length, true);
  }, [hasMore, loadingMore, list.length, loadPage]);

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

  const handleApproveDelete = useCallback(
    async (q: Quotation) => {
      if (
        !confirm(
          `삭제 요청을 승인하고 견적서 ${q.quotationNumber}를 삭제할까요?\n연결된 프로젝트·자금요청의 견적 연결은 해제됩니다.`
        )
      ) {
        return;
      }
      setUpdatingId(q.id);
      try {
        const res = await fetch(`/api/quotations/${q.id}/delete-request`, { method: "DELETE" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error ?? "삭제 실패");
        toast.success("견적서를 삭제했습니다.");
        setList((prev) => prev.filter((row) => row.id !== q.id));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
      } finally {
        setUpdatingId(null);
      }
    },
    []
  );

  const handleRejectDelete = useCallback(async (q: Quotation) => {
    if (!confirm("삭제 요청을 반려할까요?")) return;
    setUpdatingId(q.id);
    try {
      const res = await fetch(`/api/quotations/${q.id}/delete-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "반려 실패");
      toast.success("삭제 요청을 반려했습니다.");
      setList((prev) =>
        prev.map((row) =>
          row.id === q.id ? { ...row, deleteRequestedAt: null, deleteRequestedBy: null } : row
        )
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "반려에 실패했습니다.");
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
            variant={!deleteRequestedOnly && statusFilter === tab.value ? "secondary" : "ghost"}
            size="sm"
            className={cn(
              "shrink-0",
              !deleteRequestedOnly && statusFilter === tab.value && "bg-white shadow-sm dark:bg-slate-800"
            )}
            onClick={() => {
              setDeleteRequestedOnly(false);
              setStatusFilter(tab.value);
            }}
          >
            {tab.label}
          </Button>
        ))}
        {canApproveDelete ? (
          <Button
            variant={deleteRequestedOnly ? "secondary" : "ghost"}
            size="sm"
            className={cn(
              "shrink-0",
              deleteRequestedOnly && "bg-white shadow-sm dark:bg-slate-800"
            )}
            onClick={() => {
              setStatusFilter("");
              setDeleteRequestedOnly(true);
            }}
          >
            삭제 요청
          </Button>
        ) : null}
      </div>

      {loading ? (
        <p className="text-muted-foreground py-8 text-center text-sm">목록을 불러오는 중...</p>
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30 py-12 text-center">
          <FileText className="mx-auto size-12 text-slate-400" />
          <p className="text-muted-foreground mt-2 text-sm">
            {deleteRequestedOnly ? "대기 중인 삭제 요청이 없습니다." : "등록된 견적서가 없습니다."}
          </p>
          {!deleteRequestedOnly ? (
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/quotations/new">
              <Plus className="mr-2 size-4" />
              새 견적서 작성
            </Link>
          </Button>
          ) : null}
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
                <TableHead className="font-medium">프로젝트</TableHead>
                <TableHead className="w-[200px] font-medium text-right" />
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
                    <div className="flex flex-col gap-1">
                      {q.projectId || q.project ? (
                        <Badge className="bg-emerald-600 hover:bg-emerald-600 font-normal">프로젝트 연결됨</Badge>
                      ) : (
                        <Badge variant="secondary" className="font-normal text-muted-foreground">
                          프로젝트 없음
                        </Badge>
                      )}
                      {q.deleteRequestedAt ? (
                        <Badge
                          variant="outline"
                          className="border-amber-300 bg-amber-50 font-normal text-amber-900"
                        >
                          삭제 승인 대기
                          {q.deleteRequestedBy?.name ? ` · ${q.deleteRequestedBy.name}` : ""}
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      {canApproveDelete && q.deleteRequestedAt ? (
                        <>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={updatingId === q.id}
                            onClick={() => void handleApproveDelete(q)}
                          >
                            승인
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={updatingId === q.id}
                            onClick={() => void handleRejectDelete(q)}
                          >
                            반려
                          </Button>
                        </>
                      ) : null}
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/quotations/${q.id}`} prefetch={true}>
                          보기
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {hasMore && (
            <div className="border-t border-slate-200 p-3 text-center dark:border-slate-800">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loadingMore}
                onClick={handleLoadMore}
              >
                {loadingMore ? "불러오는 중…" : "더 보기"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

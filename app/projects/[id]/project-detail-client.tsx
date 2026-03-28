"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeadline } from "@/components/page-headline";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { ArrowLeft, FileText, Link2 } from "lucide-react";
import { UserNotesBoard } from "@/components/user-notes/user-notes-board";

type QuotationOption = {
  id: string;
  quotationNumber: string;
  title: string;
  finalAmount: number;
  projectId: string | null;
};

const QUOTE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "대기",
  SENT: "발송",
  ACCEPTED: "수락",
  REJECTED: "거절",
  IN_PROGRESS: "작업중",
  COMPLETED: "완료",
  AWAITING_PAYMENT: "입금대기",
  PAYMENT_COMPLETED: "입금완료",
};

const PAY_STATUS_LABEL: Record<string, string> = {
  PENDING: "신청됨",
  TEAM_LEAD_APPROVED: "팀장승인",
  COMPLETED: "이체완료",
  REJECTED: "거절",
};

function formatWon(n: number) {
  return `${new Intl.NumberFormat("ko-KR").format(n)}원`;
}

type ProjectPayload = {
  id: string;
  name: string;
  dueDate: string | null;
  quoteAmount: number;
  brand: { id: string; name: string };
  quote: {
    id: string;
    title: string;
    finalAmount: number;
    validUntil: string;
    status: string;
    issuedAt: string;
    quotationNumber: string;
  } | null;
  paymentRequests: {
    id: string;
    amount: number;
    status: string;
    requestedAt: string;
    completedAt: string | null;
    description: string | null;
  }[];
  paymentSummary: { quoted: number; paid: number; outstanding: number };
};

export function ProjectDetailClient({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [data, setData] = useState<ProjectPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkOpen, setLinkOpen] = useState(false);
  const [quotations, setQuotations] = useState<QuotationOption[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>("");
  const [linking, setLinking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json?.error === "string" ? json.error : "불러오지 못했습니다.");
      }
      setData(json as ProjectPayload);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "불러오지 못했습니다.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const openLinkDialog = async () => {
    setLinkOpen(true);
    setSelectedQuoteId("");
    try {
      const res = await fetch("/api/quotations");
      const list = await res.json().catch(() => []);
      const arr = Array.isArray(list) ? list : [];
      setQuotations(
        arr.map((q: { id: string; quotationNumber: string; title: string; finalAmount: number; projectId?: string | null }) => ({
          id: q.id,
          quotationNumber: q.quotationNumber,
          title: q.title,
          finalAmount: q.finalAmount,
          projectId: q.projectId ?? null,
        }))
      );
    } catch {
      setQuotations([]);
      toast.error("견적 목록을 불러오지 못했습니다.");
    }
  };

  const handleLinkQuote = async () => {
    if (!selectedQuoteId) {
      toast.error("견적서를 선택하세요.");
      return;
    }
    setLinking(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: selectedQuoteId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json?.error === "string" ? json.error : "연결에 실패했습니다.");
      }
      toast.success("견적서를 연결했습니다.");
      setLinkOpen(false);
      load();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "연결에 실패했습니다.");
    } finally {
      setLinking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-muted-foreground text-sm">불러오는 중…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-6">
        <p className="text-muted-foreground text-sm">프로젝트를 표시할 수 없습니다.</p>
        <Button variant="outline" asChild>
          <Link href="/quotations">견적서 목록</Link>
        </Button>
      </div>
    );
  }

  const q = data.quote;
  const sum = data.paymentSummary;

  return (
    <div className="flex flex-col gap-8 p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link href="/quotations">
              <ArrowLeft className="mr-2 size-4" />
              견적서 목록
            </Link>
          </Button>
          <PageHeadline
            title={`${data.brand.name} / ${data.name}`}
            description="연결된 견적서와 이체(입금) 요약을 확인합니다."
          />
        </div>
      </div>

      <section className="rounded-xl border-2 border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/50 space-y-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <FileText className="size-5" />
          연결된 견적서
        </h2>
        {q ? (
          <div className="space-y-3 text-sm">
            <div className="grid gap-1 sm:grid-cols-2">
              <p>
                <span className="text-muted-foreground">제목: </span>
                <span className="font-medium">{q.title}</span>
              </p>
              <p>
                <span className="text-muted-foreground">문서번호: </span>
                <span className="font-mono">{q.quotationNumber}</span>
              </p>
              <p>
                <span className="text-muted-foreground">금액: </span>
                <span className="font-medium tabular-nums">{formatWon(q.finalAmount)}</span>
              </p>
              <p>
                <span className="text-muted-foreground">발송일: </span>
                {format(new Date(q.issuedAt), "yyyy.MM.dd", { locale: ko })}
              </p>
              <p>
                <span className="text-muted-foreground">유효기간: </span>
                {format(new Date(q.validUntil), "yyyy.MM.dd", { locale: ko })}
              </p>
              <p className="flex items-center gap-2">
                <span className="text-muted-foreground">상태: </span>
                <Badge variant="outline">{QUOTE_STATUS_LABEL[q.status] ?? q.status}</Badge>
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/quotations/${q.id}`} prefetch={true}>
                견적서 보기
              </Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground text-sm">연결된 견적서가 없습니다.</p>
            <Button variant="secondary" size="sm" onClick={openLinkDialog}>
              <Link2 className="mr-2 size-4" />
              견적서 연결하기
            </Button>
          </div>
        )}
      </section>

      <section className="rounded-xl border-2 border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/50 space-y-4">
        <UserNotesBoard
          projectId={projectId}
          heading="프로젝트 메모"
          description="이 CRM 프로젝트에 연결된 메모입니다. 메모장의 글을 가져오거나 새로 적을 수 있습니다."
        />
      </section>

      <section className="rounded-xl border-2 border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/50 space-y-4">
        <h2 className="text-base font-semibold">연결된 이체</h2>
        {!q ? (
          <p className="text-muted-foreground text-sm">견적서를 연결하면 이체 내역이 표시됩니다.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/20 p-4 text-center text-sm">
              <div>
                <p className="text-muted-foreground text-xs">견적금액</p>
                <p className="font-semibold tabular-nums mt-1">{formatWon(sum.quoted)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">입금완료</p>
                <p className="font-semibold tabular-nums mt-1 text-emerald-700 dark:text-emerald-400">
                  {formatWon(sum.paid)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">미수금</p>
                <p className="font-semibold tabular-nums mt-1 text-amber-700 dark:text-amber-400">
                  {formatWon(sum.outstanding)}
                </p>
              </div>
            </div>
            {data.paymentRequests.length === 0 ? (
              <p className="text-muted-foreground text-sm">등록된 이체 신청이 없습니다.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>신청일</TableHead>
                    <TableHead className="text-right">금액</TableHead>
                    <TableHead>상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.paymentRequests.map((pr) => (
                    <TableRow key={pr.id}>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(pr.requestedAt), "yyyy.MM.dd HH:mm", { locale: ko })}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatWon(pr.amount)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{PAY_STATUS_LABEL[pr.status] ?? pr.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </section>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>견적서 연결</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            목록에서 견적서를 선택하면 이 프로젝트와 연결합니다. 이미 다른 프로젝트에 연결된 견적은 이동할 수 있습니다.
          </p>
          <Select value={selectedQuoteId} onValueChange={setSelectedQuoteId}>
            <SelectTrigger>
              <SelectValue placeholder="견적서 선택" />
            </SelectTrigger>
            <SelectContent className="max-h-[280px]">
              {quotations.map((opt) => (
                <SelectItem key={opt.id} value={opt.id}>
                  {opt.quotationNumber} — {opt.title} ({formatWon(opt.finalAmount)})
                  {opt.projectId && opt.projectId !== projectId ? " · 다른 프로젝트 있음" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>
              취소
            </Button>
            <Button onClick={handleLinkQuote} disabled={linking || !selectedQuoteId}>
              {linking ? "연결 중…" : "연결"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeadline } from "@/components/page-headline";
import { AuthorMetaLine } from "@/components/author-meta-line";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { HtmlEditorModeTabs, type HtmlEditorMode } from "@/components/html-editor-mode-tabs";
import { BoardPostContent, type BoardPostAttachmentItem } from "../../board/[id]/board-post-content";
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
import { ArrowLeft, FileText, Link2, Loader2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserNotesBoard } from "@/components/user-notes/user-notes-board";
import { useAutoReadOnEnter } from "@/hooks/use-auto-read-on-enter";
import { ExportDocumentButtons } from "@/components/export-document-buttons";
import { contentToPlainText } from "@/lib/export/plain-from-content";

const ContentBodyEditor = dynamic(
  () => import("@/components/content-body-editor").then((m) => ({ default: m.ContentBodyEditor })),
  { ssr: false }
);

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

const EMPTY_BOARD_ATTACHMENTS: BoardPostAttachmentItem[] = [];

function formatWon(n: number) {
  return `${new Intl.NumberFormat("ko-KR").format(n)}원`;
}

type ProjectPayload = {
  id: string;
  name: string;
  dueDate: string | null;
  quoteAmount: number;
  description?: string | null;
  contentType?: string | null;
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
  updatedAt?: string | null;
  createdBy?: { name: string } | null;
  lastEditedBy?: { name: string } | null;
};

export function ProjectDetailClient({ projectId, embed }: { projectId: string; embed?: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<ProjectPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkOpen, setLinkOpen] = useState(false);
  const [quotations, setQuotations] = useState<QuotationOption[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>("");
  const [linking, setLinking] = useState(false);
  const [bodyEditOpen, setBodyEditOpen] = useState(false);
  const [bodyContent, setBodyContent] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [editorMode, setEditorMode] = useState<HtmlEditorMode>("text");
  const [bodyEditorKey, setBodyEditorKey] = useState(0);
  const [bodySaving, setBodySaving] = useState(false);

  useAutoReadOnEnter(
    projectId
      ? {
          relatedType: "PROJECT",
          relatedId: projectId,
          linkFallback: [`/projects/${projectId}`],
        }
      : null,
    `project:${projectId ?? ""}`
  );

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
      // [PERF-E] 선택용 목록은 한 번에 최대 500건
      const res = await fetch("/api/quotations?limit=500&offset=0");
      const raw = await res.json().catch(() => ({}));
      const arr = Array.isArray(raw) ? raw : Array.isArray((raw as { items?: unknown }).items) ? (raw as { items: unknown[] }).items : [];
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

  const openBodyEdit = () => {
    if (!data) return;
    const ct = data.contentType ?? "text";
    const desc = data.description ?? "";
    if (ct === "html") {
      setEditorMode("html");
      setHtmlContent(desc);
      setBodyContent("");
    } else {
      setEditorMode("text");
      setBodyContent(desc);
      setHtmlContent("");
    }
    setBodyEditorKey((k) => k + 1);
    setBodyEditOpen(true);
  };

  const saveBody = async (e: React.FormEvent) => {
    e.preventDefault();
    setBodySaving(true);
    try {
      /** 텍스트 탭 = BlockNote(슬래시 메뉴 HTML 블록 포함). HTML/미리보기 탭은 전체 HTML 페이지 모드.
       *  미리보기만 보다가 HTML이 비어 있으면 본문(bodyContent)을 유지해 잘못 덮어쓰지 않음. */
      let description: string;
      let contentType: "text" | "html";
      if (editorMode === "text") {
        description = bodyContent.trim();
        contentType = "text";
      } else if (htmlContent.trim()) {
        description = htmlContent.trim();
        contentType = "html";
      } else {
        description = bodyContent.trim();
        contentType = "text";
      }

      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description || "",
          contentType,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json?.error === "string" ? json.error : "저장에 실패했습니다.");
      }
      toast.success("프로젝트 본문을 저장했습니다.");
      setBodyEditOpen(false);
      load();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setBodySaving(false);
    }
  };

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center", embed ? "min-h-[200px] py-8" : "min-h-[40vh]")}>
        <p className="text-muted-foreground text-sm">불러오는 중…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-3 p-6", embed ? "min-h-[160px]" : "min-h-[40vh]")}>
        <p className="text-muted-foreground text-sm">프로젝트를 표시할 수 없습니다.</p>
        {!embed && (
          <Button variant="outline" asChild>
            <Link href="/quotations">견적서 목록</Link>
          </Button>
        )}
      </div>
    );
  }

  const q = data.quote;
  const sum = data.paymentSummary;

  return (
    <div
      className={cn(
        "flex flex-col gap-8",
        embed ? "max-w-none gap-6 p-2 md:p-3" : "mx-auto max-w-4xl p-4 md:p-6"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          {!embed && (
            <Button variant="ghost" size="sm" asChild className="-ml-2">
              <Link href="/quotations">
                <ArrowLeft className="mr-2 size-4" />
                견적서 목록
              </Link>
            </Button>
          )}
          <PageHeadline
            title={`${data.brand.name} / ${data.name}`}
            description="연결된 견적서와 이체(입금) 요약을 확인합니다."
          />
          <AuthorMetaLine
            authorName={data.createdBy?.name}
            editorName={data.lastEditedBy?.name}
            dateIso={data.updatedAt}
            className="mt-1 block"
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <FileText className="size-5" />
            프로젝트 본문
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {(data.description ?? "").trim() ? (
              <ExportDocumentButtons
                title={`${data.brand.name} / ${data.name}`}
                bodyPlain={contentToPlainText(data.description, data.contentType)}
                fileBase={`project_${data.id}`}
                size="sm"
                variant="outline"
              />
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={openBodyEdit} className="gap-1">
              <Pencil className="size-4" />
              편집
            </Button>
          </div>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">
          게시판 본문과 동일합니다. 텍스트 탭은 BlockNote이며{" "}
          <kbd className="rounded border px-1 py-px text-[10px] text-foreground">/</kbd> 메뉴에서{" "}
          <span className="font-medium text-foreground">HTML 블록</span>(코드·미리보기)을 넣을 수 있습니다. 글 전체를 HTML로
          쓸 때는 HTML·미리보기 탭을 사용하세요.
        </p>
        {(data.description ?? "").trim() ? (
          <BoardPostContent
            description={data.description ?? ""}
            contentType={data.contentType ?? "text"}
            attachments={EMPTY_BOARD_ATTACHMENTS}
            attachmentPreviewContext={{ type: "project", projectId }}
          />
        ) : (
          <p className="text-muted-foreground text-sm py-4">본문이 없습니다. 편집에서 내용을 추가하세요.</p>
        )}
      </section>

      <section className="rounded-xl border-2 border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/50 space-y-4">
        <UserNotesBoard
          projectId={projectId}
          heading="프로젝트 메모"
          description="카드 단위 메모·자동 저장. 위 본문은 프로젝트 단위로 한 덩어리 저장됩니다."
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

      <Dialog open={bodyEditOpen} onOpenChange={setBodyEditOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-4 overflow-y-auto">
          <DialogHeader>
            <DialogTitle>프로젝트 본문 편집</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveBody} className="flex flex-col gap-4 min-h-0">
            <div className="space-y-2 min-h-0 flex-1">
              <Label>본문</Label>
              <HtmlEditorModeTabs
                editorMode={editorMode}
                setEditorMode={setEditorMode}
                htmlContent={htmlContent}
                setHtmlContent={setHtmlContent}
                htmlPageMode
                textEditor={
                  <ContentBodyEditor
                    key={bodyEditorKey}
                    initialContent={bodyContent}
                    onChange={setBodyContent}
                    minHeight="320px"
                    showHelp={true}
                  />
                }
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBodyEditOpen(false)}>
                취소
              </Button>
              <Button type="submit" disabled={bodySaving}>
                {bodySaving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                저장
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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

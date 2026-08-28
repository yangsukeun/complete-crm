"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useReactToPrint } from "react-to-print";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { PageHeadline } from "@/components/page-headline";
import { ArrowLeft, FileDown, Mail, Pencil, FolderKanban, Send, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import {
  QuoteProjectSuggestModal,
  type QuoteProjectSuggestPayload,
} from "@/components/quote-project-suggest-modal";

export type CompanyViewData = {
  name: string;
  businessNumber: string | null;
  representative: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  fax: string | null;
  stampImageUrl: string | null;
};

export type QuotationViewData = {
  id: string;
  quotationNumber: string;
  title: string;
  clientName: string;
  validUntil: string;
  totalAmount: number;
  vatAmount: number;
  finalAmount: number;
  status: string;
  issuedAt: string;
  updatedAt?: string;
  remarks: string | null;
  issuedBy: { name: string } | null;
  issuedById?: string | null;
  deleteRequestedAt?: string | null;
  deleteRequestedById?: string | null;
  deleteRequestedByName?: string | null;
  items: { description: string; quantity: number; unitPrice: number; amount: number }[];
};

export function QuotationView({
  quotation,
  company,
  canEdit = false,
  canApproveDelete = false,
  canRequestDelete = false,
  linkedProject = null,
}: {
  quotation: QuotationViewData;
  company: CompanyViewData | null;
  canEdit?: boolean;
  canApproveDelete?: boolean;
  canRequestDelete?: boolean;
  linkedProject?: { id: string; name: string } | null;
}) {
  const router = useRouter();
  const contentRef = useRef<HTMLDivElement>(null);
  const [mailOpen, setMailOpen] = useState(false);
  const [toEmail, setToEmail] = useState("");
  const [projectSuggestOpen, setProjectSuggestOpen] = useState(false);
  const [projectSuggestQuote, setProjectSuggestQuote] = useState<QuoteProjectSuggestPayload | null>(null);
  const [markingSent, setMarkingSent] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const deletePending = Boolean(quotation.deleteRequestedAt);

  const handlePrint = useReactToPrint({
    contentRef,
    documentTitle: `견적서_${quotation.quotationNumber}`,
    pageStyle: `
      @page { size: A4; margin: 12mm; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    `,
  });

  const openProjectSuggestFromQuotation = () => {
    setProjectSuggestQuote({
      quoteId: quotation.id,
      title: quotation.title,
      finalAmount: quotation.finalAmount,
      validUntil: quotation.validUntil,
    });
    setProjectSuggestOpen(true);
  };

  const handleMarkSentOrSuggest = async () => {
    if (!linkedProject && quotation.status === "SENT") {
      openProjectSuggestFromQuotation();
      return;
    }
    if (quotation.status === "SENT") {
      toast.message("이미 발송 상태입니다.");
      return;
    }
    setMarkingSent(true);
    try {
      const res = await fetch(`/api/quotations/${quotation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "SENT" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "상태를 바꿀 수 없습니다.");
      }
      toast.success("발송 완료로 표시했습니다.");
      if (!linkedProject) {
        openProjectSuggestFromQuotation();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "처리에 실패했습니다.");
    } finally {
      setMarkingSent(false);
    }
  };

  const handleSendMail = () => {
    const subject = encodeURIComponent(`[견적서] ${quotation.quotationNumber} - ${quotation.title}`);
    const bodyLines = [
      "안녕하세요.",
      "",
      "견적서를 보내드립니다.",
      `문서번호: ${quotation.quotationNumber}`,
      `건명: ${quotation.title}`,
      `거래처: ${quotation.clientName}`,
      "",
      "아래 링크에서 견적서를 확인하실 수 있습니다.",
      typeof window !== "undefined" ? `${window.location.origin}/quotations/${quotation.id}` : "",
      "",
      "감사합니다.",
    ];
    const body = encodeURIComponent(bodyLines.join("\n"));
    const to = toEmail.trim() ? `to=${encodeURIComponent(toEmail.trim())}&` : "";
    const mailto = `mailto:?${to}subject=${subject}&body=${body}`;
    window.location.href = mailto;
    setMailOpen(false);
    setToEmail("");
    toast.message("메일을 보낸 뒤에는 아래 '발송 완료 처리'를 눌러 주세요.", { duration: 6000 });
  };

  const handleRequestDelete = async () => {
    if (
      !confirm(
        `견적서 ${quotation.quotationNumber} 삭제를 팀장에게 요청할까요?\n승인되면 견적서가 삭제됩니다.`
      )
    ) {
      return;
    }
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/quotations/${quotation.id}/delete-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "요청에 실패했습니다.");
      toast.success("삭제 요청을 보냈습니다. 팀장 승인을 기다려 주세요.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "요청에 실패했습니다.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleCancelDeleteRequest = async () => {
    if (!confirm("삭제 요청을 취소할까요?")) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/quotations/${quotation.id}/delete-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "취소에 실패했습니다.");
      toast.success("삭제 요청을 취소했습니다.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "취소에 실패했습니다.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleRejectDeleteRequest = async () => {
    if (!confirm("삭제 요청을 반려할까요?")) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/quotations/${quotation.id}/delete-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "반려에 실패했습니다.");
      toast.success("삭제 요청을 반려했습니다.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "반려에 실패했습니다.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleApproveOrDirectDelete = async () => {
    const fromRequest = deletePending;
    const ok = confirm(
      fromRequest
        ? `삭제 요청을 승인하고 견적서 ${quotation.quotationNumber}를 삭제할까요?\n연결된 프로젝트·자금요청의 견적 연결은 해제됩니다.`
        : `견적서 ${quotation.quotationNumber}를 삭제할까요?\n팀장급만 삭제할 수 있습니다. 연결된 프로젝트·자금요청의 견적 연결은 해제됩니다.`
    );
    if (!ok) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(
        fromRequest ? `/api/quotations/${quotation.id}/delete-request` : `/api/quotations/${quotation.id}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "삭제에 실패했습니다.");
      toast.success("견적서를 삭제했습니다.");
      router.push("/quotations");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const issuedAtFormatted = format(new Date(quotation.issuedAt), "yyyy-MM-dd HH:mm:ss", { locale: ko });
  const updatedAtFormatted = quotation.updatedAt
    ? format(new Date(quotation.updatedAt), "yyyy-MM-dd HH:mm", { locale: ko })
    : null;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <QuoteProjectSuggestModal
        open={projectSuggestOpen}
        onOpenChange={setProjectSuggestOpen}
        quote={projectSuggestQuote}
        onSkip={() => {
          setProjectSuggestQuote(null);
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/quotations">
              <ArrowLeft className="mr-2 size-4" />
              견적서 목록
            </Link>
          </Button>
          <PageHeadline
            title={`견적서 ${quotation.quotationNumber}`}
            description="내용을 확인하고 PDF로 저장·인쇄하거나 메일로 보낼 수 있습니다."
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {linkedProject ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/projects/${linkedProject.id}`} prefetch={true}>
                <FolderKanban className="mr-2 size-4" />
                프로젝트 보기 ({linkedProject.name})
              </Link>
            </Button>
          ) : null}
          {canEdit && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/quotations/${quotation.id}/edit`} prefetch={true}>
                <Pencil className="mr-2 size-4" />
                수정
              </Link>
            </Button>
          )}
          {canRequestDelete && !deletePending ? (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive"
              disabled={deleteBusy}
              onClick={() => void handleRequestDelete()}
            >
              <Trash2 className="mr-2 size-4" />
              삭제 요청
            </Button>
          ) : null}
          {canRequestDelete && deletePending ? (
            <Button
              variant="outline"
              size="sm"
              disabled={deleteBusy}
              onClick={() => void handleCancelDeleteRequest()}
            >
              삭제 요청 취소
            </Button>
          ) : null}
          {canApproveDelete && deletePending ? (
            <>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleteBusy}
                onClick={() => void handleApproveOrDirectDelete()}
              >
                <Trash2 className="mr-2 size-4" />
                삭제 승인
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={deleteBusy}
                onClick={() => void handleRejectDeleteRequest()}
              >
                반려
              </Button>
            </>
          ) : null}
          {canApproveDelete && !deletePending ? (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive"
              disabled={deleteBusy}
              onClick={() => void handleApproveOrDirectDelete()}
            >
              <Trash2 className="mr-2 size-4" />
              삭제
            </Button>
          ) : null}
          {(quotation.status !== "SENT" || !linkedProject) && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleMarkSentOrSuggest}
              disabled={markingSent}
            >
              <Send className="mr-2 size-4" />
              {quotation.status !== "SENT"
                ? markingSent
                  ? "처리 중…"
                  : "발송 완료 처리"
                : "프로젝트 생성 제안"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setMailOpen(true)}>
            <Mail className="mr-2 size-4" />
            메일 보내기
          </Button>
          <Button onClick={handlePrint} className="bg-slate-800 hover:bg-slate-900">
            <FileDown className="mr-2 size-4" />
            PDF로 저장 / 인쇄
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {linkedProject ? (
          <Badge className="bg-emerald-600 hover:bg-emerald-600">프로젝트 연결됨</Badge>
        ) : (
          <Badge variant="secondary">프로젝트 없음</Badge>
        )}
        {deletePending ? (
          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">
            삭제 승인 대기
            {quotation.deleteRequestedByName ? ` · ${quotation.deleteRequestedByName}` : ""}
          </Badge>
        ) : null}
      </div>
      {updatedAtFormatted && (
        <p className="text-muted-foreground text-right text-xs">
          마지막 수정: {updatedAtFormatted}
        </p>
      )}

      <Dialog open={mailOpen} onOpenChange={setMailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>메일 보내기</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            받는 사람 이메일을 입력하면 기본 메일 앱이 열립니다. 제목과 본문에 견적서 정보가 자동으로 채워집니다.
          </p>
          <div className="space-y-2">
            <Label htmlFor="mail-to">받는 사람 이메일</Label>
            <Input
              id="mail-to"
              type="email"
              placeholder="client@example.com"
              value={toEmail}
              onChange={(e: any) => setToEmail(e.target.value)}
              onKeyDown={(e: any) => e.key === "Enter" && handleSendMail()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMailOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSendMail}>
              <Mail className="mr-2 size-4" />
              메일 앱 열기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex justify-center">
        <div
          ref={contentRef}
          className="w-full max-w-[210mm] bg-white text-black shadow-lg"
          style={{ minHeight: "297mm" }}
        >
          {/* A4 회계 문서 스타일 */}
          <div className="p-10">
            {company && (
              <div className="border-b border-slate-300 pb-4 mb-4 text-sm text-slate-700">
                <p className="font-bold text-base text-slate-900">{company.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5">
                  {company.businessNumber && <span>사업자등록번호 {company.businessNumber}</span>}
                  {company.representative && (
                    <span className="flex items-center gap-2">
                      대표 {company.representative}
                      {company.stampImageUrl && (
                        <Image
                          src={company.stampImageUrl}
                          alt="도장"
                          width={48}
                          height={48}
                          unoptimized
                          className="h-12 w-12 object-contain print:h-10 print:w-10"
                        />
                      )}
                    </span>
                  )}
                  {!company.representative && company.stampImageUrl && (
                    <Image
                      src={company.stampImageUrl}
                      alt="도장"
                      width={48}
                      height={48}
                      unoptimized
                      className="h-12 w-12 object-contain print:h-10 print:w-10"
                    />
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-slate-600">
                  {company.address && <span>{company.address}</span>}
                  {company.phone && <span>Tel. {company.phone}</span>}
                  {company.fax && <span>Fax. {company.fax}</span>}
                  {company.email && <span>{company.email}</span>}
                </div>
              </div>
            )}
            <div className="border-b-2 border-slate-800 pb-4 mb-6">
              <h1 className="text-2xl font-bold tracking-tight">견 적 서</h1>
              <p className="text-sm text-slate-600 mt-1">Quotation</p>
            </div>

            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm mb-6">
              <div className="flex">
                <span className="w-24 font-semibold shrink-0">문서번호</span>
                <span className="font-mono">{quotation.quotationNumber}</span>
              </div>
              <div className="flex">
                <span className="w-24 font-semibold shrink-0">발행일</span>
                <span>{format(new Date(quotation.issuedAt), "yyyy년 MM월 dd일", { locale: ko })}</span>
              </div>
              <div className="flex col-span-2">
                <span className="w-24 font-semibold shrink-0">건명</span>
                <span>{quotation.title}</span>
              </div>
              <div className="flex col-span-2">
                <span className="w-24 font-semibold shrink-0">거래처</span>
                <span>{quotation.clientName}</span>
              </div>
              <div className="flex">
                <span className="w-24 font-semibold shrink-0">유효기간</span>
                <span>{format(new Date(quotation.validUntil), "yyyy년 MM월 dd일", { locale: ko })}</span>
              </div>
              <div className="flex">
                <span className="w-24 font-semibold shrink-0">담당자</span>
                <span>{quotation.issuedBy?.name ?? "삭제된 사용자"}</span>
              </div>
            </div>

            <table className="w-full border-collapse border-2 border-slate-800 text-sm">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-800 p-2 w-10 font-bold">No</th>
                  <th className="border border-slate-800 p-2 text-left font-bold">품목명</th>
                  <th className="border border-slate-800 p-2 w-20 text-right font-bold">수량</th>
                  <th className="border border-slate-800 p-2 w-28 text-right font-bold">단가(원)</th>
                  <th className="border border-slate-800 p-2 w-32 text-right font-bold">공급가액(원)</th>
                </tr>
              </thead>
              <tbody>
                {quotation.items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="border border-slate-700 p-2 text-center">{idx + 1}</td>
                    <td className="border border-slate-700 p-2">{item.description}</td>
                    <td className="border border-slate-700 p-2 text-right tabular-nums">{item.quantity}</td>
                    <td className="border border-slate-700 p-2 text-right tabular-nums">
                      {new Intl.NumberFormat("ko-KR").format(item.unitPrice)}
                    </td>
                    <td className="border border-slate-700 p-2 text-right tabular-nums font-medium">
                      {new Intl.NumberFormat("ko-KR").format(item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end mt-4">
              <table className="w-full max-w-xs border-2 border-slate-800 text-sm">
                <tbody>
                  <tr>
                    <td className="border border-slate-700 bg-slate-50 p-2 font-semibold">공급가액</td>
                    <td className="border border-slate-700 p-2 text-right tabular-nums font-medium">
                      {new Intl.NumberFormat("ko-KR").format(quotation.totalAmount)}원
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-slate-700 bg-slate-50 p-2 font-semibold">부가세(10%)</td>
                    <td className="border border-slate-700 p-2 text-right tabular-nums font-medium">
                      {new Intl.NumberFormat("ko-KR").format(quotation.vatAmount)}원
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-slate-700 bg-slate-200 p-2 font-bold">총합계</td>
                    <td className="border border-slate-700 p-2 text-right tabular-nums font-bold">
                      {new Intl.NumberFormat("ko-KR").format(quotation.finalAmount)}원
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {quotation.remarks && (
              <div className="mt-6 p-3 border border-slate-300 bg-slate-50 rounded text-sm">
                <span className="font-semibold">비고</span>
                <p className="mt-1 text-slate-700 whitespace-pre-wrap">{quotation.remarks}</p>
              </div>
            )}

            {/* Security Footer - 문서 하단 고정 */}
            <div className="mt-12 pt-4 border-t border-slate-300 text-[10px] text-slate-500">
              Issued by {quotation.issuedBy?.name ?? "삭제된 사용자"} at {issuedAtFormatted} / Ref: {quotation.quotationNumber}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

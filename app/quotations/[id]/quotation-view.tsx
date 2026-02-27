"use client";

import { useRef, useState } from "react";
import Link from "next/link";
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
import { ArrowLeft, FileDown, Mail, Pencil } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

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
  issuedBy: { name: string };
  items: { description: string; quantity: number; unitPrice: number; amount: number }[];
};

export function QuotationView({
  quotation,
  company,
  canEdit = false,
}: {
  quotation: QuotationViewData;
  company: CompanyViewData | null;
  canEdit?: boolean;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [mailOpen, setMailOpen] = useState(false);
  const [toEmail, setToEmail] = useState("");

  const handlePrint = useReactToPrint({
    contentRef,
    documentTitle: `견적서_${quotation.quotationNumber}`,
    pageStyle: `
      @page { size: A4; margin: 12mm; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    `,
  });

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
  };

  const issuedAtFormatted = format(new Date(quotation.issuedAt), "yyyy-MM-dd HH:mm:ss", { locale: ko });
  const updatedAtFormatted = quotation.updatedAt
    ? format(new Date(quotation.updatedAt), "yyyy-MM-dd HH:mm", { locale: ko })
    : null;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/quotations">
            <ArrowLeft className="mr-2 size-4" />
            견적서 목록
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/quotations/${quotation.id}/edit`}>
                <Pencil className="mr-2 size-4" />
                수정
              </Link>
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
              onChange={(e) => setToEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMail()}
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
                        <img
                          src={company.stampImageUrl}
                          alt="도장"
                          className="h-12 w-12 object-contain print:h-10 print:w-10"
                        />
                      )}
                    </span>
                  )}
                  {!company.representative && company.stampImageUrl && (
                    <img
                      src={company.stampImageUrl}
                      alt="도장"
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
                <span>{quotation.issuedBy.name}</span>
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
              Issued by {quotation.issuedBy.name} at {issuedAtFormatted} / Ref: {quotation.quotationNumber}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeadline } from "@/components/page-headline";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Wallet, Plus, CheckCircle, FileText } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

type Vendor = {
  id: string;
  name: string;
  bankName: string;
  accountNumber: string;
  ownerName: string;
  category: string;
};

type QuotationOption = {
  id: string;
  quotationNumber: string;
  title: string;
  finalAmount: number;
  clientName: string;
};

type PaymentRequest = {
  id: string;
  amount: number;
  status: "PENDING" | "TEAM_LEAD_APPROVED" | "COMPLETED" | "REJECTED";
  requestedAt: string;
  completedAt: string | null;
  description: string | null;
  attachment: string | null;
  requester: { id: string; name: string; email: string; position: string | null };
  vendor: Vendor;
  quotation?: QuotationOption | null;
};

function formatAmount(n: number) {
  return new Intl.NumberFormat("ko-KR").format(n) + "원";
}

const VENDOR_CATEGORIES = ["인쇄", "식대", "용역", "자재", "기타"];

export default function FinanceRequestsPage() {
  const { data: session, status: authStatus } = useSession();
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [completedRequests, setCompletedRequests] = useState<PaymentRequest[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PaymentRequest[]>([]);
  const [isExecutiveTransferExecutor, setIsExecutiveTransferExecutor] = useState(false);
  const [allowTransferComplete, setAllowTransferComplete] = useState(false); // 대표/관리자 중 이체 담당자일 때만 이체완료 버튼
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [paymentAlertUnreadCount, setPaymentAlertUnreadCount] = useState<number | undefined>(undefined);
  const [vendorModalOpen, setVendorModalOpen] = useState(false);
  const [vendorSaving, setVendorSaving] = useState(false);
  const [vendorForm, setVendorForm] = useState({
    name: "",
    bankName: "",
    accountNumber: "",
    ownerName: "",
    contactPerson: "",
    category: "기타",
  });
  const [form, setForm] = useState({
    vendorId: "",
    amount: "",
    description: "",
    quotationId: "",
  });
  const [quotations, setQuotations] = useState<QuotationOption[]>([]);

  useEffect(() => {
    if (!modalOpen) return;
    fetch("/api/quotations")
      .then((res: any) => res.json())
      .then((data: any) => {
        if (Array.isArray(data)) {
          setQuotations(
            data.map((q: { id: string; quotationNumber: string; title: string; finalAmount: number; clientName: string }) => ({
              id: q.id,
              quotationNumber: q.quotationNumber,
              title: q.title,
              finalAmount: q.finalAmount,
              clientName: q.clientName,
            }))
          );
        } else {
          setQuotations([]);
        }
      })
      .catch(() => setQuotations([]));
  }, [modalOpen]);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch("/api/finance/requests", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed");
      }
      if (data?.completedRequests != null && data?.pendingRequests != null && Array.isArray(data.completedRequests) && Array.isArray(data.pendingRequests)) {
        setCompletedRequests(data.completedRequests);
        setPendingRequests(data.pendingRequests);
        setRequests([]);
        setIsExecutiveTransferExecutor(true);
        setAllowTransferComplete(data.isExecutiveTransferExecutor === true);
        setPaymentAlertUnreadCount(typeof data.paymentAlertUnreadCount === "number" ? data.paymentAlertUnreadCount : undefined);
      } else if (Array.isArray(data)) {
        const isExecutiveFromSession = session?.user?.role === "EXECUTIVE" || session?.user?.role === "ADMIN";
        if (isExecutiveFromSession) {
          setCompletedRequests(data);
          setPendingRequests([]);
          setRequests([]);
          setIsExecutiveTransferExecutor(true);
          setAllowTransferComplete(false);
          setPaymentAlertUnreadCount(undefined);
        } else {
          setRequests(data);
          setCompletedRequests([]);
          setPendingRequests([]);
          setIsExecutiveTransferExecutor(false);
          setAllowTransferComplete(false);
          setPaymentAlertUnreadCount(undefined);
        }
      } else if (data?.requests) {
        setRequests(data.requests);
        setCompletedRequests([]);
        setPendingRequests([]);
        setIsExecutiveTransferExecutor(false);
        setAllowTransferComplete(false);
        setPaymentAlertUnreadCount(typeof data.paymentAlertUnreadCount === "number" ? data.paymentAlertUnreadCount : undefined);
      } else {
        setRequests([]);
        setCompletedRequests([]);
        setPendingRequests([]);
        setIsExecutiveTransferExecutor(false);
        setAllowTransferComplete(false);
        setPaymentAlertUnreadCount(undefined);
      }
    } catch {
      // 에러 시 기존 목록 유지 (사라지지 않도록)
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchVendors = useCallback(async () => {
    try {
      const res = await fetch("/api/finance/vendors");
      if (!res.ok) return;
      const data = await res.json();
      setVendors(Array.isArray(data) ? data : []);
    } catch {
      setVendors([]);
    }
  }, []);

  useEffect(() => {
    if (authStatus === "unauthenticated") return;
    if (authStatus === "loading") return;
    fetchRequests();
    fetchVendors();
  }, [authStatus, fetchRequests, fetchVendors]);

  // 팀장·이체 담당자: 자금 관리 페이지 진입 시 알람 읽음 처리
  useEffect(() => {
    if (authStatus !== "authenticated" || paymentAlertUnreadCount === undefined) return;
    fetch("/api/finance/alerts/read", { method: "POST" }).then(() => fetchRequests());
  }, [authStatus, paymentAlertUnreadCount, fetchRequests]);

  const selectedVendor = vendors.find((v: any) => v.id === form.vendorId);

  const openVendorCreate = () => {
    setVendorForm({
      name: "",
      bankName: "",
      accountNumber: "",
      ownerName: "",
      contactPerson: "",
      category: "기타",
    });
    setVendorModalOpen(true);
  };

  const handleCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !vendorForm.name.trim() ||
      !vendorForm.bankName.trim() ||
      !vendorForm.accountNumber.trim() ||
      !vendorForm.ownerName.trim()
    ) {
      toast.error("필수 항목(업체명/은행명/계좌번호/예금주)을 입력하세요.");
      return;
    }
    setVendorSaving(true);
    try {
      const res = await fetch("/api/finance/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: vendorForm.name.trim(),
          bankName: vendorForm.bankName.trim(),
          accountNumber: vendorForm.accountNumber.trim(),
          ownerName: vendorForm.ownerName.trim(),
          contactPerson: vendorForm.contactPerson.trim() || undefined,
          category: vendorForm.category,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "등록 실패");
      toast.success("거래처가 등록되었습니다.");
      setVendorModalOpen(false);
      await fetchVendors();
      if (data?.id) {
        setForm((f: any) => ({ ...f, vendorId: String(data.id) }));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "거래처 등록에 실패했습니다.");
    } finally {
      setVendorSaving(false);
    }
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseInt(form.amount.replace(/,/g, ""), 10);
    if (!form.vendorId || !amount || amount <= 0) {
      toast.error("거래처와 금액을 입력하세요.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/finance/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId: form.vendorId,
          amount,
          description: form.description.trim() || undefined,
          quotationId: form.quotationId && form.quotationId !== "" ? form.quotationId : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "요청 실패");
      }
      toast.success("결제 요청이 등록되었습니다.");
      setModalOpen(false);
      setForm({ vendorId: "", amount: "", description: "", quotationId: "" });
      fetchRequests();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "요청에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (id: string) => {
    setCompletingId(id);
    try {
      const res = await fetch(`/api/finance/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "TEAM_LEAD_APPROVED" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "승인 처리 실패");
      }
      toast.success("승인했습니다. 이체 담당자에게 알림이 전달됩니다.");
      await fetchRequests();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "승인에 실패했습니다.");
    } finally {
      setCompletingId(null);
    }
  };

  const handleReject = async (id: string) => {
    setCompletingId(id);
    try {
      const res = await fetch(`/api/finance/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "REJECTED" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "반려 처리 실패");
      }
      toast.success("반려했습니다.");
      await fetchRequests();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "반려 처리에 실패했습니다.");
    } finally {
      setCompletingId(null);
    }
  };

  const handleRevertToPending = async (id: string) => {
    setCompletingId(id);
    try {
      const res = await fetch(`/api/finance/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PENDING" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "되돌리기 실패");
      }
      toast.success("승인 대기 상태로 되돌렸습니다.");
      await fetchRequests();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "되돌리기에 실패했습니다.");
    } finally {
      setCompletingId(null);
    }
  };

  const handleComplete = async (id: string) => {
    setCompletingId(id);
    try {
      const res = await fetch(`/api/finance/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "처리 실패");
      }
      toast.success("이체 완료로 처리했습니다.");
      await fetchRequests();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "처리에 실패했습니다.");
    } finally {
      setCompletingId(null);
    }
  };

  if (authStatus === "loading" || authStatus === "unauthenticated") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">
          {authStatus === "unauthenticated" ? "로그인이 필요합니다." : "불러오는 중..."}
        </p>
      </div>
    );
  }

  const role = session?.user?.role;
  const isTeamLead = role === "TEAM_LEAD";
  const isExecutive = role === "EXECUTIVE" || role === "ADMIN";
  const isTransferExecutor = !isTeamLead && (paymentAlertUnreadCount !== undefined || isExecutiveTransferExecutor);
  const canRequest = !isTeamLead && !isExecutive; // 일반 직원·이체 담당자: 새 결제 요청 가능 (대표는 요청 불가)
  const canApproveReject = isTeamLead; // 팀장: 승인/반려
  const canComplete = isTransferExecutor; // 이체 담당자(또는 대표+이체담당자): 이체완료
  const pendingList = isExecutiveTransferExecutor ? pendingRequests : requests;
  const pendingTotal = pendingList.filter((r: any) => r.status === "PENDING").reduce((sum, r) => sum + r.amount, 0);
  const showTwoSections =
    isExecutiveTransferExecutor || (isExecutive && !loading && requests.length === 0);

  const statusBadge = (status: string) => {
    if (status === "PENDING") return <Badge className="bg-amber-500/90 hover:bg-amber-500/90">승인대기</Badge>;
    if (status === "TEAM_LEAD_APPROVED") return <Badge className="bg-blue-600 hover:bg-blue-600">이체대기</Badge>;
    if (status === "COMPLETED") return <Badge className="bg-emerald-600 hover:bg-emerald-600">완료</Badge>;
    return <Badge variant="destructive">반려</Badge>;
  };

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="mr-2 size-4" />
            대시보드
          </Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/finance/vendors">거래처 관리</Link>
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageHeadline
          title="결제 요청"
          description={
            showTwoSections
              ? "결제 요청(이체 대기) 건과 이체 완료된 건을 모두 조회합니다. 이체 담당자로 지정된 경우 직접 이체 완료 처리할 수 있습니다."
              : isTeamLead
                ? "요청을 승인/반려하면 이체 담당자에게 알림이 갑니다. 이체 완료는 이체 담당자가 처리합니다."
                : isTransferExecutor
                  ? "팀장 승인된 건을 실제 이체한 뒤 이체완료 버튼을 눌러주세요."
                  : "거래처에 대한 송금을 요청합니다."
          }
        />
        {canRequest && (
          <Button onClick={() => setModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="mr-2 size-4" />
            새 결제 요청
          </Button>
        )}
      </div>

      {(isTeamLead || showTwoSections) && pendingTotal > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/30">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
            <Wallet className="size-5" />
            <span className="font-semibold">오늘 보낼 금액 (대기중 합계)</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-amber-900 dark:text-amber-100">
            {formatAmount(pendingTotal)}
          </p>
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground py-8 text-center text-sm">목록을 불러오는 중...</p>
      ) : showTwoSections ? (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">결제 요청 / 이체 대기</h2>
            {pendingRequests.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30 py-8 text-center">
                <p className="text-muted-foreground text-sm">이체 대기 중인 건이 없습니다.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-200 dark:border-slate-800">
                      <TableHead className="font-medium">요청일시</TableHead>
                      <TableHead className="font-medium">요청자</TableHead>
                      <TableHead className="font-medium">거래처</TableHead>
                      <TableHead className="font-medium">견적서</TableHead>
                      <TableHead className="font-medium">은행/계좌</TableHead>
                      <TableHead className="font-medium text-right">금액</TableHead>
                      <TableHead className="font-medium">상태</TableHead>
                      <TableHead className="w-[140px] font-medium" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingRequests.map((r: any) => (
                      <TableRow key={r.id} className="border-slate-200 dark:border-slate-800">
                        <TableCell className="text-muted-foreground text-sm">
                          {format(new Date(r.requestedAt), "yyyy.MM.dd HH:mm", { locale: ko })}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{r.requester.name}</span>
                          {r.requester.position && (
                            <span className="text-muted-foreground ml-1 text-xs">({r.requester.position})</span>
                          )}
                        </TableCell>
                        <TableCell>{r.vendor.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {r.quotation ? (
                            <Link href={`/quotations/${r.quotation.id}`} className="text-primary hover:underline inline-flex items-center gap-1">
                              <FileText className="size-3.5" />
                              {r.quotation.quotationNumber} {r.quotation.title}
                            </Link>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {r.vendor.bankName} {r.vendor.accountNumber}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{formatAmount(r.amount)}</TableCell>
                        <TableCell>{statusBadge(r.status)}</TableCell>
                        <TableCell>
                          {canApproveReject && r.status === "PENDING" && (
                            <div className="flex flex-wrap gap-1">
                              <Button
                                size="sm"
                                onClick={() => handleApprove(r.id)}
                                disabled={completingId === r.id}
                                className="bg-emerald-600 hover:bg-emerald-700"
                              >
                                {completingId === r.id ? "처리 중..." : "승인"}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleReject(r.id)} disabled={completingId === r.id}>
                                반려
                              </Button>
                            </div>
                          )}
                          {canApproveReject && r.status === "TEAM_LEAD_APPROVED" && (
                            <div className="flex flex-wrap gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRevertToPending(r.id)}
                                disabled={completingId === r.id}
                              >
                                {completingId === r.id ? "처리 중..." : "승인 대기로 되돌리기"}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleReject(r.id)} disabled={completingId === r.id}>
                                반려
                              </Button>
                            </div>
                          )}
                          {r.status === "TEAM_LEAD_APPROVED" && allowTransferComplete && (
                            <Button
                              size="sm"
                              onClick={() => handleComplete(r.id)}
                              disabled={completingId === r.id}
                              className="bg-emerald-600 hover:bg-emerald-700"
                            >
                              <CheckCircle className="mr-1 size-4" />
                              {completingId === r.id ? "처리 중..." : "이체완료"}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">이체 완료된 건</h2>
            {completedRequests.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30 py-8 text-center">
                <p className="text-muted-foreground text-sm">이체 완료 내역이 없습니다.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-200 dark:border-slate-800">
                      <TableHead className="font-medium">요청일시</TableHead>
                      <TableHead className="font-medium">요청자</TableHead>
                      <TableHead className="font-medium">거래처</TableHead>
                      <TableHead className="font-medium">견적서</TableHead>
                      <TableHead className="font-medium">은행/계좌</TableHead>
                      <TableHead className="font-medium text-right">금액</TableHead>
                      <TableHead className="font-medium">상태</TableHead>
                      <TableHead className="font-medium">완료일시</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completedRequests.map((r: any) => (
                      <TableRow key={r.id} className="border-slate-200 dark:border-slate-800">
                        <TableCell className="text-muted-foreground text-sm">
                          {format(new Date(r.requestedAt), "yyyy.MM.dd HH:mm", { locale: ko })}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{r.requester.name}</span>
                          {r.requester.position && (
                            <span className="text-muted-foreground ml-1 text-xs">({r.requester.position})</span>
                          )}
                        </TableCell>
                        <TableCell>{r.vendor.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {r.quotation ? (
                            <Link href={`/quotations/${r.quotation.id}`} className="text-primary hover:underline inline-flex items-center gap-1">
                              <FileText className="size-3.5" />
                              {r.quotation.quotationNumber} {r.quotation.title}
                            </Link>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {r.vendor.bankName} {r.vendor.accountNumber}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{formatAmount(r.amount)}</TableCell>
                        <TableCell>{statusBadge(r.status)}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {r.completedAt ? format(new Date(r.completedAt), "yyyy.MM.dd HH:mm", { locale: ko }) : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </>
      ) : requests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30 py-12 text-center">
          <Wallet className="mx-auto size-12 text-slate-400" />
          <p className="text-muted-foreground mt-2 text-sm">
            {isTeamLead && "결제 요청이 없습니다."}
            {isTransferExecutor && !isTeamLead && !isExecutive && "이체 대기 중인 건이 없습니다."}
            {canRequest && "내 결제 요청이 없습니다."}
            {isExecutive && !isTeamLead && !canRequest && "결제 요청 내역이 없습니다."}
          </p>
          {canRequest && (
            <Button onClick={() => setModalOpen(true)} variant="outline" size="sm" className="mt-4">
              <Plus className="mr-2 size-4" />
              새 결제 요청
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-200 dark:border-slate-800">
                <TableHead className="font-medium">요청일시</TableHead>
                {(isTeamLead || isExecutive || isTransferExecutor) && <TableHead className="font-medium">요청자</TableHead>}
                <TableHead className="font-medium">거래처</TableHead>
                <TableHead className="font-medium">견적서</TableHead>
                <TableHead className="font-medium">은행/계좌</TableHead>
                <TableHead className="font-medium text-right">금액</TableHead>
                <TableHead className="font-medium">상태</TableHead>
                {(canApproveReject || canComplete) && <TableHead className="w-[140px] font-medium" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((r: any) => (
                <TableRow key={r.id} className="border-slate-200 dark:border-slate-800">
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(r.requestedAt), "yyyy.MM.dd HH:mm", { locale: ko })}
                  </TableCell>
                  {(isTeamLead || isExecutive || isTransferExecutor) && (
                    <TableCell>
                      <span className="font-medium">{r.requester.name}</span>
                      {r.requester.position && (
                        <span className="text-muted-foreground ml-1 text-xs">({r.requester.position})</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell>{r.vendor.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {r.quotation ? (
                      <Link href={`/quotations/${r.quotation.id}`} className="text-primary hover:underline inline-flex items-center gap-1">
                        <FileText className="size-3.5" />
                        {r.quotation.quotationNumber} {r.quotation.title}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {r.vendor.bankName} {r.vendor.accountNumber}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatAmount(r.amount)}
                  </TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                  {(canApproveReject || canComplete) && (
                    <TableCell>
                      {canApproveReject && r.status === "PENDING" && (
                        <div className="flex flex-wrap gap-1">
                          <Button
                            size="sm"
                            onClick={() => handleApprove(r.id)}
                            disabled={completingId === r.id}
                            className="bg-emerald-600 hover:bg-emerald-700"
                          >
                            {completingId === r.id ? "처리 중..." : "승인"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReject(r.id)}
                            disabled={completingId === r.id}
                          >
                            반려
                          </Button>
                        </div>
                      )}
                      {canApproveReject && r.status === "TEAM_LEAD_APPROVED" && (
                        <div className="flex flex-wrap gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRevertToPending(r.id)}
                            disabled={completingId === r.id}
                          >
                            {completingId === r.id ? "처리 중..." : "승인 대기로 되돌리기"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReject(r.id)}
                            disabled={completingId === r.id}
                          >
                            반려
                          </Button>
                        </div>
                      )}
                      {canComplete && r.status === "TEAM_LEAD_APPROVED" && (
                        <Button
                          size="sm"
                          onClick={() => handleComplete(r.id)}
                          disabled={completingId === r.id}
                          className="bg-emerald-600 hover:bg-emerald-700"
                        >
                          <CheckCircle className="mr-1 size-4" />
                          {completingId === r.id ? "처리 중..." : "이체완료"}
                        </Button>
                      )}
                      {r.status === "COMPLETED" && r.completedAt && (
                        <span className="text-muted-foreground text-xs">
                          {format(new Date(r.completedAt), "MM.dd HH:mm", { locale: ko })} 완료
                        </span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>새 결제 요청</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitRequest} className="grid gap-4 py-4">
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label>거래처</Label>
                <Button type="button" variant="outline" size="sm" onClick={openVendorCreate}>
                  <Plus className="mr-1 size-4" />
                  거래처 추가
                </Button>
              </div>
              <Select value={form.vendorId} onValueChange={(v: any) => setForm((f: any) => ({ ...f, vendorId: v }))} required>
                <SelectTrigger>
                  <SelectValue placeholder="거래처 선택" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((v: any) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name} ({v.category})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedVendor && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900/50">
                <p className="text-muted-foreground text-xs">계좌정보 (수정 불가)</p>
                <p className="font-medium">{selectedVendor.bankName} {selectedVendor.accountNumber}</p>
                <p className="text-muted-foreground text-xs">예금주: {selectedVendor.ownerName}</p>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="req-amount">금액 (원)</Label>
              <Input
                id="req-amount"
                type="text"
                inputMode="numeric"
                value={form.amount}
                onChange={(e: any) => {
                  const v = e.target.value.replace(/[^0-9]/g, "");
                  setForm((f: any) => ({ ...f, amount: v }));
                }}
                placeholder="100000"
              />
              {form.amount && (
                <p className="text-muted-foreground text-xs">{formatAmount(parseInt(form.amount.replace(/,/g, ""), 10) || 0)}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label>견적서 연결 (선택)</Label>
              <Select
                value={form.quotationId || "none"}
                onValueChange={(v: any) => setForm((f: any) => ({ ...f, quotationId: v === "none" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="정산 시 참고할 견적서 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">연결 안 함</SelectItem>
                  {quotations.map((q: any) => (
                    <SelectItem key={q.id} value={q.id}>
                      {q.quotationNumber} — {q.title} ({new Intl.NumberFormat("ko-KR").format(q.finalAmount)}원)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">이체·정산 시 견적서 내용을 함께 볼 수 있습니다.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="req-desc">메모 (입금자명 변경 등)</Label>
              <Textarea
                id="req-desc"
                value={form.description}
                onChange={(e: any) => setForm((f: any) => ({ ...f, description: e.target.value }))}
                placeholder="선택 입력"
                rows={2}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                취소
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "요청 중..." : "요청"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={vendorModalOpen} onOpenChange={setVendorModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>거래처 추가</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateVendor} className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="vendor-create-name">업체명</Label>
              <Input
                id="vendor-create-name"
                value={vendorForm.name}
                onChange={(e: any) => setVendorForm((f: any) => ({ ...f, name: e.target.value }))}
                placeholder="(주)○○인쇄"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vendor-create-bank">은행명</Label>
              <Input
                id="vendor-create-bank"
                value={vendorForm.bankName}
                onChange={(e: any) => setVendorForm((f: any) => ({ ...f, bankName: e.target.value }))}
                placeholder="국민은행"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vendor-create-account">계좌번호</Label>
              <Input
                id="vendor-create-account"
                value={vendorForm.accountNumber}
                onChange={(e: any) => setVendorForm((f: any) => ({ ...f, accountNumber: e.target.value }))}
                placeholder="123-456-789012"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vendor-create-owner">예금주 (입금자)</Label>
              <Input
                id="vendor-create-owner"
                value={vendorForm.ownerName}
                onChange={(e: any) => setVendorForm((f: any) => ({ ...f, ownerName: e.target.value }))}
                placeholder="홍길동"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vendor-create-contact">담당자</Label>
              <Input
                id="vendor-create-contact"
                value={vendorForm.contactPerson}
                onChange={(e: any) => setVendorForm((f: any) => ({ ...f, contactPerson: e.target.value }))}
                placeholder="선택 입력"
              />
            </div>
            <div className="grid gap-2">
              <Label>분류</Label>
              <Select
                value={vendorForm.category}
                onValueChange={(v: any) => setVendorForm((f: any) => ({ ...f, category: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VENDOR_CATEGORIES.map((c: any) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setVendorModalOpen(false)}>
                취소
              </Button>
              <Button type="submit" disabled={vendorSaving}>
                {vendorSaving ? "등록 중..." : "등록"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
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
import { ArrowLeft, Wallet, Plus, CheckCircle, FileText, ListChecks, Pencil, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { postUploadFile } from "@/lib/upload-client-validate";
import {
  canCenterChiefApprovePaymentRequest,
  canTeamLeadManagePaymentApplicant,
  isCsTeamDepartment,
  normalizeDepartment,
  paymentRequestNeedsExecutiveDirectApproval,
  paymentRequestNeedsExecutiveFirstLineApproval,
} from "@/lib/finance-payment-request-policy";
// TODO(security): /finance/requests 는 메뉴(featureKey)로만 숨기고 URL 직접 접근은 막지 않음.
// 다른 페이지와 일관성 유지. CS팀 메뉴 숨김과 별도로 API/RSC 가드는 후속 이슈로 처리.
import * as XLSX from "xlsx";

type Vendor = {
  id: string;
  name: string;
  bankName: string;
  accountNumber: string;
  ownerName: string;
  contactPerson?: string | null;
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
  status:
    | "PENDING"
    | "CENTER_CHIEF_APPROVED"
    | "EXECUTIVE_PENDING"
    | "TEAM_LEAD_APPROVED"
    | "COMPLETED"
    | "REJECTED";
  requestedAt: string;
  completedAt: string | null;
  description: string | null;
  attachment: string | null;
  attachments?: string[] | null;
  requester: {
    id: string;
    name: string;
    email: string;
    position: string | null;
    department?: string | null;
  };
  vendor: Vendor;
  quotation?: QuotationOption | null;
};

function formatAmount(n: number) {
  return new Intl.NumberFormat("ko-KR").format(n) + "원";
}

const MEMO_PREVIEW_CHARS = 36;

/** 내용(메모) 열: 고정 폭·글자수 말줄임, 클릭 시 전체 보기 */
function PaymentMemoCell({ description }: { description: string | null }) {
  const [open, setOpen] = useState(false);
  const raw = (description ?? "").trim();
  if (!raw) return <span className="text-muted-foreground">-</span>;
  const short =
    raw.length > MEMO_PREVIEW_CHARS ? `${raw.slice(0, MEMO_PREVIEW_CHARS)}…` : raw;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground block w-full max-w-[11rem] truncate text-left text-sm underline-offset-2 hover:underline"
        title="클릭하여 전체 메모 보기"
      >
        {short}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>메모 · 내용</DialogTitle>
          </DialogHeader>
          <p className="text-foreground max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words text-sm">
            {raw}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function attachmentLabelFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const base = (u.pathname.split("/").pop() ?? "").trim();
    return decodeURIComponent(base || "첨부파일");
  } catch {
    const base = (url.split("?")[0] ?? "").split("/").pop() ?? "";
    return base || "첨부파일";
  }
}

function rowNeedsExecutiveFirstLineApproval(
  r: PaymentRequest,
  transferExecutorIds: readonly string[]
): boolean {
  return paymentRequestNeedsExecutiveFirstLineApproval(
    r.requester?.id,
    r.requester?.name,
    transferExecutorIds
  );
}

function rowNeedsExecutiveDirectApproval(
  r: PaymentRequest,
  transferExecutorIds: readonly string[],
  departmentsWithTeamLead: readonly string[]
): boolean {
  if (rowNeedsExecutiveFirstLineApproval(r, transferExecutorIds)) return false;
  const deptSet = new Set(
    departmentsWithTeamLead.map((d) => normalizeDepartment(d)).filter(Boolean)
  );
  return paymentRequestNeedsExecutiveDirectApproval(r.requester?.department, deptSet);
}

function approvalTargetStatus(
  r: PaymentRequest,
  ctx: {
    isTeamLead: boolean;
    isCenterChief: boolean;
    isExecutive: boolean;
    role?: string | null;
    teamLeadDepartment?: string | null;
  },
  transferExecutorIds: readonly string[],
  departmentsWithTeamLead: readonly string[]
): "CENTER_CHIEF_APPROVED" | "EXECUTIVE_PENDING" | "TEAM_LEAD_APPROVED" | null {
  const execFirst = rowNeedsExecutiveFirstLineApproval(r, transferExecutorIds);
  const execDirect = rowNeedsExecutiveDirectApproval(r, transferExecutorIds, departmentsWithTeamLead);
  const csReq = isCsTeamDepartment(r.requester?.department);

  // CS팀: 팀장 → 센터장 → 대표
  if (csReq && !execFirst && !execDirect) {
    if (
      ctx.isTeamLead &&
      r.status === "PENDING" &&
      canTeamLeadManagePaymentApplicant(ctx.teamLeadDepartment, r.requester?.department)
    ) {
      return "CENTER_CHIEF_APPROVED";
    }
    if (
      ctx.isCenterChief &&
      r.status === "CENTER_CHIEF_APPROVED" &&
      canCenterChiefApprovePaymentRequest(ctx.role, r.requester?.department)
    ) {
      return "EXECUTIVE_PENDING";
    }
    if (ctx.isExecutive && r.status === "EXECUTIVE_PENDING") return "TEAM_LEAD_APPROVED";
    return null;
  }

  // 비-CS: 기존 팀장 → 대표
  if (
    ctx.isTeamLead &&
    r.status === "PENDING" &&
    !execFirst &&
    !execDirect &&
    canTeamLeadManagePaymentApplicant(ctx.teamLeadDepartment, r.requester?.department)
  ) {
    return "EXECUTIVE_PENDING";
  }
  if (ctx.isExecutive && r.status === "EXECUTIVE_PENDING" && !execFirst) return "TEAM_LEAD_APPROVED";
  if (ctx.isExecutive && r.status === "PENDING" && (execFirst || execDirect)) return "TEAM_LEAD_APPROVED";
  return null;
}

function approvalButtonLabel(
  r: PaymentRequest,
  ctx: {
    isTeamLead: boolean;
    isCenterChief: boolean;
    isExecutive: boolean;
    role?: string | null;
    teamLeadDepartment?: string | null;
  },
  transferExecutorIds: readonly string[],
  departmentsWithTeamLead: readonly string[]
): string {
  const target = approvalTargetStatus(r, ctx, transferExecutorIds, departmentsWithTeamLead);
  if (target === "CENTER_CHIEF_APPROVED") return "1차 승인";
  if (target === "EXECUTIVE_PENDING" && r.status === "CENTER_CHIEF_APPROVED") return "센터장 승인";
  if (target === "EXECUTIVE_PENDING") return "1차 승인";
  if (target === "TEAM_LEAD_APPROVED" && r.status === "EXECUTIVE_PENDING") return "최종 승인";
  if (target === "TEAM_LEAD_APPROVED") return "승인";
  return "승인";
}

function attachmentsForRequest(r: PaymentRequest): string[] {
  const list = Array.isArray(r.attachments) ? r.attachments : [];
  const merged = [...list, ...(r.attachment ? [r.attachment] : [])]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);
  return [...new Set(merged)];
}

function updateRequestStatusInList<T extends PaymentRequest>(
  list: T[],
  id: string,
  patch: Partial<T>
): T[] {
  let touched = false;
  const next = list.map((r) => {
    if (r.id !== id) return r;
    touched = true;
    return { ...r, ...patch } as T;
  });
  return touched ? next : list;
}

const VENDOR_CATEGORIES = ["인쇄", "식대", "용역", "자재", "기타"];

export default function FinanceRequestsPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [completedRequests, setCompletedRequests] = useState<PaymentRequest[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PaymentRequest[]>([]);
  const [isExecutiveTransferExecutor, setIsExecutiveTransferExecutor] = useState(false);
  const [financeScope, setFinanceScope] = useState<{ kind: string; label: string } | null>(null);
  const [allowTransferComplete, setAllowTransferComplete] = useState(false); // 대표/관리자 중 이체 담당자일 때만 이체완료 버튼
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [batchCompleting, setBatchCompleting] = useState(false);
  const [selectedCompleteIds, setSelectedCompleteIds] = useState<Set<string>>(new Set());
  const [paymentAlertUnreadCount, setPaymentAlertUnreadCount] = useState<number | undefined>(undefined);
  const [transferExecutorIds, setTransferExecutorIds] = useState<string[]>([]);
  const [viewerDepartment, setViewerDepartment] = useState<string | null>(null);
  const [departmentsWithTeamLead, setDepartmentsWithTeamLead] = useState<string[]>([]);
  const [vendorModalOpen, setVendorModalOpen] = useState(false);
  /** null = 신규 등록, 문자열 = 해당 id 수정 */
  const [vendorEditingId, setVendorEditingId] = useState<string | null>(null);
  const [vendorSaving, setVendorSaving] = useState(false);
  const [vendorDeleting, setVendorDeleting] = useState(false);
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
  const [orderAttachments, setOrderAttachments] = useState<{ url: string; name: string }[]>([]);
  const [orderAttachMode, setOrderAttachMode] = useState<"file" | "table">("file");
  const [orderUploading, setOrderUploading] = useState(false);
  const [orderRows, setOrderRows] = useState<
    { item: string; qty: string; unitPrice: string; note: string }[]
  >([{ item: "", qty: "1", unitPrice: "", note: "" }]);
  const [quotations, setQuotations] = useState<QuotationOption[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!modalOpen) return;
    fetch("/api/quotations?limit=500&offset=0")
      .then((res) => res.json())
      .then((data: unknown) => {
        const rows = Array.isArray(data)
          ? data
          : data &&
              typeof data === "object" &&
              "items" in data &&
              Array.isArray((data as { items: unknown }).items)
            ? (data as { items: unknown[] }).items
            : [];
        setQuotations(
          rows.map((q: unknown) => {
            const row = q as {
              id: string;
              quotationNumber: string;
              title: string;
              finalAmount: number;
              clientName: string;
            };
            return {
              id: row.id,
              quotationNumber: row.quotationNumber,
              title: row.title,
              finalAmount: row.finalAmount,
              clientName: row.clientName,
            };
          })
        );
      })
      .catch(() => setQuotations([]));
  }, [modalOpen]);

  const fetchRequests = useCallback(async (noCache = false) => {
    const applyListMeta = (data: {
      viewerDepartment?: string | null;
      departmentsWithTeamLead?: string[];
      financeScope?: { kind?: string; label?: string } | null;
    }) => {
      setViewerDepartment(
        typeof data.viewerDepartment === "string" ? data.viewerDepartment : null
      );
      setDepartmentsWithTeamLead(
        Array.isArray(data.departmentsWithTeamLead) ? data.departmentsWithTeamLead : []
      );
      if (data.financeScope?.kind && data.financeScope?.label) {
        setFinanceScope({ kind: data.financeScope.kind, label: data.financeScope.label });
      }
    };
    try {
      const url = noCache ? `/api/finance/requests?_t=${Date.now()}` : "/api/finance/requests";
      const res = await fetch(url, {
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
        setTransferExecutorIds(Array.isArray(data.transferExecutorIds) ? data.transferExecutorIds : []);
        applyListMeta(data);
      } else if (Array.isArray(data)) {
        const isExecutiveFromSession = session?.user?.role === "EXECUTIVE" || session?.user?.role === "ADMIN";
        if (isExecutiveFromSession) {
          setCompletedRequests(data);
          setPendingRequests([]);
          setRequests([]);
          setIsExecutiveTransferExecutor(true);
          setAllowTransferComplete(false);
          setPaymentAlertUnreadCount(undefined);
          setTransferExecutorIds([]);
        } else {
          setRequests(data);
          setCompletedRequests([]);
          setPendingRequests([]);
          setIsExecutiveTransferExecutor(false);
          setAllowTransferComplete(false);
          setPaymentAlertUnreadCount(undefined);
          setTransferExecutorIds([]);
        }
      } else if (data?.requests) {
        setRequests(data.requests);
        setCompletedRequests([]);
        setPendingRequests([]);
        setIsExecutiveTransferExecutor(false);
        setAllowTransferComplete(false);
        setPaymentAlertUnreadCount(typeof data.paymentAlertUnreadCount === "number" ? data.paymentAlertUnreadCount : undefined);
        setTransferExecutorIds(Array.isArray(data.transferExecutorIds) ? data.transferExecutorIds : []);
        applyListMeta(data);
      } else {
        setRequests([]);
        setCompletedRequests([]);
        setPendingRequests([]);
        setIsExecutiveTransferExecutor(false);
        setAllowTransferComplete(false);
        setPaymentAlertUnreadCount(undefined);
        setTransferExecutorIds([]);
      }
    } catch (e) {
      // 에러 시 기존 목록 유지 (사라지지 않도록) + 사용자에게 표시
      toast.error(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  const toastForActionResult = (data: any, successMsg: string) => {
    if (data?.noOp) toast.message("이미 처리된 건입니다.");
    else toast.success(successMsg);
  };

  const optimisticApplyStatusPatch = (id: string, patch: Partial<PaymentRequest>) => {
    setRequests((prev) => updateRequestStatusInList(prev, id, patch));
    setPendingRequests((prev) => updateRequestStatusInList(prev, id, patch));
    setCompletedRequests((prev) => updateRequestStatusInList(prev, id, patch));
  };

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

  const normalizedSearch = search.trim().toLowerCase();
  const matchesSearch = (r: PaymentRequest) => {
    if (!normalizedSearch) return true;
    const vendorName = (r.vendor?.name ?? "").toLowerCase();
    const desc = (r.description ?? "").toLowerCase();
    const amountStr = String(r.amount ?? "");
    const amountFormatted = String(new Intl.NumberFormat("ko-KR").format(r.amount ?? 0));
    const quotationText = r.quotation
      ? `${r.quotation.quotationNumber} ${r.quotation.title} ${r.quotation.clientName}`.toLowerCase()
      : "";
    return (
      vendorName.includes(normalizedSearch) ||
      desc.includes(normalizedSearch) ||
      quotationText.includes(normalizedSearch) ||
      amountStr.includes(normalizedSearch) ||
      amountFormatted.includes(normalizedSearch)
    );
  };

  const visibleRequests = requests.filter(matchesSearch);
  const visiblePendingRequests = pendingRequests.filter(matchesSearch);
  const visibleCompletedRequests = completedRequests.filter(matchesSearch);

  const openVendorCreate = () => {
    setVendorEditingId(null);
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

  const openVendorEdit = () => {
    const v = selectedVendor;
    if (!v) {
      toast.error("먼저 거래처를 선택하세요.");
      return;
    }
    setVendorEditingId(v.id);
    setVendorForm({
      name: v.name,
      bankName: v.bankName,
      accountNumber: v.accountNumber,
      ownerName: v.ownerName,
      contactPerson: v.contactPerson?.trim() ?? "",
      category: v.category ?? "기타",
    });
    setVendorModalOpen(true);
  };

  const handleSaveVendor = async (e: React.FormEvent) => {
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
      const editing = vendorEditingId;
      const trimmedContact = vendorForm.contactPerson.trim();
      const base = {
        name: vendorForm.name.trim(),
        bankName: vendorForm.bankName.trim(),
        accountNumber: vendorForm.accountNumber.trim(),
        ownerName: vendorForm.ownerName.trim(),
        category: vendorForm.category,
      };
      const payload = editing
        ? { ...base, contactPerson: trimmedContact || null }
        : { ...base, ...(trimmedContact ? { contactPerson: trimmedContact } : {}) };
      const res = await fetch(editing ? `/api/finance/vendors/${editing}` : "/api/finance/vendors", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? (editing ? "수정 실패" : "등록 실패"));
      toast.success(editing ? "거래처 정보를 수정했습니다." : "거래처가 등록되었습니다.");
      setVendorModalOpen(false);
      setVendorEditingId(null);
      await fetchVendors();
      const nextId = editing ?? data?.id;
      if (nextId) {
        setForm((f: any) => ({ ...f, vendorId: String(nextId) }));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "거래처 저장에 실패했습니다.");
    } finally {
      setVendorSaving(false);
    }
  };

  const handleDeleteSelectedVendor = async () => {
    const id = form.vendorId;
    if (!id) {
      toast.error("삭제할 거래처를 선택하세요.");
      return;
    }
    const name = vendors.find((v) => v.id === id)?.name ?? "이 거래처";
    if (!confirm(`${name}을(를) 삭제할까요?\n(이미 결제 요청에 사용된 거래처는 삭제할 수 없습니다.)`)) return;
    setVendorDeleting(true);
    try {
      const res = await fetch(`/api/finance/vendors/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `삭제 실패 (${res.status})`);
      toast.success("거래처를 삭제했습니다.");
      setForm((f: any) => ({ ...f, vendorId: "" }));
      await fetchVendors();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "거래처 삭제에 실패했습니다.");
    } finally {
      setVendorDeleting(false);
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
      let attachments = orderAttachments.map((a) => a.url).filter(Boolean);

      // 표로 작성 모드면 제출 시 엑셀 생성 → 업로드 → attachment URL로 저장
      if (orderAttachMode === "table") {
        const normalized = orderRows
          .map((r) => ({
            item: r.item.trim(),
            qty: r.qty.trim(),
            unitPrice: r.unitPrice.trim(),
            note: r.note.trim(),
          }))
          .filter((r) => r.item.length > 0);

        if (normalized.length > 0) {
          const header = ["품목", "수량", "단가", "비고"];
          const data = [header, ...normalized.map((r) => [r.item, r.qty, r.unitPrice, r.note])];
          const ws = XLSX.utils.aoa_to_sheet(data);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "주문내역");
          const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
          const fileName = `주문내역_${new Date().toISOString().slice(0, 10)}.xlsx`;
          const file = new File([out], fileName, {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          });
          setOrderUploading(true);
          try {
            const up = await postUploadFile(file);
            attachments = [...attachments, up.url].filter(Boolean);
          } finally {
            setOrderUploading(false);
          }
        }
      }
      attachments = [...new Set(attachments.map((u) => String(u).trim()).filter(Boolean))];

      const res = await fetch("/api/finance/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId: form.vendorId,
          amount,
          description: form.description.trim() || undefined,
          quotationId: form.quotationId && form.quotationId !== "" ? form.quotationId : undefined,
          attachments: attachments.length > 0 ? attachments : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "요청 실패");
      }
      toast.success("결제 요청이 등록되었습니다.");
      setModalOpen(false);
      setForm({ vendorId: "", amount: "", description: "", quotationId: "" });
      setOrderAttachments([]);
      setOrderAttachMode("file");
      setOrderRows([{ item: "", qty: "1", unitPrice: "", note: "" }]);
      fetchRequests();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "요청에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOrderFilePicked = async (file: File | null) => {
    if (!file) return;
    setOrderUploading(true);
    try {
      const up = await postUploadFile(file);
      setOrderAttachments((prev) => {
        const next = [...prev, { url: up.url, name: up.name || file.name }];
        const seen = new Set<string>();
        return next.filter((x) => {
          const u = (x.url ?? "").trim();
          if (!u || seen.has(u)) return false;
          seen.add(u);
          return true;
        });
      });
      toast.success("첨부 파일이 추가되었습니다.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "파일 첨부에 실패했습니다.");
    } finally {
      setOrderUploading(false);
    }
  };

  const handleApprove = async (r: PaymentRequest) => {
    const userRole = session?.user?.role;
    const target = approvalTargetStatus(
      r,
      {
        isTeamLead: userRole === "TEAM_LEAD",
        isCenterChief: userRole === "CENTER_CHIEF",
        isExecutive: userRole === "EXECUTIVE" || userRole === "ADMIN",
        role: userRole as string | undefined,
        teamLeadDepartment: viewerDepartment,
      },
      transferExecutorIds,
      departmentsWithTeamLead
    );
    if (!target) return;
    setCompletingId(r.id);
    try {
      const res = await fetch(`/api/finance/requests/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: target }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "승인 처리 실패");
      }
      const data = await res.json().catch(() => ({}));
      const msg =
        target === "CENTER_CHIEF_APPROVED"
          ? "1차 승인했습니다. 센터장에게 알림이 전달됩니다."
          : target === "EXECUTIVE_PENDING" && r.status === "CENTER_CHIEF_APPROVED"
            ? "센터장 승인했습니다. 대표에게 알림이 전달됩니다."
            : target === "EXECUTIVE_PENDING"
              ? "1차 승인했습니다. 대표에게 알림이 전달됩니다."
              : target === "TEAM_LEAD_APPROVED" && r.status === "EXECUTIVE_PENDING"
                ? "최종 승인했습니다. 이체 담당자에게 알림이 전달됩니다."
                : "승인했습니다. 이체 담당자에게 알림이 전달됩니다.";
      toastForActionResult(data, msg);
      optimisticApplyStatusPatch(r.id, { status: target });
      await fetchRequests(true);
      router.refresh();
      if (typeof window !== "undefined") window.dispatchEvent(new Event("finance-alerts-refresh"));
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
      const data = await res.json().catch(() => ({}));
      toastForActionResult(data, "반려했습니다.");
      optimisticApplyStatusPatch(id, { status: "REJECTED" as any });
      await fetchRequests(true);
      router.refresh();
      if (typeof window !== "undefined") window.dispatchEvent(new Event("finance-alerts-refresh"));
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
      const data = await res.json().catch(() => ({}));
      toastForActionResult(data, "승인 대기 상태로 되돌렸습니다.");
      optimisticApplyStatusPatch(id, { status: "PENDING" as any });
      await fetchRequests(true);
      router.refresh();
      if (typeof window !== "undefined") window.dispatchEvent(new Event("finance-alerts-refresh"));
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
      const data = await res.json().catch(() => ({}));
      toastForActionResult(data, "이체 완료로 처리했습니다.");
      optimisticApplyStatusPatch(id, { status: "COMPLETED" as any, completedAt: new Date().toISOString() });
      await fetchRequests(true);
      router.refresh();
      if (typeof window !== "undefined") window.dispatchEvent(new Event("finance-alerts-refresh"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "처리에 실패했습니다.");
    } finally {
      setCompletingId(null);
    }
  };

  const handleBatchComplete = async () => {
    const ids = Array.from(selectedCompleteIds);
    if (ids.length === 0) {
      toast.error("이체완료할 건을 선택하세요.");
      return;
    }
    if (!confirm(`선택한 ${ids.length}건을 한 번에 이체완료로 처리할까요? 실제 이체를 마친 뒤 눌러 주세요.`)) return;
    setBatchCompleting(true);
    try {
      const res = await fetch("/api/finance/requests/batch-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "일괄 처리 실패");
      toast.success(`${data.count ?? ids.length}건을 이체완료로 처리했습니다.`);
      setSelectedCompleteIds(new Set());
      await fetchRequests(true);
      router.refresh();
      if (typeof window !== "undefined") window.dispatchEvent(new Event("finance-alerts-refresh"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "일괄 처리에 실패했습니다.");
    } finally {
      setBatchCompleting(false);
    }
  };

  const handleDeleteRequest = async (id: string) => {
    if (!confirm("이 결제 요청을 삭제할까요? (이체 완료 전까지만 삭제할 수 있습니다)")) return;
    setCompletingId(id);
    try {
      const res = await fetch(`/api/finance/requests/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "삭제 실패");
      toast.success("삭제했습니다.");
      // 즉시 UI 반영
      setRequests((prev) => prev.filter((r) => r.id !== id));
      setPendingRequests((prev) => prev.filter((r) => r.id !== id));
      setCompletedRequests((prev) => prev.filter((r) => r.id !== id));
      await fetchRequests(true);
      router.refresh();
      if (typeof window !== "undefined") window.dispatchEvent(new Event("finance-alerts-refresh"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setCompletingId(null);
    }
  };

  const toggleSelectComplete = (id: string) => {
    setSelectedCompleteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
  const myUserId = session?.user?.id ?? "";
  const isTeamLead = role === "TEAM_LEAD";
  const isCenterChief = role === "CENTER_CHIEF";
  const isExecutive = role === "EXECUTIVE" || role === "ADMIN";
  const isTransferExecutor = transferExecutorIds.includes(myUserId);
  const canRequest = !isExecutive;
  const canComplete = isTransferExecutor;
  const isSelfScope = financeScope?.kind === "SELF";
  const scopeLabel =
    financeScope?.label ??
    (isExecutive || isTransferExecutor
      ? "전체"
      : isTeamLead || isCenterChief
        ? viewerDepartment
          ? `${viewerDepartment} 내역`
          : "부서 내역"
        : "내 신청 내역");
  const approvalCtx = {
    isTeamLead,
    isCenterChief,
    isExecutive,
    role: role as string | undefined,
    teamLeadDepartment: viewerDepartment,
  };
  /** 팀장/센터장/대표 승인 가능 행 */
  const canApproveRejectRow = (r: PaymentRequest) => {
    if (approvalTargetStatus(r, approvalCtx, transferExecutorIds, departmentsWithTeamLead)) return true;
    if (isExecutive && r.status === "TEAM_LEAD_APPROVED") return true;
    if (
      isTeamLead &&
      r.status === "EXECUTIVE_PENDING" &&
      !isCsTeamDepartment(r.requester?.department) &&
      !rowNeedsExecutiveFirstLineApproval(r, transferExecutorIds) &&
      canTeamLeadManagePaymentApplicant(viewerDepartment, r.requester?.department)
    ) {
      return true;
    }
    if (
      isCenterChief &&
      r.status === "EXECUTIVE_PENDING" &&
      canCenterChiefApprovePaymentRequest(role, r.requester?.department)
    ) {
      return true;
    }
    return false;
  };
  const showApprovalActionsColumn = isTeamLead || isCenterChief || isExecutive || canComplete;
  const pendingList = isExecutiveTransferExecutor ? pendingRequests : requests;
  const pendingTotal = pendingList
    .filter(
      (r: PaymentRequest) =>
        r.status === "PENDING" ||
        r.status === "CENTER_CHIEF_APPROVED" ||
        r.status === "EXECUTIVE_PENDING"
    )
    .reduce((sum, r) => sum + r.amount, 0);
  const showTwoSections =
    isExecutiveTransferExecutor || (isExecutive && !loading && requests.length === 0);

  /** 일괄 이체완료: 이체 담당자만 */
  const canBatchComplete = isTransferExecutor && (showTwoSections ? allowTransferComplete : canComplete);

  const approvedPendingForBatch = visiblePendingRequests.filter((r: any) => r.status === "TEAM_LEAD_APPROVED");
  const approvedRequestsForBatch = visibleRequests.filter((r: any) => r.status === "TEAM_LEAD_APPROVED");
  const batchList = showTwoSections ? approvedPendingForBatch : approvedRequestsForBatch;
  const selectedBatchSum = batchList
    .filter((r: any) => selectedCompleteIds.has(r.id))
    .reduce((sum: number, r: any) => sum + r.amount, 0);

  const statusBadge = (status: string) => {
    if (status === "PENDING") return <Badge className="bg-amber-500/90 hover:bg-amber-500/90">승인대기</Badge>;
    if (status === "CENTER_CHIEF_APPROVED")
      return <Badge className="bg-orange-600 hover:bg-orange-600">센터장승인대기</Badge>;
    if (status === "EXECUTIVE_PENDING") return <Badge className="bg-violet-600 hover:bg-violet-600">대표승인대기</Badge>;
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
        {!isSelfScope && (
          <Button variant="ghost" size="sm" asChild>
            <Link href="/finance/vendors">거래처 관리</Link>
          </Button>
        )}
        <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          조회 범위: {scopeLabel}
        </span>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageHeadline
          title="결제 요청"
          description={
            isSelfScope
              ? "내가 신청한 결제 요청만 조회합니다."
              : showTwoSections
              ? "결제 요청(이체 대기) 건과 이체 완료된 건을 모두 조회합니다. 이체 담당자로 지정된 경우 직접 이체 완료 처리할 수 있습니다."
              : isTeamLead
                ? "같은 부서(팀) 직원 요청만 팀장 1차 승인 후 대표 2차 승인합니다. 팀장이 없는 부서는 대표가 바로 승인합니다."
                : isExecutive
                  ? "일반 직원 요청은 팀장 1차 승인 후 대표 2차 승인합니다. 팀장이 없는 부서·이체 담당자 요청은 대표가 바로 승인합니다."
                : isTransferExecutor
                  ? "팀장 승인된 건을 실제 이체한 뒤 이체완료 버튼을 눌러주세요."
                  : "거래처에 대한 송금을 요청합니다."
          }
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={search}
            onChange={(e: any) => setSearch(e.target.value)}
            placeholder="업체명 / 금액 / 내용 검색"
            className="w-full sm:w-[280px]"
          />
          {canRequest && (
            <Button onClick={() => setModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="mr-2 size-4" />
              새 결제 요청
            </Button>
          )}
        </div>
      </div>

      {!isSelfScope && (isTeamLead || showTwoSections) && pendingTotal > 0 && (
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
            {canBatchComplete && approvedPendingForBatch.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
                <ListChecks className="size-5 text-emerald-700 dark:text-emerald-400" aria-hidden />
                <span className="text-sm text-muted-foreground">
                  이체대기 건을 여러 개 선택 후 한 번에 이체완료 처리할 수 있습니다. (같은 업체·묶음 이체에 활용)
                </span>
                <span className="text-sm font-medium tabular-nums">
                  선택 {selectedCompleteIds.size}건 · {formatAmount(selectedBatchSum)}
                </span>
                <Button
                  type="button"
                        size="sm"
                  variant="outline"
                  onClick={() => {
                    setSelectedCompleteIds((prev) => {
                      const next = new Set(prev);
                      approvedPendingForBatch.forEach((r: any) => next.add(r.id));
                      return next;
                    });
                  }}
                >
                  이체대기 전부 선택
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedCompleteIds(new Set())}>
                  선택 해제
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  disabled={selectedCompleteIds.size === 0 || batchCompleting}
                  onClick={handleBatchComplete}
                >
                  {batchCompleting ? "처리 중..." : "선택 건 일괄 이체완료"}
                </Button>
              </div>
            )}
            {visiblePendingRequests.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30 py-8 text-center">
                <p className="text-muted-foreground text-sm">이체 대기 중인 건이 없습니다.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-200 dark:border-slate-800">
                      {canBatchComplete && (
                        <TableHead className="w-10">
                          <Checkbox
                            checked={
                              approvedPendingForBatch.length > 0 &&
                              approvedPendingForBatch.every((row: any) => selectedCompleteIds.has(row.id))
                            }
                            onCheckedChange={(c) => {
                              if (c === true) {
                                setSelectedCompleteIds((prev) => {
                                  const next = new Set(prev);
                                  approvedPendingForBatch.forEach((row: any) => next.add(row.id));
                                  return next;
                                });
                              } else {
                                setSelectedCompleteIds((prev) => {
                                  const next = new Set(prev);
                                  approvedPendingForBatch.forEach((row: any) => next.delete(row.id));
                                  return next;
                                });
                              }
                            }}
                            aria-label="이체대기 전부 선택"
                          />
                        </TableHead>
                      )}
                      <TableHead className="font-medium">요청일시</TableHead>
                      <TableHead className="font-medium">요청자</TableHead>
                      <TableHead className="font-medium">거래처</TableHead>
                      <TableHead className="font-medium w-[11rem] max-w-[11rem]">내용</TableHead>
                      <TableHead className="font-medium">견적서</TableHead>
                      <TableHead className="font-medium">은행/계좌</TableHead>
                      <TableHead className="font-medium text-right">금액</TableHead>
                      <TableHead className="font-medium">상태</TableHead>
                      <TableHead className="w-[140px] font-medium" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visiblePendingRequests.map((r: any) => (
                      <TableRow key={r.id} className="border-slate-200 dark:border-slate-800">
                        {canBatchComplete && (
                          <TableCell className="w-10 align-middle">
                            {r.status === "TEAM_LEAD_APPROVED" ? (
                              <Checkbox
                                checked={selectedCompleteIds.has(r.id)}
                                onCheckedChange={() => toggleSelectComplete(r.id)}
                                aria-label={`${r.vendor?.name ?? ""} 선택`}
                              />
                            ) : (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell className="text-muted-foreground text-sm">
                          {format(new Date(r.requestedAt), "yyyy.MM.dd HH:mm", { locale: ko })}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{r.requester?.name ?? "삭제된 사용자"}</span>
                          {r.requester?.position && (
                            <span className="text-muted-foreground ml-1 text-xs">({r.requester?.position})</span>
                          )}
                        </TableCell>
                        <TableCell>{r.vendor.name}</TableCell>
                        <TableCell className="w-[11rem] max-w-[11rem] align-top">
                          <div className="grid gap-2">
                            <PaymentMemoCell description={r.description} />
                            {attachmentsForRequest(r).length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {attachmentsForRequest(r).slice(0, 3).map((u) => (
                                  <a
                                    key={u}
                                    href={u}
                                    rel="noreferrer"
                                    className="inline-flex items-center rounded border bg-background px-1.5 py-0.5 text-[11px] text-primary underline underline-offset-2"
                                    title={attachmentLabelFromUrl(u)}
                                  >
                                    첨부
                                  </a>
                                ))}
                                {attachmentsForRequest(r).length > 3 && (
                                  <span className="text-muted-foreground text-[11px]">
                                    +{attachmentsForRequest(r).length - 3}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
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
                          {isTeamLead &&
                            !isExecutive &&
                            r.status === "PENDING" &&
                            rowNeedsExecutiveFirstLineApproval(r, transferExecutorIds) && (
                              <p className="text-muted-foreground max-w-[10rem] text-xs leading-snug">
                                대표(임원) 승인 대기 · 팀장 1차 승인 불가
                              </p>
                            )}
                          {isTeamLead &&
                            !isExecutive &&
                            r.status === "TEAM_LEAD_APPROVED" &&
                            rowNeedsExecutiveFirstLineApproval(r, transferExecutorIds) && (
                              <p className="text-muted-foreground max-w-[10rem] text-xs leading-snug">
                                대표(임원) 결재 건 · 되돌리기·반려는 대표만 가능
                              </p>
                            )}
                          {canApproveRejectRow(r) &&
                            approvalTargetStatus(r, approvalCtx, transferExecutorIds, departmentsWithTeamLead) && (
                            <div className="flex flex-wrap gap-1">
                              <Button
                                size="sm"
                                onClick={() => handleApprove(r)}
                                disabled={completingId === r.id}
                                className="bg-emerald-600 hover:bg-emerald-700"
                              >
                                {completingId === r.id
                                  ? "처리 중..."
                                  : approvalButtonLabel(r, approvalCtx, transferExecutorIds, departmentsWithTeamLead)}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleReject(r.id)} disabled={completingId === r.id}>
                                반려
                              </Button>
                            </div>
                          )}
                          {canApproveRejectRow(r) && r.status === "TEAM_LEAD_APPROVED" && (
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
                          {(r.requester?.id === session?.user?.id) && r.status !== "COMPLETED" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteRequest(r.id)}
                              disabled={completingId === r.id}
                              className="text-destructive hover:text-destructive"
                            >
                              삭제
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
            {visibleCompletedRequests.length === 0 ? (
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
                      <TableHead className="font-medium w-[11rem] max-w-[11rem]">내용</TableHead>
                      <TableHead className="font-medium">견적서</TableHead>
                      <TableHead className="font-medium">은행/계좌</TableHead>
                      <TableHead className="font-medium text-right">금액</TableHead>
                      <TableHead className="font-medium">상태</TableHead>
                      <TableHead className="font-medium">완료일시</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleCompletedRequests.map((r: any) => (
                      <TableRow key={r.id} className="border-slate-200 dark:border-slate-800">
                        <TableCell className="text-muted-foreground text-sm">
                          {format(new Date(r.requestedAt), "yyyy.MM.dd HH:mm", { locale: ko })}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{r.requester?.name ?? "삭제된 사용자"}</span>
                          {r.requester?.position && (
                            <span className="text-muted-foreground ml-1 text-xs">({r.requester?.position})</span>
                          )}
                        </TableCell>
                        <TableCell>{r.vendor.name}</TableCell>
                        <TableCell className="w-[11rem] max-w-[11rem] align-top">
                          <PaymentMemoCell description={r.description} />
                        </TableCell>
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
      ) : visibleRequests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30 py-12 text-center">
          <Wallet className="mx-auto size-12 text-slate-400" />
          <p className="text-muted-foreground mt-2 text-sm">
            {isTeamLead && "결제 요청 내역이 없습니다."}
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
        <>
          {canBatchComplete && approvedRequestsForBatch.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
              <ListChecks className="size-5 text-emerald-700 dark:text-emerald-400" aria-hidden />
              <span className="text-sm text-muted-foreground">
                이체대기 건을 여러 개 선택 후 일괄 이체완료할 수 있습니다.
              </span>
              <span className="text-sm font-medium tabular-nums">
                선택 {selectedCompleteIds.size}건 · {formatAmount(selectedBatchSum)}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setSelectedCompleteIds((prev) => {
                    const next = new Set(prev);
                    approvedRequestsForBatch.forEach((row: any) => next.add(row.id));
                    return next;
                  });
                }}
              >
                이체대기 전부 선택
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedCompleteIds(new Set())}>
                선택 해제
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={selectedCompleteIds.size === 0 || batchCompleting}
                onClick={handleBatchComplete}
              >
                {batchCompleting ? "처리 중..." : "선택 건 일괄 이체완료"}
              </Button>
            </div>
          )}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-200 dark:border-slate-800">
                {canBatchComplete && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        approvedRequestsForBatch.length > 0 &&
                        approvedRequestsForBatch.every((row: any) => selectedCompleteIds.has(row.id))
                      }
                      onCheckedChange={(c) => {
                        if (c === true) {
                          setSelectedCompleteIds((prev) => {
                            const next = new Set(prev);
                            approvedRequestsForBatch.forEach((row: any) => next.add(row.id));
                            return next;
                          });
                        } else {
                          setSelectedCompleteIds((prev) => {
                            const next = new Set(prev);
                            approvedRequestsForBatch.forEach((row: any) => next.delete(row.id));
                            return next;
                          });
                        }
                      }}
                      aria-label="이체대기 전부 선택"
                    />
                  </TableHead>
                )}
                <TableHead className="font-medium">요청일시</TableHead>
                {(isTeamLead || isExecutive || isTransferExecutor) && <TableHead className="font-medium">요청자</TableHead>}
                <TableHead className="font-medium">거래처</TableHead>
                <TableHead className="font-medium w-[11rem] max-w-[11rem]">내용</TableHead>
                <TableHead className="font-medium">견적서</TableHead>
                <TableHead className="font-medium">은행/계좌</TableHead>
                <TableHead className="font-medium text-right">금액</TableHead>
                <TableHead className="font-medium">상태</TableHead>
                {showApprovalActionsColumn && <TableHead className="w-[140px] font-medium" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRequests.map((r: any) => (
                <TableRow key={r.id} className="border-slate-200 dark:border-slate-800">
                  {canBatchComplete && (
                    <TableCell className="w-10 align-middle">
                      {r.status === "TEAM_LEAD_APPROVED" ? (
                        <Checkbox
                          checked={selectedCompleteIds.has(r.id)}
                          onCheckedChange={() => toggleSelectComplete(r.id)}
                          aria-label={`${r.vendor?.name ?? ""} 선택`}
                        />
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(r.requestedAt), "yyyy.MM.dd HH:mm", { locale: ko })}
                  </TableCell>
                  {(isTeamLead || isExecutive || isTransferExecutor) && (
                    <TableCell>
                      <span className="font-medium">{r.requester?.name ?? "삭제된 사용자"}</span>
                      {r.requester?.position && (
                        <span className="text-muted-foreground ml-1 text-xs">({r.requester?.position})</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell>{r.vendor.name}</TableCell>
                  <TableCell className="w-[11rem] max-w-[11rem] align-top">
                    <div className="grid gap-2">
                      <PaymentMemoCell description={r.description} />
                      {attachmentsForRequest(r).length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {attachmentsForRequest(r).slice(0, 3).map((u) => (
                            <a
                              key={u}
                              href={u}
                              rel="noreferrer"
                              className="inline-flex items-center rounded border bg-background px-1.5 py-0.5 text-[11px] text-primary underline underline-offset-2"
                              title={attachmentLabelFromUrl(u)}
                            >
                              첨부
                            </a>
                          ))}
                          {attachmentsForRequest(r).length > 3 && (
                            <span className="text-muted-foreground text-[11px]">
                              +{attachmentsForRequest(r).length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </TableCell>
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
                  {showApprovalActionsColumn && (
                    <TableCell>
                      {isTeamLead &&
                        !isExecutive &&
                        r.status === "PENDING" &&
                        rowNeedsExecutiveFirstLineApproval(r, transferExecutorIds) && (
                          <p className="text-muted-foreground mb-1 max-w-[10rem] text-xs leading-snug">
                            대표(임원) 승인 대기 · 팀장 1차 승인 불가
                          </p>
                        )}
                      {isTeamLead &&
                        !isExecutive &&
                        r.status === "TEAM_LEAD_APPROVED" &&
                        rowNeedsExecutiveFirstLineApproval(r, transferExecutorIds) && (
                          <p className="text-muted-foreground mb-1 max-w-[10rem] text-xs leading-snug">
                            대표(임원) 결재 건 · 되돌리기·반려는 대표만 가능
                          </p>
                        )}
                      {canApproveRejectRow(r) &&
                        approvalTargetStatus(r, approvalCtx, transferExecutorIds, departmentsWithTeamLead) && (
                        <div className="flex flex-wrap gap-1">
                          <Button
                            size="sm"
                            onClick={() => handleApprove(r)}
                            disabled={completingId === r.id}
                            className="bg-emerald-600 hover:bg-emerald-700"
                          >
                            {completingId === r.id
                              ? "처리 중..."
                              : approvalButtonLabel(r, approvalCtx, transferExecutorIds, departmentsWithTeamLead)}
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
                      {canApproveRejectRow(r) && r.status === "TEAM_LEAD_APPROVED" && (
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
                      {(r.requester?.id === session?.user?.id) && r.status !== "COMPLETED" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteRequest(r.id)}
                          disabled={completingId === r.id}
                          className="text-destructive hover:text-destructive"
                        >
                          삭제
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
        </>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>새 결제 요청</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitRequest} className="grid gap-4 py-4">
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>거래처</Label>
                <div className="flex flex-wrap gap-1.5">
                  <Button type="button" variant="outline" size="sm" onClick={openVendorCreate}>
                    <Plus className="mr-1 size-4" />
                    추가
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={openVendorEdit}
                    disabled={!form.vendorId}
                  >
                    <Pencil className="mr-1 size-4" />
                    수정
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => void handleDeleteSelectedVendor()}
                    disabled={!form.vendorId || vendorDeleting}
                  >
                    <Trash2 className="mr-1 size-4" />
                    {vendorDeleting ? "삭제 중…" : "삭제"}
                  </Button>
                </div>
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
                <p className="text-muted-foreground text-xs">계좌 정보 · 잘못 입력 시 위 「수정」에서 바꿀 수 있습니다</p>
                <p className="font-medium">{selectedVendor.bankName} {selectedVendor.accountNumber}</p>
                <p className="text-muted-foreground text-xs">예금주(입금자명): {selectedVendor.ownerName}</p>
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
            <div className="grid gap-2 rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="text-sm">주문 내역 (견적서 외)</Label>
                  <p className="text-muted-foreground mt-1 text-xs">
                    어떤 걸 주문/구매하는지 <strong>이미지·엑셀</strong>을 첨부하거나, 아래 표에 입력하면{" "}
                    <strong>엑셀로 자동 생성</strong>해 첨부합니다.
                  </p>
                </div>
                <Select value={orderAttachMode} onValueChange={(v: any) => setOrderAttachMode(v)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="첨부 방식" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="file">파일 첨부</SelectItem>
                    <SelectItem value="table">표로 작성</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {orderAttachMode === "file" ? (
                <div className="grid gap-2">
                  <Input
                    type="file"
                    multiple
                    accept="*/*"
                    disabled={orderUploading || submitting}
                    onChange={(e: any) => {
                      const files = Array.from((e.target.files as FileList | null) ?? []);
                      void (async () => {
                        for (const f of files) {
                          await handleOrderFilePicked(f);
                        }
                      })();
                      e.target.value = "";
                    }}
                  />
                  {orderAttachments.length > 0 ? (
                    <div className="grid gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <Badge variant="secondary" className="font-normal">
                          {orderAttachments.length}개 첨부됨
                        </Badge>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setOrderAttachments([])}
                          disabled={orderUploading || submitting}
                        >
                          전체 제거
                        </Button>
                      </div>
                      <div className="grid gap-1">
                        {orderAttachments.map((a) => (
                          <div key={a.url} className="flex items-center justify-between gap-2 rounded-md border bg-background px-2 py-1 text-sm">
                            <a
                              href={a.url}
                              rel="noreferrer"
                              className="min-w-0 flex-1 truncate text-primary underline underline-offset-2"
                              title={a.name || a.url}
                            >
                              {a.name || attachmentLabelFromUrl(a.url)}
                            </a>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setOrderAttachments((prev) => prev.filter((x) => x.url !== a.url))}
                              disabled={orderUploading || submitting}
                            >
                              제거
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-xs">
                      이미지(JPG/PNG 등) 또는 엑셀(XLSX) / CSV를 올릴 수 있어요.
                    </p>
                  )}
                </div>
              ) : (
                <div className="grid gap-2">
                  <div className="rounded-md border bg-background overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="font-medium">품목</TableHead>
                          <TableHead className="w-[84px] font-medium">수량</TableHead>
                          <TableHead className="w-[120px] font-medium">단가</TableHead>
                          <TableHead className="font-medium">비고</TableHead>
                          <TableHead className="w-[56px]" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orderRows.map((r, idx) => (
                          <TableRow key={idx}>
                            <TableCell>
                              <Input
                                value={r.item}
                                onChange={(e: any) =>
                                  setOrderRows((prev) =>
                                    prev.map((x, i) => (i === idx ? { ...x, item: e.target.value } : x))
                                  )
                                }
                                placeholder="예: A4 인쇄 100부"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={r.qty}
                                onChange={(e: any) =>
                                  setOrderRows((prev) =>
                                    prev.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x))
                                  )
                                }
                                placeholder="1"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={r.unitPrice}
                                onChange={(e: any) =>
                                  setOrderRows((prev) =>
                                    prev.map((x, i) => (i === idx ? { ...x, unitPrice: e.target.value } : x))
                                  )
                                }
                                placeholder="예: 12000"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={r.note}
                                onChange={(e: any) =>
                                  setOrderRows((prev) =>
                                    prev.map((x, i) => (i === idx ? { ...x, note: e.target.value } : x))
                                  )
                                }
                                placeholder="옵션/색상/사이즈 등"
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={orderRows.length <= 1}
                                onClick={() => setOrderRows((prev) => prev.filter((_, i) => i !== idx))}
                              >
                                삭제
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex items-center justify-between">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setOrderRows((prev) => [...prev, { item: "", qty: "1", unitPrice: "", note: "" }])}
                      disabled={orderUploading || submitting}
                    >
                      행 추가
                    </Button>
                    <p className="text-muted-foreground text-xs">
                      요청 시 표가 엑셀로 생성되어 자동 첨부됩니다.
                    </p>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                취소
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting || orderUploading ? "요청 중..." : "요청"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={vendorModalOpen}
        onOpenChange={(open) => {
          setVendorModalOpen(open);
          if (!open) setVendorEditingId(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{vendorEditingId ? "거래처 수정" : "거래처 추가"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveVendor} className="grid gap-4 py-4">
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
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setVendorModalOpen(false);
                  setVendorEditingId(null);
                }}
              >
                취소
              </Button>
              <Button type="submit" disabled={vendorSaving}>
                {vendorSaving ? "저장 중..." : vendorEditingId ? "저장" : "등록"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

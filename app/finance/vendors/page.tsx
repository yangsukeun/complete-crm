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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { PageHeadline } from "@/components/page-headline";
import { ArrowLeft, Building2, Plus, Pencil, Trash2 } from "lucide-react";

type Vendor = {
  id: string;
  name: string;
  bankName: string;
  accountNumber: string;
  ownerName: string;
  contactPerson: string | null;
  category: string;
};

const CATEGORIES = ["인쇄", "식대", "용역", "자재", "기타"];

export default function FinanceVendorsPage() {
  const { data: session, status } = useSession();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    bankName: "",
    accountNumber: "",
    ownerName: "",
    contactPerson: "",
    category: "기타",
  });

  const fetchVendors = useCallback(async () => {
    try {
      const res = await fetch("/api/finance/vendors");
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setVendors(Array.isArray(data) ? data : []);
    } catch {
      setVendors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") return;
    if (status === "loading") return;
    fetchVendors();
  }, [status, fetchVendors]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: "", bankName: "", accountNumber: "", ownerName: "", contactPerson: "", category: "기타" });
    setOpen(true);
  };

  const openEdit = (v: Vendor) => {
    setEditingId(v.id);
    setForm({
      name: v.name,
      bankName: v.bankName,
      accountNumber: v.accountNumber,
      ownerName: v.ownerName,
      contactPerson: v.contactPerson ?? "",
      category: v.category,
    });
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.bankName.trim() || !form.accountNumber.trim() || !form.ownerName.trim()) {
      toast.error("필수 항목을 모두 입력하세요.");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/finance/vendors/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "수정 실패");
        }
        toast.success("거래처가 수정되었습니다.");
      } else {
        const res = await fetch("/api/finance/vendors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "등록 실패");
        }
        toast.success("거래처가 등록되었습니다.");
      }
      setOpen(false);
      fetchVendors();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 거래처를 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/finance/vendors/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "삭제 실패");
      }
      toast.success("삭제되었습니다.");
      fetchVendors();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    }
  };

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
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/finance/requests">
            <ArrowLeft className="mr-2 size-4" />
            자금 관리
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageHeadline
          title="거래처 관리"
          description="자주 쓰는 거래처를 등록해 두면 결제 요청 시 빠르게 선택할 수 있습니다."
        />
        <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="mr-2 size-4" />
          거래처 등록
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground py-8 text-center text-sm">목록을 불러오는 중...</p>
      ) : vendors.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30 py-12 text-center">
          <Building2 className="mx-auto size-12 text-slate-400" />
          <p className="text-muted-foreground mt-2 text-sm">등록된 거래처가 없습니다.</p>
          <Button onClick={openCreate} variant="outline" size="sm" className="mt-4">
            <Plus className="mr-2 size-4" />
            거래처 등록
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-200 dark:border-slate-800">
                <TableHead className="font-medium">업체명</TableHead>
                <TableHead className="font-medium">예금주</TableHead>
                <TableHead className="font-medium">담당자</TableHead>
                <TableHead className="font-medium">분류</TableHead>
                <TableHead className="w-[100px] font-medium" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendors.map((v: any) => (
                <TableRow key={v.id} className="border-slate-200 dark:border-slate-800">
                  <TableCell>
                    <div className="font-medium">{v.name}</div>
                    <div className="text-muted-foreground text-sm mt-0.5">
                      {v.bankName} {v.accountNumber}
                    </div>
                  </TableCell>
                  <TableCell>{v.ownerName}</TableCell>
                  <TableCell className="text-muted-foreground">{v.contactPerson || "-"}</TableCell>
                  <TableCell>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">
                      {v.category}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(v)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(v.id)} className="text-red-600 hover:text-red-700">
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "거래처 수정" : "거래처 등록"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="vendor-name">업체명</Label>
              <Input
                id="vendor-name"
                value={form.name}
                onChange={(e: any) => setForm((f: any) => ({ ...f, name: e.target.value }))}
                placeholder="(주)○○인쇄"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vendor-bank">은행명</Label>
              <Input
                id="vendor-bank"
                value={form.bankName}
                onChange={(e: any) => setForm((f: any) => ({ ...f, bankName: e.target.value }))}
                placeholder="국민은행"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vendor-account">계좌번호</Label>
              <Input
                id="vendor-account"
                value={form.accountNumber}
                onChange={(e: any) => setForm((f: any) => ({ ...f, accountNumber: e.target.value }))}
                placeholder="123-456-789012"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vendor-owner">예금주 (입금자)</Label>
              <Input
                id="vendor-owner"
                value={form.ownerName}
                onChange={(e: any) => setForm((f: any) => ({ ...f, ownerName: e.target.value }))}
                placeholder="홍길동"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vendor-contact">담당자</Label>
              <Input
                id="vendor-contact"
                value={form.contactPerson}
                onChange={(e: any) => setForm((f: any) => ({ ...f, contactPerson: e.target.value }))}
                placeholder="담당자명 (입금자와 다를 수 있음)"
              />
            </div>
            <div className="grid gap-2">
              <Label>분류</Label>
              <Select value={form.category} onValueChange={(v: any) => setForm((f: any) => ({ ...f, category: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c: any) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                취소
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "저장 중..." : editingId ? "수정" : "등록"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

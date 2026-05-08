"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Save, Upload, X } from "lucide-react";
import Image from "next/image";

type CompanyInfo = {
  id: string;
  name: string;
  businessNumber: string | null;
  representative: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  fax: string | null;
  stampImageUrl: string | null;
  transferExecutorIds: string | null;
  annualLeaveMonthlyMaxUnderOneYear: number | null;
  annualLeaveDaysAfterFirstFullYear: number | null;
};

type UserOption = { id: string; name: string; email: string; position: string | null };

const emptyForm = {
  name: "",
  businessNumber: "",
  representative: "",
  address: "",
  phone: "",
  email: "",
  fax: "",
  stampImageUrl: "" as string,
  transferExecutorIds: [] as string[],
  /** 빈 문자열 = 앱 기본(근기법 권장 11·15), 숫자 입력 시 회사 고정 */
  annualLeaveMonthlyMaxUnderOneYear: "",
  annualLeaveDaysAfterFirstFullYear: "",
};

export function AdminCompanyForm() {
  const [form, setForm] = useState(emptyForm);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingStamp, setUploadingStamp] = useState(false);
  const mountedRef = useRef(false);
  const stampInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchCompany = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/company");
      if (!res.ok) throw new Error("Failed");
      const data: CompanyInfo | null = await res.json();
      if (!mountedRef.current) return;
      if (data) {
        let ids: string[] = [];
        if (data.transferExecutorIds) {
          try {
            const arr = JSON.parse(data.transferExecutorIds) as unknown;
            ids = Array.isArray(arr) ? arr.filter((x: any) => typeof x === "string") : [];
          } catch {
            ids = [];
          }
        }
        setForm({
          name: data?.name ?? "",
          businessNumber: data?.businessNumber ?? "",
          representative: data?.representative ?? "",
          address: data?.address ?? "",
          phone: data?.phone ?? "",
          email: data?.email ?? "",
          fax: data?.fax ?? "",
          stampImageUrl: data?.stampImageUrl ?? "",
          transferExecutorIds: ids,
          annualLeaveMonthlyMaxUnderOneYear:
            data?.annualLeaveMonthlyMaxUnderOneYear != null
              ? String(data.annualLeaveMonthlyMaxUnderOneYear)
              : "",
          annualLeaveDaysAfterFirstFullYear:
            data?.annualLeaveDaysAfterFirstFullYear != null
              ? String(data.annualLeaveDaysAfterFirstFullYear)
              : "",
        });
      }
      setLoading(false);
    } catch {
      if (mountedRef.current) {
        setLoading(false);
        toast.error("회사 정보를 불러올 수 없습니다.");
      }
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/users");
      if (!res.ok) return;
      const data = await res.json();
      if (mountedRef.current && Array.isArray(data)) {
        setUsers(data.map((u: any) => ({ id: u?.id ?? "", name: u?.name ?? "", email: u?.email ?? "", position: u?.position ?? null })));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchCompany();
    fetchUsers();
  }, [fetchCompany, fetchUsers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("회사명을 입력하세요.");
      return;
    }
    setSaving(true);
    try {
      const parseLeaveField = (raw: string, label: string): number | null => {
        const t = raw.trim();
        if (t === "") return null;
        const n = Number(t);
        if (!Number.isFinite(n) || !Number.isInteger(n)) {
          throw new Error(`${label}은(는) 0~31 사이 정수만 입력하거나 비워 앱 기본값을 쓸 수 있습니다.`);
        }
        if (n < 0 || n > 31) {
          throw new Error(`${label}은(는) 0~31 사이여야 합니다.`);
        }
        return n;
      };

      const monthlyCap = parseLeaveField(
        form.annualLeaveMonthlyMaxUnderOneYear,
        "1년 미만 월차 상한"
      );
      const daysAfterYear = parseLeaveField(
        form.annualLeaveDaysAfterFirstFullYear,
        "1년 이상 연차 일수"
      );

      const res = await fetch("/api/settings/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          businessNumber: form.businessNumber.trim() || null,
          representative: form.representative.trim() || null,
          address: form.address.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          fax: form.fax.trim() || null,
          stampImageUrl: form.stampImageUrl.trim() || null,
          transferExecutorIds: form.transferExecutorIds,
          annualLeaveMonthlyMaxUnderOneYear: monthlyCap,
          annualLeaveDaysAfterFirstFullYear: daysAfterYear,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = [data.error, data.detail].filter(Boolean).join(": ") || "저장 실패";
        throw new Error(msg);
      }
      toast.success("회사 정보가 저장되었습니다.");
      fetchCompany();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-muted-foreground text-sm py-4">불러오는 중...</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border-2 border-slate-200 bg-card p-6 shadow-sm dark:border-slate-800 space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="name">회사명 *</Label>
        <Input
          id="name"
          value={form.name}
          onChange={(e: any) => setForm((f: any) => ({ ...f, name: e.target.value }))}
          placeholder="(주)회사명"
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="businessNumber">사업자등록번호</Label>
        <Input
          id="businessNumber"
          value={form.businessNumber}
          onChange={(e: any) => setForm((f: any) => ({ ...f, businessNumber: e.target.value }))}
          placeholder="000-00-00000"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="representative">대표자명</Label>
        <Input
          id="representative"
          value={form.representative}
          onChange={(e: any) => setForm((f: any) => ({ ...f, representative: e.target.value }))}
          placeholder="홍길동"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="address">주소</Label>
        <Input
          id="address"
          value={form.address}
          onChange={(e: any) => setForm((f: any) => ({ ...f, address: e.target.value }))}
          placeholder="서울시 ○○구 ○○로 00"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="phone">전화</Label>
          <Input
            id="phone"
            value={form.phone}
            onChange={(e: any) => setForm((f: any) => ({ ...f, phone: e.target.value }))}
            placeholder="02-0000-0000"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="fax">팩스</Label>
          <Input
            id="fax"
            value={form.fax}
            onChange={(e: any) => setForm((f: any) => ({ ...f, fax: e.target.value }))}
            placeholder="02-0000-0000"
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">이메일</Label>
        <Input
          id="email"
          type="email"
          value={form.email}
          onChange={(e: any) => setForm((f: any) => ({ ...f, email: e.target.value }))}
          placeholder="contact@company.com"
        />
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-3 dark:border-slate-800 dark:bg-slate-900/30">
        <h3 className="text-sm font-semibold">연차·월차 (근로기준법 간이 산정, 2026 권장 기본)</h3>
        <p className="text-muted-foreground text-sm">
          비워 두면 앱 기본값(1년 미만 월차 상한 <strong>11일</strong>, 1년 이상 <strong>15일</strong>)을 씁니다. 입사일은
          직원 프로필의 입사일이며, 산정은 <strong>한국 표준시(KST)</strong> 달력 기준입니다.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="annualLeaveMonthlyMax">1년 미만 월차 상한 (일)</Label>
            <Input
              id="annualLeaveMonthlyMax"
              inputMode="numeric"
              value={form.annualLeaveMonthlyMaxUnderOneYear}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setForm((f) => ({ ...f, annualLeaveMonthlyMaxUnderOneYear: e.target.value }))
              }
              placeholder="11 (비우면 앱 기본)"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="annualLeaveDaysAfterYear">1년 이상 연차 일수</Label>
            <Input
              id="annualLeaveDaysAfterYear"
              inputMode="numeric"
              value={form.annualLeaveDaysAfterFirstFullYear}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setForm((f) => ({ ...f, annualLeaveDaysAfterFirstFullYear: e.target.value }))
              }
              placeholder="15 (비우면 앱 기본)"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-2">
        <Label>이체 담당자 (자금이체 팀장 승인 후 실제 이체·이체완료 처리할 담당자)</Label>
        <p className="text-muted-foreground text-sm">팀장이 승인하면 선택한 담당자에게 알림이 가며, 담당자가 이체 후 이체완료 버튼을 누릅니다.</p>
        <div className="flex flex-wrap gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/30">
          {users.map((u: any) => (
            <label key={u.id} className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={form.transferExecutorIds.includes(u.id)}
                onChange={(e: any) => {
                  setForm((f: any) =>
                    e.target.checked
                      ? { ...f, transferExecutorIds: [...f.transferExecutorIds, u.id] }
                      : { ...f, transferExecutorIds: f.transferExecutorIds.filter((id: any) => id !== u.id) }
                  );
                }}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="text-sm">
                {u?.name ?? ""}
                {u?.position != null && u.position !== "" && <span className="text-muted-foreground ml-1">({u.position})</span>}
                <span className="text-muted-foreground ml-1">{u?.email ?? ""}</span>
              </span>
            </label>
          ))}
          {users.length === 0 && <p className="text-muted-foreground text-sm">직원 목록을 불러오는 중이거나 없습니다.</p>}
        </div>
      </div>

      <div className="grid gap-2">
        <Label>도장 이미지 (견적서 발행용)</Label>
        <p className="text-muted-foreground text-sm">JPEG, PNG, GIF, WebP / 2MB 이하. 견적서에 인쇄됩니다.</p>
        <input
          ref={stampInputRef}
          type="file"
          accept="*/*"
          className="hidden"
          onChange={async (e: any) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const isImg =
              file.type.startsWith("image/") ||
              /\.(jpe?g|png|gif|webp)$/i.test(file.name);
            if (!isImg) {
              toast.error("도장은 이미지 파일(JPEG, PNG, GIF, WebP)만 등록할 수 있습니다.");
              e.target.value = "";
              return;
            }
            setUploadingStamp(true);
            try {
              const fd = new FormData();
              fd.append("stamp", file);
              const res = await fetch("/api/settings/company/stamp", { method: "POST", body: fd });
              if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error ?? "업로드 실패");
              }
              const { url } = await res.json();
              if (mountedRef.current) {
                setForm((f: any) => ({ ...f, stampImageUrl: url }));
                toast.success("도장 이미지가 등록되었습니다.");
              }
            } catch (err) {
              if (mountedRef.current) toast.error(err instanceof Error ? err.message : "업로드에 실패했습니다.");
            } finally {
              setUploadingStamp(false);
              e.target.value = "";
            }
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => stampInputRef.current?.click()}
            disabled={uploadingStamp}
          >
            <Upload className="mr-2 size-4" />
            {uploadingStamp ? "등록 중..." : "이미지 선택"}
          </Button>
          {form.stampImageUrl && (
            <>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900/50">
                <Image
                  src={form.stampImageUrl}
                  alt="도장 미리보기"
                  width={56}
                  height={56}
                  unoptimized
                  className="h-14 w-14 object-contain"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700"
                  onClick={() => setForm((f: any) => ({ ...f, stampImageUrl: "" }))}
                >
                  <X className="size-4" />
                  제거
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="pt-2">
        <Button type="submit" disabled={saving} className="bg-slate-800 hover:bg-slate-900">
          <Save className="mr-2 size-4" />
          {saving ? "저장 중..." : "저장"}
        </Button>
      </div>
    </form>
  );
}

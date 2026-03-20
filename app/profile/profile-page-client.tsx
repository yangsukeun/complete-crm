"use client";

import { useCallback, useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { User, LogOut } from "lucide-react";
import { PageHeadline } from "@/components/page-headline";

type Profile = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  workPhone: string | null;
  workEmail: string | null;
  bankAccount: string | null;
  address: string | null;
  residentId: string | null;
  department: string | null;
  position: string | null;
  joinDate: string;
  role: string;
  leaveRemaining?: number;
  annualTotal?: number;
  annualCarryOver?: number;
  totalAvailable?: number;
  annualUsed?: number;
  manualDeduction?: number;
  badgePreset?: string | null;
};

export function ProfilePageClient({
  isAdmin,
  isNewUser = false,
}: {
  isAdmin: boolean;
  isNewUser?: boolean;
}) {
  const { update: updateSession } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [phone, setPhone] = useState("");
  const [workPhone, setWorkPhone] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [address, setAddress] = useState("");
  const [residentId, setResidentId] = useState("");
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");
  const [joinDate, setJoinDate] = useState("");
  const [badgePreset, setBadgePreset] = useState<string>("default");

  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [positions, setPositions] = useState<{ id: string; name: string }[]>([]);
  const [leaveRemaining, setLeaveRemaining] = useState("");
  const [manualDeduction, setManualDeduction] = useState("");
  const [annualCarryOver, setAnnualCarryOver] = useState("");

  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    setFetchError(null);
    setLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch("/api/profile/me", { signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFetchError(data.details || data.error || "내 정보를 불러올 수 없습니다.");
        setProfile(null);
        setLoading(false);
        return;
      }
      setProfile(data);
      setName(data.name ?? "");
      setEmail(data.email ?? "");
      setPhone(data.phone ?? "");
      setWorkPhone(data.workPhone ?? "");
      setWorkEmail(data.workEmail ?? "");
      setBankAccount(data.bankAccount ?? "");
      setAddress(data.address ?? "");
      setResidentId(data.residentId ?? "");
      setDepartment(data.department ?? "");
      setPosition(data.position ?? "");
      setJoinDate(data.joinDate?.slice(0, 10) ?? "");
      setLeaveRemaining(String(data.leaveRemaining ?? 0));
      setManualDeduction(String(data.manualDeduction ?? 0));
      setAnnualCarryOver(String(data.annualCarryOver ?? 0));
      setBadgePreset(data.badgePreset ?? "default");
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        setFetchError("요청 시간이 초과되었습니다. 다시 시도해 주세요.");
      } else {
        setFetchError("요청 중 오류가 발생했습니다.");
      }
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
    const fallback = setTimeout(() => {
      setLoading((prev: any) => {
        if (prev) return false;
        return prev;
      });
    }, 12000);
    return () => clearTimeout(fallback);
  }, [fetchProfile]);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings/departments").then((r: any) => (r.ok ? r.json() : [])),
      fetch("/api/settings/positions").then((r: any) => (r.ok ? r.json() : [])),
    ]).then(([depts, pos]) => {
      setDepartments(Array.isArray(depts) ? depts : []);
      setPositions(Array.isArray(pos) ? pos : []);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password && password !== passwordConfirm) {
      toast.error("비밀번호와 비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    if (password && password.length < 4) {
      toast.error("비밀번호는 4자 이상 입력하세요.");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        workPhone: workPhone.trim() || null,
        workEmail: workEmail.trim() || null,
        bankAccount: bankAccount.trim() || null,
        address: address.trim() || null,
        residentId: residentId.trim() || null,
        department: department.trim() || null,
        position: position.trim() || null,
        badgePreset: badgePreset === "default" ? null : badgePreset,
      };
      if (password) body.password = password;
      if (isAdmin) {
        if (joinDate) body.joinDate = joinDate;
        const manual = parseFloat(manualDeduction);
        if (!Number.isNaN(manual) && manual >= 0) body.manualDeduction = manual;
        const carry = parseFloat(annualCarryOver);
        if (!Number.isNaN(carry) && carry >= 0) body.annualCarryOver = carry;
      }

      const res = await fetch("/api/profile/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "저장 실패");
      setProfile(data);
      if (data.joinDate) setJoinDate(data.joinDate.slice(0, 10));
      if (data.leaveRemaining != null) setLeaveRemaining(String(data.leaveRemaining));
      if (data.manualDeduction != null) setManualDeduction(String(data.manualDeduction));
      if (data.annualCarryOver != null) setAnnualCarryOver(String(data.annualCarryOver));
      if (password) {
        setPassword("");
        setPasswordConfirm("");
      }
      await updateSession({
        name: data.name,
        email: data.email ?? undefined,
        badgePreset: data.badgePreset ?? undefined,
      });
      toast.success("저장되었습니다.");
      fetchProfile();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <p className="text-muted-foreground">불러오는 중...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 p-4">
        <p className="text-muted-foreground text-center">
          {fetchError ?? "내 정보를 불러올 수 없습니다."}
        </p>
        <Button variant="outline" onClick={() => { setLoading(true); fetchProfile(); }}>
          다시 시도
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-3xl">
      <PageHeadline
        title="내 정보"
        description={
          isNewUser
            ? "처음 로그인하셨습니다. 이름을 입력한 뒤 저장해 주세요."
            : "아래 입력란에 정보를 기입한 뒤 저장해 주세요. " +
              (isAdmin ? "입사일과 휴가 잔여일은 관리자만 수정할 수 있습니다." : "이름·연락처·직책 등은 본인이 직접 수정할 수 있습니다.")
        }
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="border-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">기본 정보 (본인 수정 가능)</CardTitle>
            <p className="text-muted-foreground text-sm font-normal">
              이름, 이메일, 연락처, 업무 연락처, 업무 이메일, 은행계좌번호, 주소지, 주민번호, 부서, 직책을 선택·수정하세요.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium">이름</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e: any) => setName(e.target.value)}
                  placeholder="이름을 입력하세요"
                  required
                  className="h-10 border bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">이메일 주소</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e: any) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  required
                  className="h-10 border bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">비밀번호 변경 (선택)</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e: any) => setPassword(e.target.value)}
                  placeholder="변경 시에만 입력 (4자 이상)"
                  className="h-10 border bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="passwordConfirm" className="text-sm font-medium">비밀번호 확인</Label>
                <Input
                  id="passwordConfirm"
                  type="password"
                  value={passwordConfirm}
                  onChange={(e: any) => setPasswordConfirm(e.target.value)}
                  placeholder="비밀번호 변경 시 재입력"
                  className="h-10 border bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-sm font-medium">연락처</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e: any) => setPhone(e.target.value)}
                  placeholder="010-0000-0000"
                  className="h-10 border bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workPhone" className="text-sm font-medium">업무 연락처</Label>
                <Input
                  id="workPhone"
                  value={workPhone}
                  onChange={(e: any) => setWorkPhone(e.target.value)}
                  placeholder="업무용 전화번호"
                  className="h-10 border bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workEmail" className="text-sm font-medium">업무 이메일</Label>
                <Input
                  id="workEmail"
                  type="email"
                  value={workEmail}
                  onChange={(e: any) => setWorkEmail(e.target.value)}
                  placeholder="업무용 이메일 (선택)"
                  className="h-10 border bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bankAccount" className="text-sm font-medium">은행계좌번호</Label>
                <Input
                  id="bankAccount"
                  value={bankAccount}
                  onChange={(e: any) => setBankAccount(e.target.value)}
                  placeholder="은행명 계좌번호"
                  className="h-10 border bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address" className="text-sm font-medium">주소지</Label>
                <Input
                  id="address"
                  value={address}
                  onChange={(e: any) => setAddress(e.target.value)}
                  placeholder="주소를 입력하세요"
                  className="h-10 border bg-background"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="residentId" className="text-sm font-medium">주민번호</Label>
                <Input
                  id="residentId"
                  value={residentId}
                  onChange={(e: any) => setResidentId(e.target.value)}
                  placeholder="000000-0000000"
                  className="h-10 border bg-background max-w-xs"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">부서</Label>
                <Select value={department || "none"} onValueChange={(v: any) => setDepartment(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-10 border bg-background">
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">선택 안 함</SelectItem>
                    {departments.map((d: any) => (
                      <SelectItem key={d.id} value={d.name}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">직책</Label>
                <Select value={position || "none"} onValueChange={(v: any) => setPosition(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-10 border bg-background">
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">선택 안 함</SelectItem>
                    {positions.map((p: any) => (
                      <SelectItem key={p.id} value={p.name}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">뱃지 스타일</CardTitle>
            <p className="text-muted-foreground text-sm font-normal">
              상단 헤더의 내 역할 뱃지·아바타 색상을 선택합니다. 기본은 역할별 색상(대표·팀장·직원)입니다.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">스타일</Label>
              <Select value={badgePreset} onValueChange={setBadgePreset}>
                <SelectTrigger className="h-10 border bg-background max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">기본 (역할별)</SelectItem>
                  <SelectItem value="violet">보라 (Violet)</SelectItem>
                  <SelectItem value="amber">노랑/주황 (Amber)</SelectItem>
                  <SelectItem value="emerald">에메랄드 (Emerald)</SelectItem>
                  <SelectItem value="blue">파랑 (Blue)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">입사일 / 휴가</CardTitle>
            <p className="text-muted-foreground text-sm font-normal">
              휴가 잔여일 = 입사일 기준 2026년 부여일 − 시스템 사용일 − 실제 사용한 일수(최초 1회만). 입사일은 관리자만 수정 가능합니다.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="joinDate" className="text-sm font-medium">입사일</Label>
                <Input
                  id="joinDate"
                  type="date"
                  value={joinDate}
                  onChange={(e: any) => setJoinDate(e.target.value)}
                  disabled={!isAdmin}
                  className={`h-10 border bg-background ${!isAdmin ? "bg-muted cursor-not-allowed" : ""}`}
                />
                {!isAdmin && (
                  <p className="text-muted-foreground text-xs">관리자만 수정할 수 있습니다.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">휴가 잔여일 (자동계산)</Label>
                <p className="text-lg font-semibold">{leaveRemaining}일</p>
                {profile.annualTotal != null && (
                  <p className="text-muted-foreground text-xs">
                    {(profile.annualCarryOver ?? 0) > 0 ? (
                      <>
                        부여 {profile.annualTotal}일 + 이월 {profile.annualCarryOver}일 = 전체 {profile.totalAvailable ?? profile.annualTotal + (profile.annualCarryOver ?? 0)}일
                        {" − "}사용 {profile.annualUsed ?? 0}일
                        {(profile.manualDeduction ?? 0) > 0 && <> − 실제 사용 차감 {profile.manualDeduction}일</>}
                        {" = "}{leaveRemaining}일
                      </>
                    ) : (
                      <>
                        부여 {profile.annualTotal}일 − 사용 {profile.annualUsed ?? 0}일
                        {(profile.manualDeduction ?? 0) > 0 && <> − 실제 사용 차감 {profile.manualDeduction}일</>}
                        {" = "}{leaveRemaining}일
                      </>
                    )}
                  </p>
                )}
              </div>
            </div>
            {isAdmin && (
              <div className="space-y-2 border-t pt-4">
                <Label htmlFor="annualCarryOver" className="text-sm font-medium">
                  이월 연차 (전년도 미사용분, 일)
                </Label>
                <Input
                  id="annualCarryOver"
                  type="number"
                  min={0}
                  step={0.5}
                  value={annualCarryOver}
                  onChange={(e: any) => setAnnualCarryOver(e.target.value)}
                  placeholder="0"
                  className="h-10 w-32 border bg-background"
                />
              </div>
            )}
            {isAdmin && (profile.manualDeduction ?? 0) === 0 && (
              <div className="space-y-2 border-t pt-4">
                <Label htmlFor="manualDeduction" className="text-sm font-medium">
                  실제 사용한 일수 (최초 1회만 입력)
                </Label>
                <p className="text-muted-foreground text-xs">
                  시스템에 기록되기 전에 이미 사용한 연차가 있으면 여기 입력 후 저장하세요. 저장 후에는 수정할 수 없습니다.
                </p>
                <Input
                  id="manualDeduction"
                  type="number"
                  min={0}
                  step={0.5}
                  value={manualDeduction}
                  onChange={(e: any) => setManualDeduction(e.target.value)}
                  placeholder="0"
                  className="h-10 w-32 border bg-background"
                />
              </div>
            )}
            {isAdmin && (profile.manualDeduction ?? 0) > 0 && (
              <p className="text-muted-foreground border-t pt-4 text-sm">
                실제 사용 차감: {profile.manualDeduction}일 (최초 1회 설정 완료, 수정 불가)
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center gap-3 rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
          <Button type="submit" size="lg" disabled={saving} className="shrink-0">
            {saving ? "저장 중..." : "저장하기"}
          </Button>
          <p className="text-muted-foreground text-sm">
            입력한 내용을 반영하려면 위 버튼을 눌러주세요.
          </p>
        </div>

        <Card className="border-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">계정</CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                signOut({ callbackUrl: "/login" });
              }}
              className="gap-2"
            >
              <LogOut className="size-4" />
              로그아웃
            </Button>
            <p className="text-muted-foreground mt-2 text-xs">
              로그아웃하면 로그인 화면으로 이동합니다.
            </p>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

export function NewEmployeeForm() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [workPhone, setWorkPhone] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [address, setAddress] = useState("");
  const [residentId, setResidentId] = useState("");
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");
  const [role, setRole] = useState<"USER" | "TEAM_LEAD">("USER");
  const [joinDate, setJoinDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [positions, setPositions] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings/departments").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/settings/positions").then((r) => (r.ok ? r.json() : [])),
    ]).then(([depts, pos]) => {
      setDepartments(Array.isArray(depts) ? depts : []);
      setPositions(Array.isArray(pos) ? pos : []);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("아이디(이메일)를 입력하세요.");
      return;
    }
    if (!password || password.length < 4) {
      toast.error("비밀번호는 4자 이상 입력하세요.");
      return;
    }
    if (!name.trim()) {
      toast.error("이름을 입력하세요.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: name.trim(),
          role,
          phone: phone.trim() || undefined,
          workPhone: workPhone.trim() || undefined,
          workEmail: workEmail.trim() || undefined,
          bankAccount: bankAccount.trim() || undefined,
          address: address.trim() || undefined,
          residentId: residentId.trim() || undefined,
          department: department.trim() || undefined,
          position: position.trim() || undefined,
          joinDate: joinDate || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "계정 생성에 실패했습니다.");
      }
      toast.success("직원 계정이 생성되었습니다.");
      router.push("/admin/employees");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "계정 생성에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-2">
        <Link
          href="/admin/employees"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" />
          직원 목록으로
        </Link>
      </div>

      <Card className="border-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">로그인 정보</CardTitle>
          <p className="text-muted-foreground text-sm font-normal">
            아이디(이메일)와 비밀번호를 입력하세요.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="email">아이디 (이메일)</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@company.com"
              required
              className="h-10 border bg-background"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">비밀번호</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="4자 이상"
              required
              minLength={4}
              className="h-10 border bg-background"
            />
          </div>
          <div className="space-y-2">
            <Label>역할 (직책에 따른 기능)</Label>
            <Select value={role} onValueChange={(v) => setRole(v as "USER" | "TEAM_LEAD")}>
              <SelectTrigger className="h-10 border bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USER">직원 — 기본 업무(일정·업무·연차 신청·자금 요청)</SelectItem>
                <SelectItem value="TEAM_LEAD">팀장 — 직원 기능 + 휴가 1차 승인, 자금이체 결재(확인)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              직책에 따라 부여되는 기능이 달라집니다. 팀장은 휴가 1차 승인·자금이체 알람/확인 권한이 있습니다.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">기본 정보 (내정보와 동일)</CardTitle>
          <p className="text-muted-foreground text-sm font-normal">
            이름, 연락처, 업무 연락처, 업무 이메일, 은행계좌번호, 주소지, 주민번호, 부서, 직책, 입사일을 입력하세요.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">이름</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="이름을 입력하세요"
                required
                className="h-10 border bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">연락처</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="010-0000-0000"
                className="h-10 border bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workPhone">업무 연락처</Label>
              <Input
                id="workPhone"
                value={workPhone}
                onChange={(e) => setWorkPhone(e.target.value)}
                placeholder="업무용 전화번호"
                className="h-10 border bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workEmail">업무 이메일</Label>
              <Input
                id="workEmail"
                type="email"
                value={workEmail}
                onChange={(e) => setWorkEmail(e.target.value)}
                placeholder="업무용 이메일 (선택)"
                className="h-10 border bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bankAccount">은행계좌번호</Label>
              <Input
                id="bankAccount"
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
                placeholder="은행명 계좌번호"
                className="h-10 border bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">주소지</Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="주소를 입력하세요"
                className="h-10 border bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="residentId">주민번호</Label>
              <Input
                id="residentId"
                value={residentId}
                onChange={(e) => setResidentId(e.target.value)}
                placeholder="000000-0000000"
                className="h-10 border bg-background max-w-xs"
              />
            </div>
            <div className="space-y-2">
              <Label>부서</Label>
              <Select value={department || "none"} onValueChange={(v) => setDepartment(v === "none" ? "" : v)}>
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
              <Label>직책</Label>
              <Select value={position || "none"} onValueChange={(v) => setPosition(v === "none" ? "" : v)}>
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
            <div className="space-y-2">
              <Label htmlFor="joinDate">입사일</Label>
              <Input
                id="joinDate"
                type="date"
                value={joinDate}
                onChange={(e) => setJoinDate(e.target.value)}
                className="h-10 border bg-background"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
        <Button type="submit" size="lg" disabled={saving} className="shrink-0">
          {saving ? "생성 중..." : "계정 생성"}
        </Button>
        <Link href="/admin/employees">
          <Button type="button" variant="outline">
            취소
          </Button>
        </Link>
      </div>
    </form>
  );
}

import { getAppSession } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeadline } from "@/components/page-headline";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  FileText,
  Layers,
  FolderKanban,
  Building2,
  Image,
  Settings,
  Shield,
  Trash2,
} from "lucide-react";

const menuItems = [
  { href: "/admin/permissions", label: "기능 권한", description: "직책별·사용자별 메뉴·기능 접근 설정", icon: Shield },
  { href: "/admin/employees", label: "직원 관리", description: "직원 계정 추가·수정·역할 관리", icon: Users },
  { href: "/admin/logs", label: "Daily Report 조회", description: "직원별 Daily Report 조회", icon: FileText },
  { href: "/admin/departments-positions", label: "부서·직책", description: "부서·직책 마스터 관리", icon: Layers },
  { href: "/admin/projects", label: "브랜드/프로젝트", description: "브랜드·프로젝트 관리", icon: FolderKanban },
  { href: "/admin/trash", label: "삭제된 항목", description: "휴지통: 프로젝트·게시물 복원·영구 삭제", icon: Trash2 },
  { href: "/admin/company", label: "회사 정보", description: "견적서용 회사 정보·도장", icon: Building2 },
  { href: "/admin/settings/logo", label: "로고 설정", description: "헤더 로고 이미지 변경", icon: Image },
];

export default async function AdminPage() {
  const session = await getAppSession();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "EXECUTIVE" && session.user.role !== "ADMIN") redirect("/dashboard");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-4xl mx-auto">
      <PageHeadline
        title="관리"
        description="회사·직원·설정을 관리합니다. 메뉴를 선택하세요."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {menuItems.map((item: any) => (
          <Link key={item.href} href={item.href}>
            <Card className="h-full transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/50">
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <div className="flex size-10 items-center justify-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400">
                  <item.icon className="size-5" />
                </div>
                <div>
                  <CardTitle className="text-base">{item.label}</CardTitle>
                  <CardDescription className="text-sm">{item.description}</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">클릭하여 이동</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

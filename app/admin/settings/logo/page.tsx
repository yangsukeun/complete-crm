import { getAppSession } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeadline } from "@/components/page-headline";
import { ArrowLeft } from "lucide-react";
import { LogoUploadForm } from "./logo-upload-form";

export default async function AdminLogoSettingsPage() {
  const session = await getAppSession();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "EXECUTIVE" && session.user.role !== "ADMIN") redirect("/dashboard");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 md:p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/company">
            <ArrowLeft className="mr-2 size-4" />
            관리자
          </Link>
        </Button>
      </div>
      <PageHeadline
        title="로고 설정"
        description="헤더에 표시되는 COMPLETE CRM 로고를 변경할 수 있습니다. 미설정 시 기본 텍스트가 표시됩니다."
      />
      <LogoUploadForm />
    </div>
  );
}

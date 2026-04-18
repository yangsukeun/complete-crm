import Link from "next/link";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { HelpAdminSidebar } from "./help-admin-sidebar";

export default async function AdminHelpLayout({ children }: { children: React.ReactNode }) {
  const session = await getAppSession();
  if (session?.user?.role !== "ADMIN") {
    return (
      <div className="p-8 max-w-lg">
        <h1 className="text-lg font-semibold">접근 제한</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          도움말 관리는 <strong>ADMIN</strong> 역할만 사용할 수 있습니다. (미들웨어에서도 403 처리)
        </p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-primary underline">
          대시보드로
        </Link>
      </div>
    );
  }

  const articles = await prisma.helpArticle.findMany({
    orderBy: [{ category: "asc" }, { orderIndex: "asc" }, { title: "asc" }],
    select: { slug: true, title: true, category: true, isPublished: true, orderIndex: true },
  });

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] w-full border-t border-border">
      <aside className="hidden w-60 shrink-0 overflow-y-auto border-r border-border bg-muted/15 p-3 md:block lg:w-64">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Link href="/admin" className="text-xs text-muted-foreground hover:text-foreground">
            ← 관리 홈
          </Link>
        </div>
        <p className="mb-2 text-sm font-semibold">도움말 DB</p>
        <HelpAdminSidebar articles={articles} />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

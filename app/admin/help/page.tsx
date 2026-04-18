import Link from "next/link";
import { getAppSession } from "@/auth";
import { HelpAdminSidebar } from "./help-admin-sidebar";
import prisma from "@/lib/prisma";

export default async function AdminHelpIndexPage() {
  const session = await getAppSession();
  if (session?.user?.role !== "ADMIN") {
    return null;
  }

  const articles = await prisma.helpArticle.findMany({
    orderBy: [{ category: "asc" }, { orderIndex: "asc" }],
    select: { slug: true, title: true, category: true, isPublished: true, orderIndex: true },
  });

  return (
    <div className="flex flex-col md:flex-row">
      <aside className="border-b border-border p-3 md:hidden">
        <p className="mb-2 text-sm font-semibold">문서 목록</p>
        <HelpAdminSidebar articles={articles} />
      </aside>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <p className="text-muted-foreground max-w-md text-sm">
          왼쪽에서 문서를 선택하거나 <strong>새 문서</strong>를 만드세요. 모든 도움말·투어·릴리즈 노트는 DB에서 읽히도록 연결할 수 있습니다.
        </p>
        {articles[0] && (
          <Link
            href={`/admin/help/articles/${articles[0].slug}`}
            className="text-sm font-medium text-primary underline underline-offset-2"
          >
            첫 문서로 이동 → {articles[0].title}
          </Link>
        )}
      </div>
    </div>
  );
}

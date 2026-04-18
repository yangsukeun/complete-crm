import Link from "next/link";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { helpArticlePublicWhere } from "@/lib/help-visibility";
import { HELP_CATEGORY_NAV } from "@/lib/help-categories";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpSearch } from "./components/help-search";

export const dynamic = "force-dynamic";

const FAQ_LINKS = [
  { href: "/help/faq-common-issues", label: "자주 묻는 질문·오류" },
  { href: "/help/getting-started", label: "처음 시작하기" },
  { href: "/help/notifications-setup", label: "알림 설정" },
  { href: "/help/trash-and-restore", label: "휴지통·복원" },
] as const;

export default async function HelpCenterPage() {
  const session = await getAppSession();
  const role = session?.user?.role;

  const articles = await prisma.helpArticle.findMany({
    where: helpArticlePublicWhere(role),
    orderBy: [{ category: "asc" }, { orderIndex: "asc" }, { title: "asc" }],
    select: { slug: true, title: true, summary: true, category: true, orderIndex: true },
  });

  const byCat = new Map<string, typeof articles>();
  for (const a of articles) {
    const list = byCat.get(a.category) ?? [];
    list.push(a);
    byCat.set(a.category, list);
  }

  const navCats = HELP_CATEGORY_NAV.filter((c) => !("adminOnly" in c) || role === "ADMIN");

  return (
    <div className="space-y-10 p-4 md:p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 lg:max-w-2xl">
          <h1 className="mb-1 text-2xl font-bold tracking-tight">도움말 센터</h1>
          <p className="text-muted-foreground mb-4 text-sm">
            가이드·FAQ·변경 이력을 한곳에서 검색하고 바로 이동할 수 있습니다.
          </p>
          <HelpSearch variant="hero" className="w-full" />
        </div>
        <Button asChild variant="secondary" className="shrink-0 self-start">
          <Link href="/help/changelog">변경 이력 보기</Link>
        </Button>
      </div>

      {navCats.map((cat) => {
        const list = (byCat.get(cat.id) ?? []).slice().sort((a, b) => a.orderIndex - b.orderIndex || a.title.localeCompare(b.title));
        return (
          <section key={cat.id} id={`help-cat-${cat.id}`} className="scroll-mt-24">
            <h2 className="mb-4 border-b border-border pb-2 text-lg font-semibold">{cat.label}</h2>
            {list.length === 0 ? (
              <p className="text-muted-foreground text-sm">이 카테고리에 등록된 문서가 없습니다.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {list.map((a) => (
                  <Card key={a.slug} className="gap-3 py-4">
                    <CardHeader className="px-4 pb-0">
                      <CardTitle className="text-base leading-snug">{a.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-muted-foreground line-clamp-3 px-4 text-sm">{a.summary}</CardContent>
                    <CardFooter className="px-4 pt-0">
                      <Button asChild size="sm" variant="default">
                        <Link href={`/help/${encodeURIComponent(a.slug)}`}>자세히</Link>
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </section>
        );
      })}

      <section id="help-faq" className="scroll-mt-24 rounded-xl border border-border bg-muted/20 p-5 md:p-6">
        <h2 className="mb-3 text-lg font-semibold">FAQ</h2>
        <p className="text-muted-foreground mb-4 text-sm">
          자주 찾는 주제로 바로 이동합니다. 전체 검색은 상단 검색창 또는{" "}
          <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-xs">⌘K</kbd> /{" "}
          <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-xs">Ctrl+K</kbd>를
          이용하세요.
        </p>
        <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {FAQ_LINKS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="text-primary inline-flex text-sm font-medium underline-offset-4 hover:underline"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { helpArticlePublicWhere } from "@/lib/help-visibility";
import { categoryLabel } from "@/lib/help-categories";
import { Button } from "@/components/ui/button";
import { ArticleRenderer } from "../components/article-renderer";
import { HelpArticleFeedback } from "../components/help-article-feedback";

export const dynamic = "force-dynamic";

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getAppSession();
  const { slug } = await params;

  const article = await prisma.helpArticle.findFirst({
    where: { slug, ...helpArticlePublicWhere(session?.user?.role) },
  });
  if (!article) notFound();

  const relatedOrder = article.relatedSlugs;
  const related = await prisma.helpArticle.findMany({
    where: {
      slug: { in: relatedOrder },
      ...helpArticlePublicWhere(session?.user?.role),
    },
    select: { slug: true, title: true },
  });
  const relatedSorted = relatedOrder
    .map((s) => related.find((r) => r.slug === s))
    .filter((x): x is { slug: string; title: string } => Boolean(x))
    .slice(0, 5);

  const catLabel = categoryLabel(article.category);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6 lg:p-8">
      <nav aria-label="Breadcrumb" className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm">
        <Link href="/help" className="text-primary hover:underline">
          도움말
        </Link>
        <ChevronRight className="size-4 shrink-0 opacity-60" aria-hidden />
        <Link href={`/help#help-cat-${article.category}`} className="text-primary hover:underline">
          {catLabel}
        </Link>
        <ChevronRight className="size-4 shrink-0 opacity-60" aria-hidden />
        <span className="text-foreground min-w-0 truncate font-medium">{article.title}</span>
      </nav>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <header className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{article.title}</h1>
          <p className="text-muted-foreground mt-2 text-sm">{article.summary}</p>
        </header>
        <HelpArticleFeedback slug={article.slug} className="shrink-0 sm:pt-1" />
      </div>

      <article className="rounded-xl border border-border bg-card p-4 md:p-6">
        <ArticleRenderer content={article.bodyMd} />
      </article>

      {relatedSorted.length > 0 ? (
        <section className="rounded-xl border border-border bg-muted/15 p-4 md:p-5">
          <h2 className="mb-3 text-sm font-semibold">관련 문서</h2>
          <ul className="space-y-2">
            {relatedSorted.map((r) => (
              <li key={r.slug}>
                <Link href={`/help/${encodeURIComponent(r.slug)}`} className="text-primary text-sm font-medium hover:underline">
                  {r.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/help">← 목록으로</Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href="/help/changelog">변경 이력</Link>
        </Button>
      </div>
    </div>
  );
}

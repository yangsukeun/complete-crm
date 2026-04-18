import { getAppSession } from "@/auth";
import { HelpArticleEditor } from "../../help-article-editor";

export default async function AdminHelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getAppSession();
  if (session?.user?.role !== "ADMIN") {
    return null;
  }

  const { slug } = await params;
  return <HelpArticleEditor slug={slug} />;
}

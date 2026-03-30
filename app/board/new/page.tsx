import { getAppSession } from "@/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { PageHeadline } from "@/components/page-headline";
import { BoardNewClient } from "../board-new-client";

export default async function BoardNewPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");

  const cookieStore = await cookies();
  const appMode = cookieStore.get("app_mode")?.value;
  if (appMode !== "company") redirect("/choose-mode");

  const { category } = await searchParams;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4 md:p-6">
      <PageHeadline
        title="자료 올리기"
        description="제목·구분·본문(텍스트·HTML·미리보기)과 첨부를 입력한 뒤 등록하면 상세 페이지로 이동합니다."
      />
      <BoardNewClient initialCategory={category} />
    </div>
  );
}

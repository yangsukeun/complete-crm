import Link from "next/link";
import { getAppSession } from "@/auth";
import { PageHeadline } from "@/components/page-headline";
import { Button } from "@/components/ui/button";
import { UserNotesBoard } from "@/components/user-notes/user-notes-board";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const session = await getAppSession();
  if (!session?.user?.id) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6">
        <p className="text-muted-foreground text-sm">로그인이 필요합니다.</p>
        <Button asChild variant="outline">
          <Link href="/login">로그인</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 md:px-6">
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2 text-muted-foreground">
          <Link href="/tasks">← 업무 목록</Link>
        </Button>
        <PageHeadline title="메모장" description="카드를 눌러 편집하고, 색으로 분류합니다." />
      </div>
      <UserNotesBoard />
    </div>
  );
}

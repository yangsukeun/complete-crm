import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { canSeeCsToolsDashboardCard } from "@/lib/cs-tools-access";
import { workspaceHomeHref } from "@/lib/workspace-page-access";
import { workspaceLabels } from "@/lib/workspace-areas";
import { canViewWorkspaceHelp, isWorkspaceHelpArea, workspaceHelp } from "@/lib/workspace-help";

export const dynamic = "force-dynamic";
export const metadata = { title: "부서별 사용 안내", robots: { index: false, follow: false } };

export default async function WorkspaceHelpPage({ params }: { params: Promise<{ area: string }> }) {
  const { area } = await params;
  if (!isWorkspaceHelpArea(area)) notFound();
  const id = (await getAppSession())?.user?.id;
  if (!id) redirect("/login");
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, department: true, accountDisabled: true },
  });
  if (!user || !canViewWorkspaceHelp(user, area)) notFound();

  const guide = workspaceHelp[area];
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-8 sm:py-8">
      <Link href={workspaceHomeHref(area)} prefetch={false}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-violet-800 underline-offset-4 hover:underline">
        ← {workspaceLabels[area]} 홈
      </Link>
      <header className="rounded-2xl border border-violet-200 bg-violet-50 p-5">
        <p className="text-xs font-semibold tracking-wide text-violet-700">COMPLETE CRM · 부서별 도움말</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-violet-950 sm:text-3xl">{workspaceLabels[area]} 사용 안내</h1>
        <p className="mt-2 break-words text-sm leading-6 text-violet-950">{guide.intro}</p>
      </header>
      <ol className="space-y-3" aria-label="주요 업무 순서">
        {guide.workflows.map((workflow, index) => {
          const generalLeave = workflow.href === "/cs-tools/leave" && !canSeeCsToolsDashboardCard(user);
          return (
            <li key={workflow.title} className="min-w-0 rounded-xl border bg-card p-4 sm:p-5">
              <p className="text-xs font-semibold text-violet-700">안내 {String(index + 1).padStart(2, "0")}</p>
              <h2 className="mb-2 mt-1 break-words text-lg font-semibold">{workflow.title}</h2>
              {workflow.access && <p className="mb-2 text-sm font-medium text-muted-foreground">{workflow.access}</p>}
              <ol className="list-decimal space-y-1 pl-5 text-sm leading-6">
                {workflow.steps.map(step => <li className="break-words" key={step}>{step}</li>)}
              </ol>
              <div className="mt-2 flex flex-wrap gap-x-4">
                <Link href={generalLeave ? "/leave" : workflow.href} prefetch={false}
                  className="inline-flex min-h-11 items-center break-words text-sm font-semibold text-violet-800 underline-offset-4 hover:underline">
                  {generalLeave ? "휴가 신청" : workflow.linkLabel} →
                </Link>
                {workflow.related?.map(link => (
                  <Link key={link.href} href={link.href} prefetch={false}
                    className="inline-flex min-h-11 items-center break-words text-sm font-semibold text-violet-800 underline-offset-4 hover:underline">
                    {link.label} →
                  </Link>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="rounded-lg border bg-muted/40 px-4 py-3 text-sm leading-6 text-muted-foreground">
        안내 페이지에서 권한이 바뀌지 않습니다. 메뉴가 보이지 않거나 기존 기록이 예상과 다르면 부서 담당자에게 확인해 주세요.
      </p>
    </main>
  );
}

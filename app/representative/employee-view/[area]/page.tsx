import Link from "next/link";
import { requireRepresentative } from "@/lib/representative-access";
import { notFound } from "next/navigation";
import { isWorkspaceArea, REPRESENTATIVE_HOME } from "@/lib/crm-login-landing";
import { WorkspaceHome } from "@/components/workspace-home";
import { csSectionNavItems } from "@/lib/cs-section-nav";
import { CsScreen } from "@/components/cs-screen";
import { PageHeadline } from "@/components/page-headline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, CalendarPlus, Cake, Link2, Megaphone } from "lucide-react";
import { csClientNavDescription, csClientNavLabel } from "@/lib/cs-client-access";

export default async function EmployeeViewPage({ params }: { params: Promise<{ area: string }> }) {
  await requireRepresentative();
  const { area } = await params;
  if (!isWorkspaceArea(area)) notFound();

  return (
    <>
      <div className="mx-auto w-full max-w-5xl px-4 pt-5 sm:px-8">
        <Link href={REPRESENTATIVE_HOME} className="inline-flex min-h-11 items-center text-sm font-semibold text-violet-800">
          ← 대표자 페이지
        </Link>
      </div>
      {area === "cs" ? (
        <CsScreen>
          <PageHeadline title="CS 링크 허브" description="CS 업무에 쓰는 외부 도구·링크를 한곳에서 엽니다." />
          <div className="rounded-xl border bg-muted/40 p-4 text-sm">
            <p className="font-semibold">CS 일반 직원 화면 · 읽기 전용</p>
            <p className="mt-1 text-muted-foreground">근태, 공지 본문, 개인 정보, 외부 도구는 불러오지 않습니다. 팀장·센터장의 추가 메뉴는 표시되지 않습니다.</p>
          </div>
          <nav className="flex flex-wrap items-center gap-2" aria-label="CS 기본 메뉴">
            {csSectionNavItems({ canManageClients: false, canViewAwayOverview: false }).map(({ id, label }) => (
              <Badge key={id} variant="outline" className="px-3 py-2">{label}</Badge>
            ))}
          </nav>
          <section aria-label="근태 버튼 예시" className="flex flex-wrap gap-3 rounded-xl border bg-muted/30 p-4">
            {["출근", "퇴근", "부재중"].map(label => <Button key={label} variant="outline" disabled>{label}</Button>)}
          </section>
          <section className="grid gap-4 sm:grid-cols-2" aria-label="CS 홈 카드">
            {[
              { label: "CS 연차 신청·관리", description: "CRM에서 연차 신청·취소와 기존 승인 상태를 확인합니다.", Icon: CalendarPlus },
              { label: csClientNavLabel(false), description: csClientNavDescription(false), Icon: Building2 },
              { label: "CS 라운지", description: "직원 화면에서 최근 공지를 확인합니다.", Icon: Megaphone, wide: true },
              { label: "이번 달 생일", description: "미리보기에서는 직원 생일을 표시하지 않습니다.", Icon: Cake, wide: true },
              { label: "CS 링크", description: "직원 화면에서 사용할 수 있는 외부 도구가 표시됩니다.", Icon: Link2, wide: true },
            ].map(({ label, description, Icon, wide }) => (
              <article key={label} className={`flex flex-col gap-1 rounded-xl border bg-card p-5 ${wide ? "sm:col-span-2" : ""}`}>
                <h2 className="flex items-center gap-2 text-base font-semibold"><Icon className="size-4 text-muted-foreground" />{label}</h2>
                <p className="text-sm text-muted-foreground">{description}</p>
              </article>
            ))}
          </section>
        </CsScreen>
      ) : <WorkspaceHome area={area} allowed={[area]} owner={false} preview />}
    </>
  );
}

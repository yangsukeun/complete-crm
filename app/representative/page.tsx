import Link from "next/link";
import { requireRepresentative } from "@/lib/representative-access";
import { WorkspaceAttendance } from "@/components/workspace-attendance";
import { workspaceLabels, type WorkspaceArea } from "@/lib/workspace-areas";
import { RUA_CONVERSATION } from "@/lib/crm-login-landing";

const areas = Object.keys(workspaceLabels) as WorkspaceArea[];

export default async function RepresentativePage() {
  const id = await requireRepresentative();
  return (
    <section className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:p-8">
      <header className="space-y-2">
        <p className="text-sm font-semibold text-violet-700">COMPLETE CRM · 대표 전용</p>
        <h1 className="text-3xl font-bold tracking-tight">대표자 페이지</h1>
        <p className="text-sm text-muted-foreground">개인 기록과 부서별 직원 화면을 여기에서 확인하세요.</p>
      </header>
      <Link href={RUA_CONVERSATION} prefetch={false} className="block rounded-xl border border-violet-200 bg-violet-50 p-5">
        <span className="block text-lg font-semibold text-violet-900">루와의 대화 →</span>
        <span className="mt-1 block text-sm text-muted-foreground">로그인하면 처음 열리는 대표님 개인 기록입니다.</span>
      </Link>
      <section className="space-y-2" aria-label="대표자 근태">
        <WorkspaceAttendance userId={id} />
        <Link href="/admin/attendance" prefetch={false} className="inline-flex min-h-11 items-center text-sm font-semibold">전체 근태 관리 →</Link>
      </section>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">부서별 직원 화면</h2>
        <p className="text-sm text-muted-foreground">부서별 홈 구성을 읽기 전용으로 봅니다. 직원 계정 전환이나 실제 데이터 조회는 하지 않습니다.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {areas.map((area) => (
          <Link key={area} href={`/representative/employee-view/${area}`} prefetch={false}
            className="rounded-xl border bg-card p-5 hover:border-violet-400 hover:bg-violet-50">
            <span className="block text-lg font-semibold">{workspaceLabels[area]}</span>
            <span className="mt-1 block text-sm text-muted-foreground">직원 화면 미리보기 →</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

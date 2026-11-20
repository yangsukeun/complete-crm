import Link from "next/link";
import {
  ArrowDown, ArrowLeft, ArrowUpRight, Box, Building2, FileText, FolderOpen,
  Headphones, Layers, Megaphone, Network, ShieldCheck, Waypoints,
} from "lucide-react";
import { REPRESENTATIVE_HOME, RUA_CONVERSATION } from "@/lib/crm-login-landing";
import { requireRepresentative } from "@/lib/representative-access";
import { workspaceLabels, type WorkspaceArea } from "@/lib/workspace-areas";

export const metadata = { title: "CRM 설계도", robots: { index: false, follow: false } };

const departments = [
  { area: "management", icon: Building2, tools: ["업무일지", "프로젝트", "Drive · NAS", "구매·지급 요청"], boundary: "업무일지와 승인 화면은 기존 열람·승인 권한 범위에서 엽니다." },
  { area: "marketing", icon: Megaphone, tools: ["프로젝트", "Drive · NAS", "채팅", "자료 게시판"], boundary: "자료와 대화는 각 서비스의 기존 접근 범위를 따릅니다." },
  { area: "cs", icon: Headphones, tools: ["CS 링크 허브", "CS 연차", "내 담당 거래처", "CS 라운지"], boundary: "일반 직원과 팀장·센터장의 화면이 다릅니다. 기존 CS 휴가 화면과 별도 개편 작업은 구분합니다." },
  { area: "logistics", icon: Box, tools: ["연결된 프로젝트", "Drive · NAS", "견적·정산", "구매·지출 요청"], boundary: "직원은 참여자로 연결됐거나 담당 단계가 있는 프로젝트를 확인합니다. 다른 프로젝트나 단계는 표시하지 않습니다." },
] satisfies { area: WorkspaceArea; icon: typeof Building2; tools: string[]; boundary: string }[];

const bridges = [
  { icon: Waypoints, name: "프로젝트와 업무일지", description: "프로젝트에서 담당 업무를 확인하고, 업무일지는 권한이 있는 화면에서 확인합니다. 3PL 직원은 전용 프로젝트 목록을 사용합니다." },
  { icon: FolderOpen, name: "Google Drive 자료함", description: "CRM에서 Google Drive의 폴더와 파일을 엽니다. 파일·폴더 권한은 기존과 동일합니다.", href: "/drive" },
  { icon: Layers, name: "NAS 문서함", description: "파일 목록을 확인하고, 원본을 열 때 필요한 NAS 로그인은 별도로 유지됩니다.", href: "/nas-drive" },
  { icon: FileText, name: "루와의 대화", description: "대표만 보는 업무 기록입니다. CRM 밖의 대화가 자동으로 들어오는 곳은 아닙니다.", href: RUA_CONVERSATION },
];

const pending = [
  { name: "다른 채팅의 업무 자동 수집", description: "이 CRM 화면은 다른 ChatGPT 대화나 별도 업무 채팅을 자동으로 읽거나 가져오지 않습니다.", status: "미연동" },
  { name: "카카오톡과 CRM 연결", description: "카카오톡 대화 자동 수집·발송이나 양방향 동기화는 연결되지 않았습니다.", status: "미연동" },
  { name: "별도 CS 휴가 시스템", description: "새 CS 전용 독립 화면, 기존 휴가 기록 이관, 운영 전환은 별도 작업입니다. 현재 직원은 기존 CS 화면을 이용합니다.", status: "별도 진행" },
];

const shell = "min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5";
const cardLink = "inline-flex min-h-11 max-w-full items-center gap-1.5 text-sm font-semibold text-violet-800 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-violet-600";

export default async function RepresentativeBlueprintPage() {
  await requireRepresentative();

  return (
    <section className="mx-auto w-full max-w-6xl space-y-7 px-4 py-5 text-slate-950 sm:px-8 sm:py-7">
      <Link href={REPRESENTATIVE_HOME} prefetch={false} className={cardLink}>
        <ArrowLeft aria-hidden="true" className="size-4 shrink-0" /> 대표자 페이지
      </Link>

      <header className="relative space-y-3 overflow-hidden rounded-3xl bg-slate-950 px-5 py-8 text-white sm:px-8 sm:py-10">
        <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-8 size-44 rounded-full bg-violet-600/40 blur-3xl" />
        <p className="relative flex items-center gap-2 text-xs font-semibold tracking-widest text-violet-200">
          <ShieldCheck aria-hidden="true" className="size-4" /> COMPLETE CRM · 대표 전용
        </p>
        <h1 className="relative text-3xl font-bold tracking-tight sm:text-4xl">CRM 설계도</h1>
        <p className="relative max-w-2xl text-sm leading-relaxed text-slate-200 sm:text-base">
          로그인하면 어디로 가고, 부서별로 어떤 기능에 연결되는지 정리했습니다.
          설계도에는 직원 개인 기록이나 고객 자료가 표시되지 않습니다.
        </p>
      </header>

      <section aria-labelledby="blueprint-entry" className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:p-6">
        <div>
          <p className="text-xs font-semibold tracking-wider text-violet-800">01 · 진입 경로</p>
          <h2 id="blueprint-entry" className="text-xl font-bold sm:text-2xl">같은 로그인, 다른 첫 화면</h2>
        </div>
        <div className="mx-auto flex max-w-sm items-center justify-center gap-2 rounded-full border border-violet-200 bg-violet-100 px-4 py-3 text-center text-sm font-bold text-violet-950">
          <Network aria-hidden="true" className="size-4 shrink-0" /> CRM 로그인
        </div>
        <ArrowDown aria-hidden="true" className="mx-auto size-5 text-violet-700" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <article className={shell}>
            <p className="text-xs font-semibold text-violet-800">대표</p>
            <h3 className="mt-1 text-lg font-bold">루와의 대화가 처음 열립니다</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">대표자 페이지에서 부서별 홈을 읽기 전용으로 비교합니다. 직원 계정으로 전환하지 않습니다.</p>
            <Link href={RUA_CONVERSATION} prefetch={false} className={cardLink}>루와의 대화 열기 <ArrowUpRight aria-hidden="true" className="size-4" /></Link>
          </article>
          <article className={shell}>
            <p className="text-xs font-semibold text-sky-800">직원</p>
            <h3 className="mt-1 text-lg font-bold">자기 부서 홈으로 바로 이동합니다</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">경영지원·마케팅·CS·3PL 중 계정에 등록된 부서가 기준입니다. 메뉴가 보여도 자료 열람과 승인은 기존 권한이 있어야 합니다.</p>
          </article>
        </div>
      </section>

      <section aria-labelledby="blueprint-departments" className="space-y-3">
        <div>
          <p className="text-xs font-semibold tracking-wider text-violet-800">02 · 부서별 업무</p>
          <h2 id="blueprint-departments" className="text-xl font-bold sm:text-2xl">네 가지 직원 홈</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {departments.map(({ area, icon: Icon, tools, boundary }) => (
            <article className={shell} key={area}>
              <h3 className="flex items-center gap-2 text-lg font-bold">
                <Icon aria-hidden="true" className="size-5 shrink-0 text-violet-700" /> {workspaceLabels[area]}
              </h3>
              <ul className="my-3 flex flex-wrap gap-1.5" aria-label={workspaceLabels[area] + " 주요 기능"}>
                {tools.map(tool => <li className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700" key={tool}>{tool}</li>)}
              </ul>
              <p className="text-sm leading-relaxed text-slate-600">{boundary}</p>
              <Link href={`/representative/employee-view/${area}`} prefetch={false} className={cardLink}>
                <span>{workspaceLabels[area]} 직원 화면 보기</span><ArrowUpRight aria-hidden="true" className="size-4 shrink-0" />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="blueprint-connections" className="space-y-3">
        <div>
          <p className="text-xs font-semibold tracking-wider text-violet-800">03 · 업무와 자료</p>
          <h2 id="blueprint-connections" className="text-xl font-bold sm:text-2xl">현재 CRM에서 쓰는 기능</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {bridges.map(({ icon: Icon, name, description, href }) => (
            <article className={shell} key={name}>
              <h3 className="flex items-center gap-2 font-bold"><Icon aria-hidden="true" className="size-4 shrink-0 text-emerald-700" />{name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
              {href && <Link href={href} prefetch={false} className={cardLink}>{name} 열기 <ArrowUpRight aria-hidden="true" className="size-4 shrink-0" /></Link>}
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="blueprint-pending" className="space-y-3 rounded-3xl border border-amber-200 bg-amber-50 p-4 sm:p-6">
        <h2 id="blueprint-pending" className="text-xl font-bold text-amber-950">아직 연결되지 않았거나 별도 진행 중인 기능</h2>
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {pending.map(({ name, description, status }) => (
            <li className="min-w-0 rounded-xl border border-amber-200 bg-white p-4" key={name}>
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-950">{status}</span>
              <h3 className="mt-2 font-bold">{name}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">{description}</p>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}

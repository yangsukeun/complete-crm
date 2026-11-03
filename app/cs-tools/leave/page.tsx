import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {cookies} from 'next/headers';
import {getAppSession} from '@/auth';
import prisma from '@/lib/prisma';
import {resolveAppModeForUser} from '@/lib/app-mode-server';
import {csLeaveEntry} from '@/lib/cs-leave-entry';
import {isCsDepartment} from '@/lib/cs-tools-access';
import {LeavePageClient} from '../../leave/leave-page-client';
export const dynamic='force-dynamic';
export default async function CsLeavePage(){
 const session=await getAppSession();if(!session?.user?.id)redirect('/login');
 const me=await prisma.user.findUnique({where:{id:session.user.id},select:{role:true,department:true,accountDisabled:true}});
 const access=csLeaveEntry(me);if(!access.allowed||!me)notFound();
 if(await resolveAppModeForUser(session.user.id,await cookies())!=='company')redirect('/choose-mode');
 const role=String(me.role).toUpperCase();
 return <div><section className="mx-4 mt-4 space-y-3 rounded-xl border border-violet-200 bg-violet-50 p-4 md:mx-8" aria-label="CS 연차 안내"><h1 className="text-xl font-semibold text-violet-950">CS 연차 신청·관리</h1><p className="text-sm text-violet-950">기존 CRM의 신청·취소·승인 기능을 사용합니다. CS 직원 신청은 기존 규칙에 따라 같은 부서 팀장 1차 승인 후 센터장이 최종 승인합니다. 팀장·센터장 본인 신청은 기존 별도 승인 순서를 따릅니다.</p><p className="text-sm text-violet-950">Google Sites 자료는 자동으로 이전하거나 복구하지 않습니다. 기존 사용 내역과 잔여일수가 다르면 신청 전 관리자에게 확인해 주세요.</p><div className="flex flex-wrap gap-4"><Link href="/cs-tools" className="underline">CS 홈</Link>{access.canViewSummary&&<Link href="/admin/employee-leave-summary" prefetch={false} className="underline">직원 연차 현황·관리</Link>}</div></section><LeavePageClient isTeamLead={role==='TEAM_LEAD'} isCsCenterChief={role==='CENTER_CHIEF'&&isCsDepartment(me.department)} isExecutive={role==='ADMIN'||role==='EXECUTIVE'} csScreen={isCsDepartment(me.department)}/></div>;
}

import {NextResponse} from 'next/server';
import {getAppSession} from '@/auth';
import prisma from '@/lib/prisma';
import {getCurrentLeaveActor} from '@/lib/leave-current-actor';
import {CS_DEPARTMENT_ALIASES,isCsDepartment} from '@/lib/cs-tools-access';
import {leaveRequestListWhere} from '@/lib/leave-request-serialize';
import {toKstYmd} from '@/lib/date-kst';
import {calculateLeavePool} from '@/lib/leave/calculate-pool';
import {leaveDisplayUsedDays} from '@/lib/leave/display-used';

/** Read-only dedicated view. No pool synchronization, notification writes, or mutation exports. */
export async function GET(){
 try {
  const session=await getAppSession();
  if(!session?.user?.id)return NextResponse.json({error:'Unauthorized'},{status:401});
  const actor=await getCurrentLeaveActor(session.user.id);
  if(!actor.ok)return NextResponse.json({error:actor.error},{status:actor.status});
  const {id,role,department}=actor.user;
  const executive=role==='ADMIN'||role==='EXECUTIVE';
  if(!executive&&!isCsDepartment(department))return NextResponse.json({error:'Forbidden'},{status:403});
  const csScope={user:{department:{in:[...CS_DEPARTMENT_ALIASES]}}};
  const where={AND:[csScope,leaveRequestListWhere(id,role,department)]};
  const rows=await prisma.leaveRequest.findMany({where,select:{id:true,userId:true,type:true,startDate:true,endDate:true,status:true,cancelFromStatus:true,createdAt:true,user:{select:{id:true,name:true,department:true,position:true,role:true}}},orderBy:{startDate:'desc'}});
  // Do not fetch peer reasons for ordinary users, nor other-department reasons for leads.
  const privateScope=executive?{}:(role==='TEAM_LEAD'||role==='CENTER_CHIEF')?{OR:[{userId:id},{user:{department}}]}:{userId:id};
  const reasons=await prisma.leaveRequest.findMany({where:{AND:[where,privateScope]},select:{id:true,reason:true}});
  const reasonById=new Map(reasons.map(r=>[r.id,r.reason]));
  const management=executive||role==='TEAM_LEAD'||role==='CENTER_CHIEF';
  const requests=rows.map(r=>{
    const user=r.user && !management && r.userId!==id ? {id:r.user.id,name:r.user.name,department:r.user.department,position:r.user.position} : r.user;
    return {...r,user,reason:reasonById.get(r.id)??null};
  });
  const leads=await prisma.user.findMany({where:{role:'TEAM_LEAD',department:{in:[...CS_DEPARTMENT_ALIASES]}},select:{department:true}});
  // Read stored values, then use the existing pure formulas without materializing new accruals.
  const year=Number(toKstYmd(new Date()).slice(0,4));
  const storedBalance=isCsDepartment(department)?await prisma.leaveBalance.findUnique({where:{userId_year:{userId:id,year}},select:{year:true,annualTotal:true,annualUsed:true,annualCarryOver:true,manualDeduction:true}}):null;
  const asOf=new Date();
  const pool=isCsDepartment(department)?await calculateLeavePool(id,asOf,{readOnly:true}):null;
  const balance=pool&&pool.storedAccrualCount>0&&pool.hasJoinDate?{year,total:pool.displayGranted,annualTotal:pool.periodGranted.periodGranted,carryOver:pool.periodGranted.validCarry,used:leaveDisplayUsedDays(pool.displayGranted,pool.available),remaining:pool.available,manualDeduction:storedBalance?.manualDeduction??0}:null;
  return NextResponse.json({requests,viewer:{department},departmentsWithTeamLead:[...new Set(leads.map(r=>r.department).filter(Boolean))],balance,storedBalance,balanceStatus:balance?'SAVED_LEDGER_AS_OF_PROJECTION':'INSUFFICIENT_SAVED_LEDGER',balanceAsOf:asOf.toISOString()}, {headers:{'Cache-Control':'private, no-store'}});
 }catch{return NextResponse.json({error:'CS 휴가 정보를 불러올 수 없습니다.'},{status:503});}
}

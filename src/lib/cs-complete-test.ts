import { z } from 'zod';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const d = new Date(v+'T00:00:00Z'); return Number.isFinite(+d) && d.toISOString().slice(0,10) === v; });
const quarter = z.number().finite().min(-10000).max(10000).refine(v=>Number.isInteger(v*4));
export const leaveKinds = ['PAID','UNPAID','EVENT','SICK_UNPAID'] as const;
export const leaveStatuses = ['PENDING','APPROVED','REJECTED','CANCELLED'] as const;
export const employeeSchema = z.object({ sourceId:z.string().min(1).max(128), name:z.string().min(1).max(80), department:z.string().max(80), position:z.string().max(80), status:z.enum(['ACTIVE','PARENTAL_LEAVE','RETIRED','UNKNOWN']), periodStart:day, periodEnd:day, grantedIncludingCarry:quarter, carry:quarter, priorUsed:quarter, reportedUsed:quarter, reportedBalance:quarter }).strict().refine(e=>e.periodEnd>=e.periodStart);
export const entrySchema = z.object({ sourceId:z.string().min(1).max(128), employeeSourceId:z.string().min(1).max(128), date:day, kind:z.enum(leaveKinds), unit:z.enum(['FULL','AM','PM','QUARTER']), days:z.union([z.literal(1),z.literal(.5),z.literal(.25)]), status:z.enum(leaveStatuses), memo:z.string().max(2000), version:z.number().int().positive() }).strict().refine(e=>e.days===(e.unit==='FULL'?1:e.unit==='QUARTER'?.25:.5));
export const snapshotSchema = z.object({ format:z.literal('cs-complete-test-v1'), snapshotId:z.string().min(1).max(128), sourceUrl:z.literal('https://gemini.google.com/share/6af8cacca73b'), capturedAt:z.string().datetime(), ledgerComplete:z.boolean(), expectedEntryCount:z.number().int().nonnegative().max(20000), employees:z.array(employeeSchema).max(2000), entries:z.array(entrySchema).max(20000) }).strict().superRefine((s,c)=>{
 const ids=new Set<string>(); for(const e of s.employees){if(ids.has(e.sourceId))c.addIssue({code:'custom',message:'직원 원본 ID 중복'});ids.add(e.sourceId);}
 const entries=new Set<string>();for(const e of s.entries){if(!ids.has(e.employeeSourceId))c.addIssue({code:'custom',message:'직원 참조가 없는 내역'});if(entries.has(e.sourceId))c.addIssue({code:'custom',message:'내역 원본 ID 중복'});entries.add(e.sourceId);}
 if(s.ledgerComplete&&s.expectedEntryCount!==s.entries.length)c.addIssue({code:'custom',message:'전체 내역 건수가 일치하지 않습니다.'});
});
export type TestEmployee=z.infer<typeof employeeSchema>;
export type TestEntry=z.infer<typeof entrySchema>;
export type TestSnapshot=z.infer<typeof snapshotSchema>;
export const reviewSchema=z.object({format:z.literal('cs-test-review-v1'),source:snapshotSchema,testEntries:z.array(entrySchema).max(20000),attendance:z.array(z.object({id:z.string().max(128),employeeId:z.string().max(128),date:day,checkIn:z.string().regex(/^\d{2}:\d{2}$/),checkOut:z.string().regex(/^\d{2}:\d{2}$/)}).strict()).max(20000),audit:z.array(z.object({at:z.string().datetime(),action:z.string().max(50),id:z.string().max(128),before:entrySchema.optional()}).strict()).max(20000)}).strict().superRefine((r,c)=>{
 if(!snapshotSchema.safeParse({...r.source,entries:r.testEntries,expectedEntryCount:r.testEntries.length}).success)c.addIssue({code:'custom',message:'TEST 내역의 직원 참조·중복을 확인하세요.'});
 if(r.attendance.some(a=>!r.source.employees.some(e=>e.sourceId===a.employeeId)))c.addIssue({code:'custom',message:'TEST 근태의 직원 참조를 확인하세요.'});
});
export function canUseCsCompleteTest(u:{role:string;department:string|null;accountDisabled:boolean}|null){
 return !!u&&!u.accountDisabled&&(['ADMIN','EXECUTIVE'].includes(u.role)||(['TEAM_LEAD','CENTER_CHIEF'].includes(u.role)&&['CS','CS팀'].includes(u.department??'')));
}
export function reconcileEmployee(employee:TestEmployee,snapshot:TestSnapshot,entries:TestEntry[]=snapshot.entries){
 const approvedPaid=entries.filter(e=>e.employeeSourceId===employee.sourceId&&e.status==='APPROVED'&&e.kind==='PAID'&&e.date>=employee.periodStart&&e.date<=employee.periodEnd).reduce((n,e)=>n+e.days,0);
 const used=employee.priorUsed+approvedPaid;
 return {approvedPaid,used,balance:employee.grantedIncludingCarry-used,sourceArithmeticDelta:employee.grantedIncludingCarry-employee.reportedUsed-employee.reportedBalance,ledgerDelta:snapshot.ledgerComplete?used-employee.reportedUsed:null};
}
export function transitionEntry(snapshot:TestSnapshot,entries:TestEntry[],id:string,version:number,status:TestEntry['status']){
 const row=entries.find(e=>e.sourceId===id);if(!row||row.version!==version)throw new Error('변경 충돌: 최신 내역을 확인하세요.');
 if(!snapshot.ledgerComplete)throw new Error('원본 전체 내역 대조가 완료되지 않아 변경할 수 없습니다.');
 if(row.status!=='PENDING'||!['APPROVED','REJECTED','CANCELLED'].includes(status))throw new Error('허용되지 않는 상태 변경입니다.');
 return entries.map(e=>e.sourceId===id?{...e,status,version:e.version+1}:e);
}
export function addTestRequest(snapshot:TestSnapshot,entries:TestEntry[],request:TestEntry){
 const checked=entrySchema.safeParse(request);if(!checked.success)throw new Error('직원·날짜·휴가 구분과 사용 단위를 확인하세요.');const parsed=checked.data;const employee=snapshot.employees.find(e=>e.sourceId===parsed.employeeSourceId);
 if(!snapshot.ledgerComplete)throw new Error('원본 전체 내역 대조가 완료되지 않았습니다.');
 if(!employee||employee.status!=='ACTIVE')throw new Error('신청 가능한 직원 상태가 아닙니다.');
 if(parsed.status!=='PENDING'||entries.some(e=>e.sourceId===parsed.sourceId))throw new Error('새 대기 요청만 추가할 수 있습니다.');
 if(parsed.date<employee.periodStart||parsed.date>employee.periodEnd)throw new Error('직원 적용 기간을 확인하세요.');
 if(entries.some(e=>e.employeeSourceId===parsed.employeeSourceId&&e.date===parsed.date&&['PENDING','APPROVED'].includes(e.status)&&(e.unit===parsed.unit||e.unit==='FULL'||parsed.unit==='FULL')))throw new Error('같은 날짜·시간의 중복 신청입니다.');
 return [...entries,parsed];
}
export function syntheticSnapshot():TestSnapshot{
 return {format:'cs-complete-test-v1',snapshotId:'synthetic-only-v1',sourceUrl:'https://gemini.google.com/share/6af8cacca73b',capturedAt:'2026-11-04T00:00:00.000Z',ledgerComplete:true,expectedEntryCount:3,
 employees:[{sourceId:'demo-a',name:'합성 직원 A',department:'CS',position:'사원',status:'ACTIVE',periodStart:'2026-01-01',periodEnd:'2026-12-31',grantedIncludingCarry:17,carry:2,priorUsed:1,reportedUsed:2.5,reportedBalance:14.5},{sourceId:'demo-b',name:'합성 직원 B',department:'CS',position:'사원',status:'PARENTAL_LEAVE',periodStart:'2026-01-01',periodEnd:'2026-12-31',grantedIncludingCarry:15,carry:0,priorUsed:0,reportedUsed:0,reportedBalance:15}],
 entries:[{sourceId:'demo-1',employeeSourceId:'demo-a',date:'2026-10-01',kind:'PAID',unit:'FULL',days:1,status:'APPROVED',memo:'합성 검증',version:1},{sourceId:'demo-2',employeeSourceId:'demo-a',date:'2026-10-02',kind:'PAID',unit:'PM',days:.5,status:'APPROVED',memo:'합성 검증',version:1},{sourceId:'demo-3',employeeSourceId:'demo-a',date:'2026-11-06',kind:'UNPAID',unit:'QUARTER',days:.25,status:'PENDING',memo:'합성 검증',version:1}]};
}

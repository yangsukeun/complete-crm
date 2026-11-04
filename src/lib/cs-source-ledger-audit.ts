import { z } from 'zod';
const id=z.string().min(1).max(128);
export const ledgerAuditSchema=z.object({
 sourceUrl:z.literal('https://gemini.google.com/share/6af8cacca73b'),observedAt:z.string().datetime(),
 displayedTotal:z.number().int().nonnegative(),scopeDescription:z.string().min(1).max(2000),exportDeclaredComplete:z.boolean(),
 employees:z.array(z.object({sourceId:id,state:z.enum(['ACTIVE','PARENTAL_LEAVE','RETIRED','UNKNOWN'])}).strict()).max(2000),
 cards:z.array(z.object({employeeSourceId:id,count:z.number().int().nonnegative()}).strict()).max(2000),
 records:z.array(z.object({sourceId:id,employeeSourceId:id,date:z.string().max(30),status:z.string().min(1).max(40),days:z.number().finite().nullable()}).strict()).max(20000),
 crmUsers:z.array(z.object({id,disabled:z.boolean()}).strict()).max(5000),
 mappings:z.array(z.object({sourceId:id,crmId:id,proofKind:z.enum(['EXTERNAL_ID_REFERENCE','MANUAL_REVIEW_REFERENCE']),proofRef:z.string().min(1).max(500)}).strict()).max(2000)
}).strict();
export type LedgerAuditInput=z.infer<typeof ledgerAuditSchema>;
export function auditSourceLedger(raw:unknown){
 const input=ledgerAuditSchema.parse(raw);const employees=new Set(input.employees.map(e=>e.sourceId));const crm=new Map(input.crmUsers.map(u=>[u.id,u]));
 const duplicateValues=(ids:string[])=>[...new Set(ids.filter((v,i)=>ids.indexOf(v)!==i))];
 const duplicateEmployeeIds=duplicateValues(input.employees.map(e=>e.sourceId));const duplicateCrmIds=duplicateValues(input.crmUsers.map(e=>e.id));const duplicateCardIds=duplicateValues(input.cards.map(e=>e.employeeSourceId));
 const groups=new Map<string,typeof input.records>();for(const r of input.records){const group=groups.get(r.sourceId)??[];group.push(r);groups.set(r.sourceId,group);}
 const duplicateRecordIds:string[]=[];const conflictingRecordIds:string[]=[];const uniqueRecords:typeof input.records=[];
 for(const [key,group] of groups){if(group.length>1)duplicateRecordIds.push(key);if(group.some(r=>JSON.stringify(r)!==JSON.stringify(group[0]))){conflictingRecordIds.push(key);continue;}uniqueRecords.push(group[0]);}
 const unknownEmployeeRecordIds=uniqueRecords.filter(r=>!employees.has(r.employeeSourceId)).map(r=>r.sourceId);
 const unknownStatusRecordIds=uniqueRecords.filter(r=>!['PENDING','APPROVED','REJECTED','CANCELLED'].includes(r.status)).map(r=>r.sourceId);
 const invalidDateRecordIds=uniqueRecords.filter(r=>{const d=new Date(r.date+'T00:00:00Z');return !/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!Number.isFinite(+d)||d.toISOString().slice(0,10)!==r.date;}).map(r=>r.sourceId);
 const invalidDaysRecordIds=uniqueRecords.filter(r=>r.days===null||![.25,.5,1].includes(r.days)).map(r=>r.sourceId);
 const statusCounts:Record<string,number>={};const monthCounts:Record<string,number>={};for(const r of uniqueRecords){statusCounts[r.status]=(statusCounts[r.status]??0)+1;if(!invalidDateRecordIds.includes(r.sourceId)){const month=r.date.slice(0,7);monthCounts[month]=(monthCounts[month]??0)+1;}}
 const mappings=input.mappings.map(m=>{const reasons:string[]=[];if(!employees.has(m.sourceId))reasons.push('unknown_source_id');if(!crm.has(m.crmId))reasons.push('unknown_crm_id');if(crm.get(m.crmId)?.disabled)reasons.push('disabled_crm_user');if(duplicateEmployeeIds.includes(m.sourceId)||duplicateCrmIds.includes(m.crmId))reasons.push('ambiguous_inventory_id');if(input.mappings.filter(p=>p.sourceId===m.sourceId).length!==1||input.mappings.filter(p=>p.crmId===m.crmId).length!==1)reasons.push('mapping_collision');return {sourceId:m.sourceId,crmId:m.crmId,proofKind:m.proofKind,proofRef:m.proofRef,eligibleForReview:reasons.length===0,reasons};});
 const unmappedSourceIds=[...employees].filter(s=>!mappings.some(m=>m.sourceId===s&&m.eligibleForReview));const cardTotal=input.cards.reduce((n,c)=>n+c.count,0);
 return {sourceUrl:input.sourceUrl,observedAt:input.observedAt,scopeDescription:input.scopeDescription,displayedTotal:input.displayedTotal,cardTotal,displayedMinusCards:input.displayedTotal-cardTotal,rawRecordCount:input.records.length,uniqueRecordCount:groups.size,nonConflictingUniqueRecordCount:uniqueRecords.length,displayedMinusUniqueRecords:input.displayedTotal-groups.size,
  duplicateEmployeeIds,duplicateCrmIds,duplicateCardIds,duplicateRecordIds,conflictingRecordIds,unknownEmployeeRecordIds,unknownStatusRecordIds,invalidDateRecordIds,invalidDaysRecordIds,statusCounts,monthCounts,mappings,unmappedSourceIds,
  recordInventoryMatchesDeclaredTotal:input.exportDeclaredComplete&&groups.size===input.displayedTotal&&duplicateRecordIds.length===0,
  readyForImport:false as const,notice:'진단 전용입니다. 표시 총계와 카드 총계의 차이는 동일 필터·기준일·삭제/퇴사 포함 범위가 확인되기 전 원인으로 해석하지 않습니다. 원본과 운영 계정을 수정하지 않습니다.'};
}

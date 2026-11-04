import { expect, it } from 'vitest';
import { addTestRequest, canUseCsCompleteTest, reconcileEmployee, reviewSchema, snapshotSchema, syntheticSnapshot, transitionEntry } from '../src/lib/cs-complete-test';
it('restricts TEST to active existing managers',()=>{
 expect(canUseCsCompleteTest(null)).toBe(false);
 for(const role of ['ADMIN','EXECUTIVE','TEAM_LEAD','CENTER_CHIEF'])expect(canUseCsCompleteTest({role,department:'CS',accountDisabled:false})).toBe(true);
 expect(canUseCsCompleteTest({role:'USER',department:'CS',accountDisabled:false})).toBe(false);
 expect(canUseCsCompleteTest({role:'TEAM_LEAD',department:'OTHER',accountDisabled:false})).toBe(false);
 expect(canUseCsCompleteTest({role:'ADMIN',department:'CS',accountDisabled:true})).toBe(false);
});
it('round trips source plus separate TEST edits and rejects invalid references',()=>{
 const s=syntheticSnapshot();const review={format:'cs-test-review-v1',source:s,testEntries:transitionEntry(s,s.entries,'demo-3',1,'APPROVED'),attendance:[],audit:[]};
 const result=reviewSchema.parse(JSON.parse(JSON.stringify(review)));expect(result.source.entries[2].status).toBe('PENDING');expect(result.testEntries[2].status).toBe('APPROVED');
 expect(reviewSchema.safeParse({...review,testEntries:[{...s.entries[0],employeeSourceId:'unknown'}]}).success).toBe(false);
});
it('validates source references, unique ids and complete counts',()=>{
 const s=syntheticSnapshot();expect(snapshotSchema.safeParse(s).success).toBe(true);
 expect(snapshotSchema.safeParse({...s,expectedEntryCount:4}).success).toBe(false);
 expect(snapshotSchema.safeParse({...s,employees:[...s.employees,s.employees[0]]}).success).toBe(false);
 expect(snapshotSchema.safeParse({...s,entries:s.entries.map(e=>({...e,employeeSourceId:'unknown'}))}).success).toBe(false);
});
it('keeps source balance and carry untouched; counts only approved paid within period',()=>{
 const s=syntheticSnapshot();const e=s.employees[0];const extra={...s.entries[0],sourceId:'out',date:'2025-12-31'};
 const r=reconcileEmployee(e,s,[...s.entries,extra,{...extra,sourceId:'unpaid',date:'2026-10-01',kind:'UNPAID'}]);
 expect(r.used).toBe(2.5);expect(r.balance).toBe(14.5);expect(r.ledgerDelta).toBe(0);expect(e.grantedIncludingCarry).toBe(17);
});
it('preserves negative balance and flags arithmetic discrepancy',()=>{
 const s=syntheticSnapshot();const e={...s.employees[0],grantedIncludingCarry:1,reportedUsed:3,reportedBalance:-2};
 expect(reconcileEmployee(e,s).sourceArithmeticDelta).toBe(0);expect(reconcileEmployee({...e,reportedBalance:0},s).sourceArithmeticDelta).toBe(-2);
});
it('does not certify incomplete ledger or permit changes',()=>{
 const s={...syntheticSnapshot(),ledgerComplete:false};expect(reconcileEmployee(s.employees[0],s).ledgerDelta).toBe(null);
 expect(()=>transitionEntry(s,s.entries,'demo-3',1,'APPROVED')).toThrow(/전체/);
 expect(()=>addTestRequest(s,s.entries,{...s.entries[2],sourceId:'new'})).toThrow(/전체/);
});
it('supports quarter days, rejects unit tampering and invalid dates',()=>{
 const s=syntheticSnapshot();expect(snapshotSchema.safeParse({...s,entries:s.entries.map(e=>({...e,days:.5,unit:'QUARTER'}))}).success).toBe(false);
 expect(snapshotSchema.safeParse({...s,entries:s.entries.map(e=>({...e,date:'2026-02-30'}))}).success).toBe(false);
});
it('rejects stale or final status changes and preserves source snapshot',()=>{
 const s=syntheticSnapshot();const text=JSON.stringify(s);const next=transitionEntry(s,s.entries,'demo-3',1,'APPROVED');
 expect(next[2].version).toBe(2);expect(JSON.stringify(s)).toBe(text);
 expect(()=>transitionEntry(s,next,'demo-3',1,'REJECTED')).toThrow(/충돌/);
 expect(()=>transitionEntry(s,next,'demo-3',2,'REJECTED')).toThrow(/허용/);
});
it('rejects inactive, duplicate and outside-period requests',()=>{
 const s=syntheticSnapshot();const request={...s.entries[2],sourceId:'new'};
 expect(()=>addTestRequest(s,s.entries,{...request,employeeSourceId:'demo-b'})).toThrow(/상태/);
 expect(()=>addTestRequest(s,s.entries,request)).toThrow(/중복/);
 expect(()=>addTestRequest(s,s.entries,{...request,date:'2027-01-01'})).toThrow(/기간/);
 expect(addTestRequest(s,s.entries,{...request,date:'2026-11-07'})).toHaveLength(4);
});

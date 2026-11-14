import {expect,it} from 'vitest';
import {csCalendarEntries} from '../src/lib/cs-leave-calendar';
const base={id:'synthetic-1',type:'ANNUAL',startDate:'2026-11-01T15:00:00Z',endDate:'2026-11-02T15:00:00Z',status:'APPROVED',reason:'not for calendar',user:{id:'synthetic-a',name:'가상 직원',department:'CS팀'}};
it('projects only safe fields and converts to KST',()=>{const result=csCalendarEntries([base],'synthetic-b')[0];expect(result.start).toBe('2026-11-02');expect(result.end).toBe('2026-11-03');expect(result).not.toHaveProperty('reason');expect(result).not.toHaveProperty('user');});
it('hides non-CS, peer pending, rejected and cancelled records',()=>{expect(csCalendarEntries([{...base,status:'PENDING'},{...base,status:'REJECTED'},{...base,status:'CANCELLED'},{...base,user:{...base.user,department:'물류'}}],'synthetic-b')).toEqual([]);});
it('retains own pending and cancel-requested without revealing peer pending',()=>{expect(csCalendarEntries([{...base,status:'PENDING'},{...base,id:'two',status:'CANCEL_REQUESTED'}],'synthetic-a')).toHaveLength(2);expect(csCalendarEntries([{...base,status:'PENDING'}],'')).toEqual([]);});

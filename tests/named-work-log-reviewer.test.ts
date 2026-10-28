import {it,expect} from 'vitest';
import {canViewOthersDailyWorkLog,hasDailyReportMenuAccess} from '../src/lib/work-log-access';
import {MARKETING_LOG_REVIEWER,MARKETING_LOG_TARGETS} from '../src/lib/work-log-review-scope';
const viewer={viewerId:MARKETING_LOG_REVIEWER,viewerRole:'TEAM_LEAD',viewerDepartment:'마케팅',viewerPermissions:null};
it('restores only verified named active marketing staff without altering ordinary team-lead defaults',()=>{
 expect(hasDailyReportMenuAccess({id:viewer.viewerId,role:viewer.viewerRole,department:viewer.viewerDepartment})).toBe(true);
 expect(hasDailyReportMenuAccess({id:'other',role:'TEAM_LEAD',department:'마케팅'})).toBe(false);
 for(const id of MARKETING_LOG_TARGETS){const target={id,role:'USER',department:'마케팅',accountDisabled:false};expect(canViewOthersDailyWorkLog({...viewer,target})).toBe(true);expect(canViewOthersDailyWorkLog({...viewer,target:{...target,department:'CS'}})).toBe(false);expect(canViewOthersDailyWorkLog({...viewer,target:{...target,accountDisabled:true}})).toBe(false);expect(canViewOthersDailyWorkLog({...viewer,viewerId:'other',target})).toBe(false);}
});
it('denies representative, unconfirmed alias, unrelated staff and composed privileged-role escape',()=>{
 for(const id of ['cmmitn4830000fc0jt8c1l2jf','cmqu62595000d94im1hdpj79t','other'])for(const role of ['TEAM_LEAD','ADMIN'])expect(canViewOthersDailyWorkLog({...viewer,viewerRole:role,target:{id,role:'USER',department:'마케팅'}})).toBe(false);
 expect(hasDailyReportMenuAccess({id:viewer.viewerId,role:'TEAM_LEAD',department:'마케팅',accountDisabled:true})).toBe(false);
});

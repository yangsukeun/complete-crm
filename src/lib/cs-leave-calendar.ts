import { toKstYmd } from './date-kst';
import { isCsDepartment } from './cs-tools-access';
export type CsCalendarRequest = { id:string; userId?:string; type:string; startDate:string; endDate:string; status:string; user?:{id:string;name:string;department:string|null} };
/** Explicit projection: never pass reasons, email, project or approval metadata to the calendar. */
export function csCalendarEntries(requests:CsCalendarRequest[],viewerId:string) {
 return requests.filter(r=>isCsDepartment(r.user?.department)&&(r.status==='APPROVED'||(!!viewerId&&(r.user?.id===viewerId||r.userId===viewerId)&&['PENDING','TEAM_LEAD_APPROVED','CANCEL_REQUESTED'].includes(r.status))))
 .map(r=>({id:r.id,name:r.user?.name??'직원',type:r.type,start:toKstYmd(r.startDate),end:toKstYmd(r.endDate),status:r.status}));
}

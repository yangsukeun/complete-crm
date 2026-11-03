import {canSeeCsToolsDashboardCard} from './cs-tools-access';
import {canViewEmployeeLeaveSummary} from './leave-overview-access';
export function csLeaveEntry(user:{role:string|null;department:string|null;accountDisabled:boolean}|null){
 const allowed=!!user&&!user.accountDisabled&&canSeeCsToolsDashboardCard(user);
 return {allowed,canViewSummary:allowed&&canViewEmployeeLeaveSummary(user!)};
}

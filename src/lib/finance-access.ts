import prisma from '@/lib/prisma';
import {getFinanceScope,financeScopePrismaWhere,type FinanceScope} from './finance-scope';
import {getUserDepartments} from './user-departments';
import {loadTransferExecutorIds} from './finance-payment-request-alerts';
import {resolveEffectivePermissionsJson} from './permissions-resolve';
import {userHasPermission} from './permissions';
export async function resolveFinanceAccess(userId:string,mode:"read"|"write"="read"){
 const user=await prisma.user.findUnique({where:{id:userId},select:{role:true,department:true,additionalDepartments:true,accountDisabled:true}});
 if(!user||user.accountDisabled)throw new Error('Finance access denied');
 const transferExecutorIds=await loadTransferExecutorIds();
 const permissions=await resolveEffectivePermissionsJson(userId);
 const depts=getUserDepartments(user);
 const scope=getFinanceScope({userId,role:user.role,userDepartments:depts,transferExecutorIds,allowTransferGlobalRead:mode==="read",hasFinanceView:userHasPermission({role:user.role,permissions},'finance_view')});
 return {scope,role:user.role,department:depts.primary,transferExecutorIds};
}
export function redactPaymentBank<T extends {requesterId?:string|null;vendor?:object|null}>(row:T,scope:FinanceScope):T{
 if(scope.kind==='ALL'||!row.vendor)return row;
 return {...row,vendor:{...row.vendor,bankName:'',accountNumber:'',ownerName:''}};
}
export async function canAccessFinanceVendor(userId:string,vendorId:string,write=false){
 const {scope}=await resolveFinanceAccess(userId,write?"write":"read");if(scope.kind==='ALL')return true;
 if(write){const rows=await prisma.paymentRequest.findMany({where:{vendorId},select:{requesterId:true}});return rows.length>0&&rows.every(r=>r.requesterId===userId);}
 return !!await prisma.paymentRequest.findFirst({where:{vendorId,...financeScopePrismaWhere(scope)},select:{id:true}});
}

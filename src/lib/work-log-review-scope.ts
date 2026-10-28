// Exact active accounts verified against CRM on 2026-10-28. Owner confirmed 봄MD = 조보미 on 2026-10-28.
export const MARKETING_LOG_REVIEWER='cmmitpw4t0000tnfbknrg0hob';
export const MARKETING_LOG_TARGETS=new Set(['cmmity91o000210mw8mk0fcsj','cmq7p5f0t000218xq9gmozv8k','cmu52qjev0008n95ct9s5qkpa','cmu52r5bl0000hcfc3idada9n','cmqu62595000d94im1hdpj79t']);
export function namedLogReviewer(user:{id?:string;role?:string|null;department?:string|null;accountDisabled?:boolean}){
 return user.id===MARKETING_LOG_REVIEWER&&user.role==='TEAM_LEAD'&&user.department?.trim()==='마케팅'&&!user.accountDisabled;
}

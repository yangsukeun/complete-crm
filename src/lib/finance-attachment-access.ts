import prisma from './prisma';
import {resolveFinanceAccess} from './finance-access';
import {isPaymentRequestInFinanceScope} from './finance-scope';
export function attachmentIdentity(value:string){
 try{const url=new URL(value,'https://crm-local.invalid');if(url.hostname==='drive.google.com'){const id=url.searchParams.get('id')??url.pathname.match(/\/d\/([^/]+)/)?.[1];if(id)return `drive:${id}`;}return `${url.origin}${decodeURIComponent(url.pathname)}`;}catch{return value;}
}
export function attachmentUrls(attachment:unknown,attachments:unknown):string[]{
 let list=attachments;if(typeof list==='string'){try{list=JSON.parse(list);}catch{list=[];}}
 return [attachment,...(Array.isArray(list)?list:[])].flatMap(v=>typeof v==='string'?[v]:v&&typeof v==='object'&&'url' in v&&typeof v.url==='string'?[v.url]:[]);
}
export async function mayDownloadFinanceAttachment(userId:string,url:string){
 const {scope}=await resolveFinanceAccess(userId);if(scope.kind==='ALL')return true;
 const identity=attachmentIdentity(url);
 // Only references are read. Query variants cannot bypass a matching payment attachment.
 const rows=await prisma.paymentRequest.findMany({select:{requesterId:true,requester:{select:{department:true}},attachment:true,attachments:true}});
 return rows.filter(r=>attachmentUrls(r.attachment,r.attachments).some(v=>attachmentIdentity(v)===identity)).every(r=>isPaymentRequestInFinanceScope(scope,r));
}

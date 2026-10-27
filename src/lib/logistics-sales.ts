import { z } from "zod";
import { workspaceAreas } from "./workspace-areas";

export class SalesError extends Error { constructor(public status:number,message:string){super(message);} }
export type SalesUser={id:string;department:string|null;accountDisabled:boolean};
export function requireSalesUser(user:SalesUser|null){
  if(!user)throw new SalesError(401,"로그인이 필요합니다.");
  if(user.accountDisabled||!workspaceAreas(user).includes("logistics"))throw new SalesError(403,"3PL 접근 권한이 없습니다.");
}
const text=z.string().trim().min(1).max(2000);
const money=z.number().int().min(0).max(1_000_000_000_000);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v);
const month=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const base={key:z.string().uuid()};
const target={id:z.string().uuid(),version:z.number().int().positive()};
export const salesCommand=z.discriminatedUnion("action",[
 z.object({...base,action:z.literal("inquiry"),customerKey:z.string().regex(/^\d{10}$/),name:text,original:text}).strict(),
 z.object({...base,...target,action:z.literal("quote"),supply:money,vat:money,evidence:text}).strict(),
 z.object({...base,...target,action:z.literal("revise"),supply:money,vat:money,reason:text,evidence:text}).strict(),
 z.object({...base,...target,action:z.literal("contract"),evidence:text}).strict(),
 z.object({...base,...target,action:z.literal("client")}).strict(),
 z.object({...base,...target,action:z.literal("invoice"),month,issuedOn:date,supply:money,vat:money,evidence:text,reference:text}).strict(),
 z.object({...base,...target,action:z.literal("receive"),amount:money.refine(v=>v>0),receivedOn:date,reference:text,evidence:text}).strict(),
 z.object({...base,...target,action:z.literal("cancel"),reason:text}).strict(),
]);
export type SalesCommand=z.infer<typeof salesCommand>;
export type SalesRecord={id:string;kind:"inquiry"|"quote"|"contract"|"client"|"invoice"|"receipt";parentId:string|null;version:number;data:{customerKey:string;name:string;status:"active"|"cancelled";clientId?:string;original?:string;supply?:number;vat?:number;evidence?:string;month?:string;issuedOn?:string;amount?:number;receivedOn?:string;reference?:string;reason?:string}};
export function received(records:SalesRecord[],id:string){return records.filter(r=>r.kind==="receipt"&&r.parentId===id&&r.data.status==="active").reduce((sum,r)=>sum+(r.data.amount??0),0);}
/** Pure transaction plan. No external notifications, files, transfers or automatic revenue recognition. */
export function planSales(records:SalesRecord[],c:SalesCommand,newId:string):SalesRecord[]{
 const next=structuredClone(records);
 const parent="id" in c?next.find(r=>r.id===c.id):undefined;
 if("id" in c&&(!parent||parent.version!==c.version))throw new SalesError(409,"기록이 변경되었습니다. 새로고침 후 확인하세요.");
 if(parent?.data.status==="cancelled")throw new SalesError(409,"취소된 기록입니다.");
 const requireKind=(kind:SalesRecord["kind"])=>{if(parent?.kind!==kind)throw new SalesError(409,"업무 단계가 다릅니다.");};
 const add=(kind:SalesRecord["kind"],data:Partial<SalesRecord["data"]>={})=>{
  if(!parent)throw new SalesError(409,"원본 기록이 없습니다.");
  const row:SalesRecord={id:newId,kind,parentId:parent.id,version:1,data:{customerKey:parent.data.customerKey,name:parent.data.name,status:"active",...data}};
  next.push(row);parent.version++;return row;
 };
 switch(c.action){
 case "inquiry":next.push({id:newId,kind:"inquiry",parentId:null,version:1,data:{customerKey:c.customerKey,name:c.name,status:"active",original:c.original}});break;
 case "quote":requireKind("inquiry");if(next.some(r=>r.parentId===parent!.id&&r.kind==="quote"&&r.data.status==="active"))throw new SalesError(409,"이미 견적이 있습니다. 정정 기능을 사용하세요.");add("quote",{supply:c.supply,vat:c.vat,evidence:c.evidence});break;
 case "contract":requireKind("quote");if(next.some(r=>r.parentId===parent!.id&&r.kind==="contract"))throw new SalesError(409,"이미 계약 전환 기록이 있습니다.");add("contract",{evidence:c.evidence,supply:parent!.data.supply,vat:parent!.data.vat});break;
 case "client":{
  requireKind("contract");if(parent!.data.clientId)throw new SalesError(409,"이미 거래처에 연결된 계약입니다.");
  const existing=next.find(r=>r.kind==="client"&&r.data.customerKey===parent!.data.customerKey);
  if(existing?.data.status==="cancelled")throw new SalesError(409,"취소된 거래처의 재개 검토가 필요합니다.");
  if(existing){parent!.data.clientId=existing.id;parent!.version++;}
  else{const client=add("client");parent!.data.clientId=client.id;}
  break;
 }
 case "invoice":requireKind("client");if(next.some(r=>r.kind==="invoice"&&r.parentId===parent!.id&&r.data.reference===c.reference))throw new SalesError(409,"청구 참조번호가 중복됩니다.");add("invoice",{month:c.month,issuedOn:c.issuedOn,supply:c.supply,vat:c.vat,evidence:c.evidence,reference:c.reference});break;
 case "receive":requireKind("invoice");if(next.some(r=>r.kind==="receipt"&&r.data.reference===c.reference))throw new SalesError(409,"수금 참조번호가 중복됩니다.");if(received(next,parent!.id)+c.amount>(parent!.data.supply??0)+(parent!.data.vat??0))throw new SalesError(409,"청구액을 초과하는 수금입니다.");add("receipt",{amount:c.amount,receivedOn:c.receivedOn,reference:c.reference,evidence:c.evidence});break;
 case "revise":if(!parent||!["quote","invoice"].includes(parent.kind))throw new SalesError(409,"정정할 수 없는 단계입니다.");if(parent.kind==="quote"&&next.some(r=>r.parentId===parent.id))throw new SalesError(409,"계약된 견적은 수정할 수 없습니다.");if(parent.kind==="invoice"&&received(next,parent.id)>c.supply+c.vat)throw new SalesError(409,"수금액보다 작은 청구액으로 정정할 수 없습니다.");Object.assign(parent.data,{supply:c.supply,vat:c.vat,reason:c.reason,evidence:c.evidence});parent.version++;break;
 case "cancel":if(!parent)throw new SalesError(409,"기록이 없습니다.");if(next.some(r=>(r.parentId===parent.id||r.data.clientId===parent.id)&&r.data.status==="active"&&!(parent.kind==="contract"&&r.kind==="client")))throw new SalesError(409,"활성 하위 기록을 먼저 검토·취소하세요.");parent.data.status="cancelled";parent.data.reason=c.reason;parent.version++;break;
 }
 return next;
}

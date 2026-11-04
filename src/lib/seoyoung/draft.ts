import {z} from 'zod';
import {initialState,invoiceKey,type State} from './settlement';
const text=z.string().max(500),key=z.string().min(1).max(180).refine(v=>!['__proto__','prototype','constructor'].includes(v));
const count=z.number().int().min(0).max(1000000000),nullable=count.nullable();
const record=<T extends z.ZodTypeAny>(schema:T)=>z.record(key,schema);
const row=z.object({id:key,fileHash:z.string().regex(/^[a-f0-9]{64}$/),fileName:z.string().regex(/^source-[a-f0-9]{12}\.xlsx$/),sheet:z.string().regex(/^SHEET\d+$/),line:count,item:text,quantity:nullable,invoice:z.string().regex(/^(INV-\d+)?$/),boxType:text,boxUse:text,packing:text,combined:text,issues:z.array(text).max(20)}).strict();
export const draftStateSchema=z.object({version:z.literal(1),month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),files:z.array(z.object({hash:z.string().regex(/^[a-f0-9]{64}$/),name:z.string().regex(/^source-[a-f0-9]{12}\.xlsx$/),rows:count}).strict()).max(120),rows:z.array(row).max(50000),classification:record(z.object({category:z.enum(['unclassified','general','1P','2P','3P']),work:z.enum(['none','1P','2P','2P_COSTCO','3P','unknown']),reason:text}).strict()),decisions:record(z.object({exclude:z.boolean(),reason:text,duplicateConfirmed:z.boolean().optional(),workQuantity:nullable.optional()}).strict()),parcels:record(z.object({reviewed:z.boolean(),exclude:z.boolean(),reason:text,outbound:z.enum(['general','set_excluded','unknown']),size:z.enum(['unknown','tiny','small','medium','large']),sizeEvidence:z.enum(['original','historical','unknown','manual']),boxCount:nullable,packing:nullable,boxTiny:nullable,boxSmall:nullable}).strict()),rates:z.array(z.object({code:key,label:text,unit:text,value:nullable,confirmed:z.boolean(),source:text}).strict()).length(12),extras:z.array(z.object({code:key,label:text,quantity:z.number().int().min(-1000000000).max(1000000000).nullable(),rate:nullable,confirmed:z.boolean(),reason:text}).strict()).length(12),periodConfirmed:z.boolean(),extrasReviewed:z.boolean(),vatRounding:z.enum(['unconfirmed','floor','round','ceil']),revision:count,approvedRevision:z.null(),history:z.array(z.never()).max(0)}).strict().superRefine((s,ctx)=>{
 const base=initialState(s.month);const codes=(a:{code:string}[])=>a.map(x=>x.code).sort().join('|');
 if(codes(s.rates)!==codes(base.rates)||codes(s.extras)!==codes(base.extras))ctx.addIssue({code:'custom',message:'항목 코드 불일치'});
 const ids=new Set(s.rows.map(r=>r.id));if(ids.size!==s.rows.length||Object.keys(s.decisions).some(id=>!ids.has(id)))ctx.addIssue({code:'custom',message:'원본 행 연결 불일치'});
 const invoices=new Set(s.rows.map(r=>invoiceKey(r.invoice)));if(Object.keys(s.parcels).some(id=>!invoices.has(id)))ctx.addIssue({code:'custom',message:'송장 연결 불일치'});
 if(new Set(s.files.map(f=>f.hash)).size!==s.files.length||s.rows.some(r=>!s.files.some(f=>f.hash===r.fileHash)))ctx.addIssue({code:'custom',message:'원본 파일 연결 불일치'});
});
export type DraftRecord={month:string;version:number;status:'draft'|'reviewed';state:State;updatedAt:string;updatedBy:string};
export const draftCommandSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('save'),key:z.string().uuid(),expectedVersion:count,state:draftStateSchema}).strict(),
 z.object({action:z.literal('review'),key:z.string().uuid(),expectedVersion:count,month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)}).strict(),
]);
/** Minimize BEFORE sending: no raw invoice numbers, file names, sheet names or source workbook bytes. */
export function minimizeDraft(s:State):State{
 const n=structuredClone(s),invoices=new Map<string,string>(),sheets=new Map<string,string>(),ids=new Map<string,string>();
 for(const r of s.rows){const inv=invoiceKey(r.invoice);if(inv&&!invoices.has(inv))invoices.set(inv,'INV-'+(invoices.size+1));const sheet=r.fileHash+':'+r.sheet;if(!sheets.has(sheet))sheets.set(sheet,'SHEET'+(sheets.size+1));ids.set(r.id,'ROW'+(ids.size+1));}
 n.rows=s.rows.map(r=>({...r,id:ids.get(r.id)!,invoice:invoices.get(invoiceKey(r.invoice))||'',sheet:sheets.get(r.fileHash+':'+r.sheet)!,fileName:'source-'+r.fileHash.slice(0,12)+'.xlsx'}));
 n.files=s.files.map(f=>({...f,name:'source-'+f.hash.slice(0,12)+'.xlsx'}));n.decisions={};for(const [id,d]of Object.entries(s.decisions))if(ids.has(id))n.decisions[ids.get(id)!]=d;
 n.parcels={};for(const [id,p]of Object.entries(s.parcels))if(invoices.has(id))n.parcels[invoiceKey(invoices.get(id)!)]=p;
 n.history=[];n.approvedRevision=null;return n;
}

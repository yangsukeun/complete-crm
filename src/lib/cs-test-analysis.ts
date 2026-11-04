import { z } from 'zod';
export function monthCells(month:string){
 if(!/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(month))return [];
 const [year,m]=month.split('-').map(Number);const offset=new Date(Date.UTC(year,m-1,1)).getUTCDay();const days=new Date(Date.UTC(year,m,0)).getUTCDate();
 return Array.from({length:Math.ceil((offset+days)/7)*7},(_,i)=>{const day=i-offset+1;return day<1||day>days?null:`${month}-${String(day).padStart(2,'0')}`;});
}
export function shiftMonth(month:string,delta:number){if(!monthCells(month).length)return month;const [year,m]=month.split('-').map(Number);const next=new Date(Date.UTC(year,m-1+delta,1)).toISOString().slice(0,7);return monthCells(next).length?next:month;}
const metric=z.number().int().min(0).max(1_000_000_000).nullable();
export const reportRowsSchema=z.array(z.object({sheetId:z.string().min(1).max(128),row:z.number().int().positive(),block:z.string().min(1).max(30),date:z.string().max(30),client:z.string().min(1).max(100),kind:z.enum(['DETAIL','SUBTOTAL','UNENTERED']),channels:z.record(z.string().max(50),metric).refine(v=>Object.keys(v).length>0&&Object.keys(v).length<=30),reportedTotal:metric}).strict()).max(10000);
export type ReportRow=z.infer<typeof reportRowsSchema>[number];
export function analyseReports(rows:ReportRow[],today:string){
 const accepted:{key:string;row:ReportRow;total:number}[]=[];const review:{key:string;reason:string}[]=[];const excluded:{key:string;reason:string}[]=[];
 const groups=new Map<string,ReportRow[]>();for(const row of rows){const key=JSON.stringify([row.sheetId,row.row,row.block]);groups.set(key,[...(groups.get(key)??[]),row]);}
 for(const [key,group] of groups){const row=group[0];if(group.some(r=>JSON.stringify(r)!==JSON.stringify(row))){review.push({key,reason:'같은 원본 위치의 값 충돌'});continue;}if(group.length>1)excluded.push({key,reason:`동일 원본 반복 ${group.length-1}건`});
  if(row.kind!=='DETAIL'){excluded.push({key,reason:row.kind==='SUBTOTAL'?'합계행 제외':'미입력행 제외'});continue;}
  const d=new Date(row.date+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isFinite(+d)||d.toISOString().slice(0,10)!==row.date){review.push({key,reason:'날짜 미확인'});continue;}
  const values=Object.values(row.channels);if(values.every(v=>v===null)){excluded.push({key,reason:row.date>today?'미래 빈 날짜':'미입력 날짜'});continue;}
  if(row.date>today){review.push({key,reason:'미래 날짜에 입력값 존재'});continue;}
  const total=values.reduce<number>((s,v)=>s+(v??0),0);if(row.reportedTotal!==total){review.push({key,reason:`원본 합계 불일치: 원본 ${row.reportedTotal??'빈값'} / 채널 ${total}`});continue;}
  accepted.push({key,row,total});
 }
 const monthly=new Map<string,number>();for(const item of accepted){const k=JSON.stringify([item.row.client,item.row.date.slice(0,7)]);monthly.set(k,(monthly.get(k)??0)+item.total);}
 return {accepted,review,excluded,total:accepted.reduce((s,r)=>s+r.total,0),monthly:[...monthly].map(([k,total])=>{const [client,month]=JSON.parse(k) as string[];return {client,month,total};}).sort((a,b)=>a.month.localeCompare(b.month)||a.client.localeCompare(b.client))};
}
export function basicResponseRate(rows:{received:number;answered:number}[]){
 if(rows.some(r=>!Number.isSafeInteger(r.received)||!Number.isSafeInteger(r.answered)||r.received<0||r.answered<0||r.answered>r.received))throw new Error('유효한 수신·응대 건수를 확인하세요.');
 const received=rows.reduce((s,r)=>s+r.received,0),answered=rows.reduce((s,r)=>s+r.answered,0);return {received,answered,rate:received?answered/received*100:null};
}

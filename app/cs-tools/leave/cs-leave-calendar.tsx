'use client';
import { useState } from 'react';
import { monthCells,shiftMonth } from '@/lib/cs-test-analysis';
import { toKstYmd } from '@/lib/date-kst';
import { csCalendarEntries,type CsCalendarRequest } from '@/lib/cs-leave-calendar';
const labels:Record<string,string>={ANNUAL:'연차',HALF_AM:'오전 반차',HALF_PM:'오후 반차',QUARTER_AM:'오전 반반차',QUARTER_PM:'오후 반반차',SICK_PAID:'유급 병가',SICK_UNPAID:'무급 병가'};
export function CsLeaveCalendar({requests,viewerId}:{requests:CsCalendarRequest[];viewerId:string}) {
 const [month,setMonth]=useState(()=>toKstYmd(new Date()).slice(0,7));
 const cells=monthCells(month);
 const entries=csCalendarEntries(requests,viewerId);
 return <section aria-label="CS 월별 휴가"><div className="mb-4 flex flex-wrap items-center gap-3"><button type="button" className="rounded border px-3 py-2" onClick={()=>setMonth(shiftMonth(month,-1))}>이전 달</button><label>조회 월<input className="rounded border p-2" type="month" value={month} onChange={e=>{if(/^\d{4}-\d{2}$/.test(e.target.value))setMonth(e.target.value);}} min="1900-01" max="2199-12" /></label><button type="button" className="rounded border px-3 py-2" onClick={()=>setMonth(shiftMonth(month,1))}>다음 달</button></div><p className="mb-3 text-sm text-muted-foreground">동료의 승인된 일정과 내 진행 중 신청만 표시합니다. 사유는 달력에 표시하지 않습니다.</p><div className="grid grid-cols-7 gap-1">{['일','월','화','수','목','금','토'].map(d=><div key={d} className="p-2 text-center font-medium">{d}</div>)}{cells.map((date,i)=> <div key={date??`empty-${i}`} className="min-h-28 border-b border-r p-2">{date&&<><time dateTime={date}>{Number(date.slice(-2))}</time>{entries.filter(r=>r.start<=date&&r.end>=date).map(r=><div key={r.id} className={`mt-2 rounded p-1 text-xs ${r.type.includes('QUARTER')?'bg-violet-50':r.type==='HALF_AM'?'bg-emerald-50':r.type==='HALF_PM'?'bg-orange-50':'bg-blue-50'}`}><strong>{r.name}</strong><br/>{labels[r.type]??r.type} · {r.status==='APPROVED'?'승인':r.status==='CANCEL_REQUESTED'?'취소 요청':'결재 대기'}</div>)}</>}</div>)}</div></section>;
}

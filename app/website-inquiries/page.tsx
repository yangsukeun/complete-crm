import {getAppSession} from '@/auth';
import {redirect} from 'next/navigation';
import {getInquiryRuntime} from '@/lib/website-inquiry-http';
export const dynamic='force-dynamic';
export default async function WebsiteInquiries({searchParams}:{searchParams:Promise<{id?:string}>}){
 const actor=(await getAppSession())?.user?.id;if(!actor)redirect('/login');
 const runtime=getInquiryRuntime();
 if(!runtime)return <main className="mx-auto max-w-4xl p-8"><h1 className="text-2xl font-bold">홈페이지 문의 확인</h1><p className="mt-4">CRM 접수 연결 준비 중입니다. 실제 문의 수집과 담당자 알림은 아직 활성화되지 않았습니다.</p></main>;
 const {id}=await searchParams;
 let items;
 try{items=await runtime.service.read(actor,id);}catch{return <main className="p-8">문의를 열 수 없습니다. 접근 권한과 연결 상태를 확인해 주세요.</main>;}
 return <main className="mx-auto max-w-4xl space-y-6 p-8"><h1 className="text-2xl font-bold">홈페이지 문의 확인</h1><p>대표님과 해당 문의의 지정 담당자만 확인할 수 있습니다. 미배정 문의는 대표 확인 대기입니다.</p>{items.length===0&&<p>조회 가능한 문의가 없습니다.</p>}{items.map(item=><article key={item.id} className="rounded-xl border bg-white p-6 text-slate-900"><h2 className="text-lg font-semibold">{item.source_site} · {item.consultation_type}</h2><p>선택 서비스: {(item.selected_services??[item.consultation_type]).join(', ')}</p><p>{item.assignedTo?'담당 지정됨':'미배정 · 대표 확인 대기'} · {item.receivedAt}</p><dl className="my-4"><dt>연락처</dt><dd>{item.contact.name} · {item.contact.company}</dd><dd>{item.contact.phone} · {item.contact.email}</dd></dl><p className="whitespace-pre-wrap break-words">{item.original_message}</p><p className="mt-4 text-sm">내부 알림 생성은 기기 수신·읽음을 의미하지 않습니다. CS 단독 문의 이메일: {item.email?.status??'미설정 또는 대상 아님'}. 메일 접수는 실제 수신·읽음 확인이 아닙니다.</p></article>)}</main>;
}

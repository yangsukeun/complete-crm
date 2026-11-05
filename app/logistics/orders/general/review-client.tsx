'use client';
import {useEffect,useRef,useState} from 'react';
import {ISSUE_LABELS,MAX_FILE_BYTES,type ReviewReport} from '@/lib/avent/general-review';
import './review.css';
type Result={report:ReviewReport;output:ArrayBuffer};
export function GeneralReview(){
 const [source,setSource]=useState<File|null>(null),[reference,setReference]=useState<File|null>(null),[busy,setBusy]=useState(false),[result,setResult]=useState<Result|null>(null),[message,setMessage]=useState('원본 파일을 선택하세요. 파일 내용은 이 브라우저 안에서만 처리됩니다.');
 const generation=useRef(0),running=useRef(false),worker=useRef<Worker|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),urls=useRef<Set<string>>(new Set());
 const inputs=useRef<HTMLFormElement>(null);
 function dispose(){generation.current++;running.current=false;worker.current?.terminate();worker.current=null;if(timer.current)clearTimeout(timer.current);timer.current=null;for(const url of urls.current)URL.revokeObjectURL(url);urls.current.clear();}
 useEffect(()=>()=>{generation.current++;worker.current?.terminate();if(timer.current)clearTimeout(timer.current);for(const url of urls.current)URL.revokeObjectURL(url);},[]);
 function invalidate(text:string){dispose();setBusy(false);setResult(null);setMessage(text);}
 function pick(file:File|null,comparison:boolean){
  invalidate('선택이 바뀌어 이전 결과를 폐기했습니다. 다시 검사하세요.');
  if(file&&(!/\.(xls|xlsx)$/i.test(file.name)||file.size<8||file.size>MAX_FILE_BYTES)){if(comparison)setReference(null);else setSource(null);setMessage('파일은 2MiB 이하의 XLS 또는 XLSX여야 합니다.');return;}
  if(comparison)setReference(file);else setSource(file);
 }
 async function authorized(){try{const r=await fetch('/api/avent/pilot',{method:'GET',credentials:'same-origin',cache:'no-store'});return r.ok;}catch{return false;}}
 async function run(){
  if(running.current||!source)return;
  dispose();const id=generation.current;running.current=true;setBusy(true);setResult(null);setMessage('파일 구조와 원본 행을 검사하고 있습니다.');
  const fail=(text:string)=>{if(generation.current===id)invalidate(text);};
  timer.current=setTimeout(()=>fail('처리 시간이 초과되어 중지했습니다. 더 작은 파일로 나누어 확인하세요.'),10000);
  try{
   if(!await authorized()){fail('로그인 또는 시험 접근 권한을 확인하세요. 파일은 전송되지 않았습니다.');return;}
   if(generation.current!==id)return;
   const buffers=await Promise.all([source.arrayBuffer(),reference?.arrayBuffer()]);
   if(generation.current!==id)return;
   const active=new Worker(new URL('./review-worker.ts',import.meta.url),{type:'module'});worker.current=active;
   active.onerror=event=>{event.preventDefault();fail('파일 처리를 중단했습니다. 지원하는 양식과 파일 크기를 확인하세요.');};
   active.onmessage=event=>{
    if(generation.current!==id)return;
    active.terminate();worker.current=null;if(timer.current)clearTimeout(timer.current);timer.current=null;running.current=false;setBusy(false);
    const data=event.data;
    if(data.ok!==true){setResult(null);setMessage('파일을 읽을 수 없습니다. 30열 단일 시트·수식 없음·외부링크 없음 조건을 확인하세요.');return;}
    setResult({report:data.report,output:data.output});setMessage(data.report.issues.length?'검사가 끝났습니다. 보류 사유를 확인하세요. 결과는 검수 전용입니다.':'기본 구조 검사가 끝났습니다. 상품 매핑의 정답성·일반몰 범위는 별도 확인해야 합니다.');
   };
   const transfer:Transferable[]=[buffers[0]];if(buffers[1])transfer.push(buffers[1]);
   active.postMessage({source:buffers[0],reference:buffers[1]},transfer);
  }catch{fail('파일 처리를 중단했습니다. 원본은 변경하지 않았습니다.');}
 }
 async function download(reportOnly:boolean){
  if(running.current||!result)return;const id=generation.current;running.current=true;setBusy(true);
  try{
   if(!await authorized()){if(generation.current===id)invalidate('접근 권한을 확인할 수 없어 결과를 폐기했습니다. 다시 로그인 후 검사하세요.');return;}
   if(generation.current!==id)return;
   const blob=reportOnly?new Blob([JSON.stringify(result.report,null,2)],{type:'application/json'}):new Blob([result.output],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
   const url=URL.createObjectURL(blob);urls.current.add(url);const a=document.createElement('a');a.href=url;a.download=reportOnly?'AVENT-REVIEW-REPORT-NO-UPLOAD.json':'AVENT-REVIEW-ONLY-NOT-FOR-UPLOAD.xlsx';a.click();
   setTimeout(()=>{URL.revokeObjectURL(url);urls.current.delete(url);},1000);
  }catch{if(generation.current===id)setMessage('다운로드를 준비하지 못했습니다. 다시 시도하세요.');}
  finally{if(generation.current===id){running.current=false;setBusy(false);}}
 }
 const counts=result?Object.entries(result.report.issues.reduce<Record<string,number>>((all,i)=>({...all,[i.code]:(all[i.code]??0)+1}),{})):[];
 return <main className="avent-review" data-sentry-mask>
  <header><p>아벤트 · 일반몰 파일 검수</p><h1>사방넷 원본을 확인하고 검수 자료 만들기</h1><p>주문을 전송하지 않습니다. 이지어드민 업로드 양식이 확인되기 전까지 모든 결과는 검수 전용입니다.</p></header>
  <section className="avent-warning"><h2>검수용 · 업로드 불가</h2><p>30열 사방넷 원본의 행·키·수량을 그대로 보존합니다. 7열 매핑 검토표는 실제 발주 파일이 아닙니다. 세트·사은품 재계산, 상품 자동매핑, 주문 삭제·확정은 하지 않습니다.</p><p>이지오토 결제금액 정리, 스타배송, 직원몰, 네이트온/B2B·외부발주는 별도 업무입니다.</p></section>
  <form ref={inputs} onSubmit={e=>{e.preventDefault();void run();}}>
   <h2>1. 파일 선택</h2><p>단일 시트 XLS/XLSX · 첫 행은 기존 사방넷 30열 · 파일당 2MiB / 5,000행 이하. 수식·셀 오류·하이퍼링크·매크로·외부 연결은 지원하지 않습니다.</p>
   <label>사방넷 원본 <input type="file" accept=".xls,.xlsx" onChange={e=>pick(e.target.files?.[0]??null,false)}/></label>
   <label>비교할 30열 원본 (선택) <input type="file" accept=".xls,.xlsx" onChange={e=>pick(e.target.files?.[0]??null,true)}/></label>
   <p>비교본은 같은 주문 묶음인지 확인하기 위한 자료입니다. 7열 검토본은 비교본으로 받을 수 없습니다. 선택하지 않으면 배치 일치와 과거 처리 여부는 확인하지 않습니다.</p>
   <div className="avent-actions"><button type="submit" disabled={!source||busy}>파일 검사 시작</button><button type="button" disabled={!busy} onClick={()=>invalidate('중지하고 결과를 폐기했습니다. 원본 파일은 변경하지 않았습니다.')}>중지</button><button type="button" onClick={()=>{invalidate('선택과 결과를 비웠습니다.');setSource(null);setReference(null);inputs.current?.reset();}}>선택·결과 비우기</button></div>
  </form>
  <p role="status" aria-live="polite">{message}</p>
  {result&&<section><h2>2. 예외와 차이 검토</h2><p>원본 {result.report.rows.toLocaleString()}행 · 검토 항목 {result.report.issues.length.toLocaleString()}개 · 비교본: {result.report.reference==='not_provided'?'미제공':result.report.reference==='same_batch'?'주문·품목 구성 일치':'다른 배치 — 보류'}</p>
   <p>원본 행 수량 합은 세트 분리로 반복될 수 있어 실제 판매주문 총계가 아닙니다. 주문수량과 출고수량 차이는 자동 보정하지 않습니다. 송장 공란으로 주문상태를 추정하지 않습니다.</p>
   {counts.length>0?<ul>{counts.map(([code,count])=><li key={code}>{ISSUE_LABELS[code as keyof typeof ISSUE_LABELS]}: {count}건</li>)}</ul>:<p>기본 검사의 예외가 없습니다. 발주 가능 또는 승인 완료를 의미하지 않습니다.</p>}
   <div className="avent-table"><table><caption>채널별 원본 행 합계 — 채널명은 검수용 Excel의 채널대조 시트 참조</caption><thead><tr><th>채널 참조</th><th>행 수</th><th>원본 행 주문수량 합</th><th>원본 행 출고수량 합</th></tr></thead><tbody>{result.report.channels.map(c=><tr key={c.name}><td>{c.name}</td><td>{c.rows}</td><td>{c.orderQuantity??'오류 확인'}</td><td>{c.shipmentQuantity??'오류 확인'}</td></tr>)}</tbody></table></div>
   <details><summary>원본 행별 검토 항목 (최대 100개 표시)</summary><ul>{result.report.issues.slice(0,100).map((issue,i)=><li key={`${issue.code}-${issue.row??i}`}>{issue.row?`Excel ${issue.row}행`:'전체 배치'}: {ISSUE_LABELS[issue.code]}</li>)}</ul></details>
   <h2>3. 검수 자료 받기</h2><p>보류가 있어도 원본 추적용 자료를 받을 수 있습니다. 첫 시트에 업로드 금지를 표시하며 원본 행을 삭제하지 않습니다. 보고서에는 고객 셀 값·파일명·주문키를 넣지 않습니다.</p>
   <div className="avent-actions"><button disabled={busy} onClick={()=>void download(false)}>검수용 Excel 받기 · 업로드 금지</button><button disabled={busy} onClick={()=>void download(true)}>검수 보고서 받기</button></div>
   <p>검수용 Excel에는 원본 고객정보가 포함됩니다. 본인 PC의 저장 위치와 공유 대상을 확인하세요. 새 파일 선택·중지·페이지 이동 시 화면 결과를 폐기하며 서버에 파일이나 승인 이력을 저장하지 않습니다.</p>
  </section>}
  <footer><a href="/logistics/orders">기존 합성 결제금액 시험</a><span> · </span><a href="/logistics">3PL 홈</a></footer>
 </main>;
}

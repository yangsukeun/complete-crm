'use client';
import {useState} from 'react';
export function PilotUpload({ready,companyId}:{ready:boolean;companyId:string}){
 const [file,setFile]=useState<File|null>(null),[kind,setKind]=useState<'box'|'statement'>('box'),[synthetic,setSynthetic]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function upload(){if(!file||!synthetic||!ready||busy)return;setBusy(true);try{
  if(!['image/jpeg','image/png'].includes(file.type)||file.size>3*1024*1024||file.size===0)throw Error('합성 JPG/PNG 3MiB 이하만 업로드할 수 있습니다.');
  const bytes=await file.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
  const storageKey=`ocr-synthetic-request:${companyId}:${kind}:${hash}`;let key=sessionStorage.getItem(storageKey);if(!key){key=crypto.randomUUID();sessionStorage.setItem(storageKey,key);}
  const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('파일 읽기 실패'));reader.readAsDataURL(file);});
  const response=await fetch('/api/logistics-ocr/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({companyId,kind,requestKey:key,mimeType:file.type,base64})});
  const result=await response.json();if(!response.ok)throw Error(result.error??'저장 결과를 확인할 수 없습니다.');
  setMessage(`CRM 저장 확인 · 검수 번호 ${result.id} · 버전 ${result.revision}. OCR 완료나 ERP 입고가 아닙니다. 아래 검수 번호로 상태를 확인하세요.`);
 }catch(error){setMessage((error instanceof Error?error.message:'결과 불확실')+' 같은 파일·종류로 다시 선택하면 기존 요청 키를 사용합니다. 새 접수로 바꾸지 마세요.');}finally{setBusy(false);}}
 return <section className="space-y-3 rounded-xl border p-5"><h2 className="text-xl font-bold">대표 PC 합성 파일럿 업로드</h2><p>{ready?'서버 준비 조건 확인됨. 장치 연결을 먼저 완료하세요.':'운영 연결 비활성: 버킷·스키마·기존 서버 연결 검증이 필요합니다.'}</p><a className="underline" href="/logistics/ocr/device">대표 PC 일회 연결 확인</a><label className="block">합성 원본 JPG/PNG · 최대3MiB<input className="block py-2" type="file" accept="image/jpeg,image/png" disabled={!ready||busy} onChange={e=>{setFile(e.target.files?.[0]??null);setSynthetic(false);}}/></label><label className="block">문서 종류<select className="ml-2 border p-2" value={kind} disabled={busy} onChange={e=>setKind(e.target.value as 'box'|'statement')}><option value="box">박스사진</option><option value="statement">명세서</option></select></label><label className="flex gap-2"><input type="checkbox" checked={synthetic} onChange={e=>setSynthetic(e.target.checked)}/>실제 고객·직원 정보가 없는 합성 자료임을 확인했습니다.</label><button disabled={!ready||!file||!synthetic||busy} onClick={upload} className="rounded bg-violet-700 px-4 py-3 text-white disabled:opacity-50">{busy?'저장 확인 중':'합성 원본 저장·OCR 대기 등록'}</button><p role="status" className="break-words">{message}</p></section>;
}

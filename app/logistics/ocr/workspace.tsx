"use client";
import {InternalReviewPanel} from './review-panel';
import Link from 'next/link';
import Image from 'next/image';
import {useEffect,useState} from 'react';
import {validateLocalOcrPhoto} from '../../../src/lib/logistics-ocr';
export function OcrWorkspace(){
 const [photo,setPhoto]=useState<File|null>(null),[url,setUrl]=useState(''),[error,setError]=useState('');
 useEffect(()=>()=>{if(url)URL.revokeObjectURL(url);},[url]);
 return <main className="mx-auto max-w-5xl space-y-6 p-4 md:p-8"><Link href="/logistics">← 3PL 운영실</Link><header className="rounded-xl bg-purple-800 p-6 text-white"><p>COMPLETE · 3PL</p><h1 className="text-3xl font-bold text-white">사진 입고 검수</h1><p>사진 확인 → OCR 처리 → 담당자 검수 → ERP 입고 결과 확인</p></header>
 <p role="status" className="rounded border border-amber-500 bg-amber-50 p-4 text-slate-900">아래 사진 선택은 브라우저 미리보기 전용입니다. 별도의 대표 합성 파일럿 업로드는 준비 조건이 확인된 경우에만 사용할 수 있습니다. 실제 거래처 연결과 ERP 입고·재고 반영은 아직 완료되지 않았습니다.</p>
 <section className="grid gap-5 md:grid-cols-2"><div className="min-w-0 space-y-3 rounded-xl border p-4"><h2 className="text-xl font-bold">1. 박스 원본사진</h2><label className="block">사진 선택 — 15MB 이하 JPG·PNG·WebP<input className="block w-full py-3" type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0];if(!file)return;try{validateLocalOcrPhoto(file);setUrl(URL.createObjectURL(file));setPhoto(file);setError('');}catch(err){setPhoto(null);setUrl('');setError(err instanceof Error?err.message:'사진을 확인하세요.');e.target.value='';}}}/></label>{photo&&url&&<><Image unoptimized width={640} height={480} src={url} alt="선택한 박스 원본사진 — 로컬 미리보기" className="max-h-80 max-w-full rounded object-contain"/><p className="break-all">{photo.name}</p><button className="min-h-11 underline" onClick={()=>{setPhoto(null);setUrl('');}}>사진 지우기</button></>}<p role="alert">{error}</p><button disabled className="min-h-11 rounded bg-slate-200 px-4 text-slate-600">업로드·OCR 요청 — 연결 대기</button></div>
 <div className="space-y-4 rounded-xl border p-4"><h2 className="text-xl font-bold">2. 담당자 검수</h2><p>고객사·상품/SKU·입고 로트·수량·단위·유통기한을 원본사진과 대조합니다. 바코드에서 수량이나 유통기한을 추정하지 않습니다.</p><p>아직 연결된 검수 기록이 없습니다. OCR 결과를 성공으로 표시하거나 합성 결과로 대신하지 않습니다.</p><button disabled className="min-h-11 rounded bg-slate-200 px-4 text-slate-600">검수 승인 — ERP 인증 연결 대기</button><h2 className="text-xl font-bold">3. 실제 입고 결과</h2><p>ERP 담당자가 최신 검수 내용을 확인하고 입고를 확정해야 합니다. 검수 링크 열기와 입고 완료는 별개입니다.</p><strong>입고 저장 미연결 · 재고 변경 없음</strong></div></section><InternalReviewPanel/></main>;
}

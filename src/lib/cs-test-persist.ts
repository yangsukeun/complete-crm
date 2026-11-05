import { z } from 'zod';
import { reviewSchema } from './cs-complete-test';

export type TestReviewDraft = z.infer<typeof reviewSchema>;
const savedSchema=z.object({id:z.string().regex(/^[a-f0-9]{64}$/),version:z.number().int().positive()});
async function sourceId(review:TestReviewDraft){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(review.source)));
 return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
/** Never retries a write automatically. A lost acknowledgement is resolved by exact readback. */
export async function persistTestReview(fetcher:typeof fetch,raw:TestReviewDraft,expectedVersion:number){
 const review=reviewSchema.parse(raw);const id=await sourceId(review);
 let failure='저장 결과를 확인하지 못했습니다. 변경 초안은 보존됩니다. 다시 저장하거나 서버 사본을 확인하세요.';
 try{
  const response=await fetcher('/api/cs-complete-test',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({review,expectedVersion})});
  if(response.ok){const saved=savedSchema.parse(await response.json());if(saved.id!==id||saved.version!==expectedVersion+1)throw new Error('Unexpected saved identity or version');return saved;}
  if([400,401,403,413].includes(response.status))throw new DefinitiveSaveError(response.status===401?'로그인이 만료되었습니다. 변경 초안을 내려받은 뒤 다시 로그인하세요.':'저장이 거절되었습니다. 변경 초안을 보존하고 계정 권한·자료 형식을 확인하세요.');
  if(response.status===409)failure='다른 직원의 저장과 충돌했습니다. 초안을 내려받고 최신 서버 사본을 다시 열어 대조하세요. 자동으로 덮어쓰지 않았습니다.';
 }catch(e){if(e instanceof DefinitiveSaveError)throw e;}
 try{
  const response=await fetcher('/api/cs-complete-test?id='+id,{cache:'no-store'});
  if(response.ok){const value=await response.json();const saved=savedSchema.parse(value);const actual=reviewSchema.parse(value.payload);
   if(saved.id===id&&saved.version>=expectedVersion+1&&JSON.stringify(actual)===JSON.stringify(review))return saved;
  }
 }catch{/* The draft must remain pending when readback is unavailable. */}
 throw new Error(failure);
}
class DefinitiveSaveError extends Error{}

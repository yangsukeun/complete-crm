export type Source = { id: string; version: number; raw: string; links: { index: number; excerpt: string; reviewed: boolean }[] };
export type Result = { key: string; sourceId: string; sourceVersion: number; index: number; projectId: string; excerpt: string; actorId: string; recordedAt: string; state: 'applied'; processor: 'owner-confirmed' | 'assistant-tool'; aiRead: false };
export type Tx = {
  source(id: string): Promise<Source | null>;
  project(id: string): Promise<{ id: string; deleted: boolean } | null>;
  receipt(key: string): Promise<Result | null>;
  insert(result: Result): Promise<void>;
};
export type Store = { atomic<T>(key: string, body: (tx: Tx) => Promise<T>): Promise<T> };
export class ProcessingError extends Error { constructor(public status: number, message: string) { super(message); } }
/** Private project record service. Store must target a browser-inaccessible owner-only table.
 * This records evidence only; never executes text or changes project progress/status.
 * No model call or delivery to a ChatGPT conversation is claimed.
 */
export async function applyPrivateProjectRecord(store: Store, viewer: {id: string; disabled: boolean} | null,
 ownerId: string, input: {sourceId: string; version: number; index: number; projectId: string; confirmed: boolean}, clock=()=>new Date().toISOString(), processor: Result["processor"]="owner-confirmed"): Promise<Result> {
 if(!viewer)throw new ProcessingError(401,'로그인 필요');
 if(viewer.id!==ownerId||viewer.disabled)throw new ProcessingError(404,'찾을 수 없습니다');
 if(!input.confirmed||!input.projectId)throw new ProcessingError(409,'추가 확인 필요: 정확한 프로젝트와 반영 내용을 확인하세요');
 const key=JSON.stringify([viewer.id,input.sourceId,input.index]);
 return store.atomic(key,async tx=>{
  const source=await tx.source(input.sourceId);
  if(!source||source.version!==input.version)throw new ProcessingError(409,'원문 분류가 변경되었습니다. 다시 확인하세요');
  const link=source.links.find(l=>l.index===input.index);
  if(!link?.reviewed)throw new ProcessingError(409,'추가 확인 필요: 원문 구간 분류 미확인');
  const project=await tx.project(input.projectId);
  if(!project||project.deleted)throw new ProcessingError(409,'추가 확인 필요: 대상 프로젝트 없음/삭제됨');
  const existing=await tx.receipt(key);
  if(existing){
   if(existing.projectId!==input.projectId||existing.sourceVersion!==input.version||existing.excerpt!==link.excerpt)throw new ProcessingError(409,'이미 반영한 기록과 다릅니다. 기존 결과를 먼저 확인하세요');
   return existing;
  }
  const result:Result={key,sourceId:source.id,sourceVersion:source.version,index:input.index,projectId:project.id,excerpt:link.excerpt,actorId:viewer.id,recordedAt:clock(),state:'applied',processor,aiRead:false};
  await tx.insert(result); // Applied only after an atomic durable write succeeds.
  return result;
 });
}

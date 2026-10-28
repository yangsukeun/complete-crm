import {z} from 'zod';
export class OcrBoundaryError extends Error {constructor(public status:number,message:string){super(message);}}
export const resumeRequest=z.object({reviewId:z.string().uuid(),companyId:z.string().uuid(),revision:z.number().int().positive()}).strict();
export type ResumeRequest=z.infer<typeof resumeRequest>;
export type AuthorizedOcrReview={id:string;companyId:string;revision:number;state:'draft'|'processing'|'needs_review'|'approved'|'completed'|'cancelled';canReview:boolean};
/** Implement with fresh ERP authorization, never a browser-supplied profile or cached customer list. */
export interface OcrReviewAdapter {
 verifiedErpOrigin:string;
 getAuthorizedReview(actorId:string,reviewId:string):Promise<AuthorizedOcrReview|null>;
}
export async function resumeOcrReview(adapter:OcrReviewAdapter,actorId:string,input:unknown){
 const parsed=resumeRequest.safeParse(input);if(!parsed.success)throw new OcrBoundaryError(400,'검수 연결 정보를 확인하세요.');
 const c=parsed.data;const row=await adapter.getAuthorizedReview(actorId,c.reviewId);
 if(!row||!row.canReview||row.id!==c.reviewId||row.companyId!==c.companyId)throw new OcrBoundaryError(403,'해당 고객사 검수 권한이 없습니다.');
 if(row.revision!==c.revision)throw new OcrBoundaryError(409,'검수 내용이 변경되었습니다. 최신 기록을 다시 확인하세요.');
 if(!['draft','needs_review'].includes(row.state))throw new OcrBoundaryError(409,'현재 상태에서는 검수를 재개할 수 없습니다.');
 const origin=new URL(adapter.verifiedErpOrigin);
 if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash||/^(localhost|127\.|0\.|\[::1\])/.test(origin.hostname))throw new OcrBoundaryError(503,'검증된 ERP 주소가 연결되지 않았습니다.');
 const url=new URL('/inbound/photo/resume',origin);url.searchParams.set('review',row.id);url.searchParams.set('company',row.companyId);url.searchParams.set('revision',String(row.revision));
 return {url:url.href,nextAction:'review-in-erp' as const,registrationAuthorized:false as const};
}
export function validateLocalOcrPhoto(file:{size:number;type:string}){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size<=0||file.size>15*1024*1024)throw new OcrBoundaryError(400,'15MB 이하 JPG·PNG·WebP 사진을 선택하세요.');
}

import {createHash} from 'node:crypto';
import {OcrBoundaryError} from './logistics-ocr';
export type DeviceGrant={deviceId:string;companyId:string;active:boolean;expiresAt:number};
export type QueueLease={jobId:string;companyId:string;deviceId:string;documentId:string;revision:number;leaseId:string;expiresAt:number;cancelled:boolean;documentRevision:number;state:'leased'|'needs_review'|'cancelled'};
export type ResultReceipt={jobId:string;leaseId:string;resultDigest:string;status:'needs_review'};
export function assertCurrentLease(grant:DeviceGrant,lease:QueueLease,now:number){
 if(!grant.active||grant.expiresAt<=now||grant.deviceId!==lease.deviceId||grant.companyId!==lease.companyId)throw new OcrBoundaryError(403,'장치 범위가 유효하지 않습니다.');
 if(lease.cancelled||lease.state==='cancelled'||lease.expiresAt<=now||lease.revision!==lease.documentRevision)throw new OcrBoundaryError(409,'배정이 만료되거나 문서가 변경되었습니다.');
}
/** Must run under a durable transaction/row lock together with fresh device and document reads.
 * No runtime store, credential issuer, upload or inventory interface is provided here. */
export function planResultReceipt(input:{grant:DeviceGrant;lease:QueueLease;leaseId:string;revision:number;resultDigest:string;result:unknown;existing:ResultReceipt|null;now:number;validateResult:(result:unknown)=>void}){
 const {grant,lease,existing}=input;assertCurrentLease(grant,lease,input.now);
 if(input.leaseId!==lease.leaseId||input.revision!==lease.revision)throw new OcrBoundaryError(409,'배정 버전이 다릅니다.');
 const json=JSON.stringify(input.result);
 if(!json||Buffer.byteLength(json)>512*1024)throw new OcrBoundaryError(413,'결과 크기를 확인하세요.');
 input.validateResult(input.result); // exact worker schema, including observations/quality; supplied by integration
 const result=input.result as {status?:unknown;registrationAuthorized?:unknown;extraction?:{provider?:unknown;connected?:unknown}};
 if(result.status!=='needs_review'||result.registrationAuthorized!==false||result.extraction?.provider!=='windows-local'||result.extraction.connected!==true)throw new OcrBoundaryError(400,'검수 후보 결과만 허용됩니다.');
 const digest=createHash('sha256').update(json).digest('hex');
 if(digest!==input.resultDigest)throw new OcrBoundaryError(400,'결과 해시가 다릅니다.');
 if(existing){if(existing.jobId!==lease.jobId||existing.leaseId!==lease.leaseId||existing.resultDigest!==digest)throw new OcrBoundaryError(409,'이미 수락한 결과와 다릅니다.');return{receipt:existing,write:false as const};}
 if(lease.state!=='leased')throw new OcrBoundaryError(409,'결과를 제출할 수 없는 상태입니다.');
 return{receipt:{jobId:lease.jobId,leaseId:lease.leaseId,resultDigest:digest,status:'needs_review' as const},write:true as const};
}

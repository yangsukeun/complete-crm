import {getInternalOcrRuntime,reviewHttp} from '@/lib/ocr-internal-http';
export const dynamic='force-dynamic';
async function handle(request:Request,{params}:{params:Promise<{id:string;action:string}>}){const {id,action}=await params;if(!['read','original','review','cancel','retry'].includes(action))return new Response(null,{status:404});return reviewHttp(request,id,action as 'read'|'original'|'review'|'cancel'|'retry',await getInternalOcrRuntime());}
export {handle as GET,handle as POST};

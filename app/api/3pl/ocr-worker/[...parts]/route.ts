import {getInternalOcrRuntime,workerHttp} from '@/lib/ocr-internal-http';
export const dynamic='force-dynamic';
async function handle(request:Request,{params}:{params:Promise<{parts:string[]}>}){return workerHttp(request,(await params).parts,await getInternalOcrRuntime());}
export {handle as GET,handle as POST};

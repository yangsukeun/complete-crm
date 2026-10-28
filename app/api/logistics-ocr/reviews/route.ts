import {getInternalOcrRuntime,uploadHttp} from '@/lib/ocr-internal-http';
export const dynamic='force-dynamic';
export async function POST(request:Request){return uploadHttp(request,await getInternalOcrRuntime());}

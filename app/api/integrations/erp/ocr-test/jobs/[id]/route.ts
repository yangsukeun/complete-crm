import {testBridgeHttp} from '@/lib/erp-ocr-test-http';
export const dynamic='force-dynamic';
export async function GET(r:Request,{params}:{params:Promise<{id:string}>}){return testBridgeHttp(r,(await params).id);}

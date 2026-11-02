import {testBridgeHttp} from '@/lib/erp-ocr-test-http';
export const dynamic='force-dynamic';
export async function POST(r:Request){return testBridgeHttp(r,null);}

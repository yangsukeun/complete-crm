import {getAppSession} from '@/auth';
import {deviceIssuerHttp,getDeviceIssuer} from '@/lib/ocr-device-issuer-http';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{id:string;action:string}>}){const {id,action}=await params;return deviceIssuerHttp(request,id,action,action==='delivery'?null:(await getAppSession())?.user?.id??null,await getDeviceIssuer());}

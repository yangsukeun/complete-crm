import {getInquiryRuntime,inquiryPost} from '@/lib/website-inquiry-http';
export const runtime='nodejs';
export async function POST(request:Request){return inquiryPost(request,getInquiryRuntime());}

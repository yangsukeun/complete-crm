import {getAppSession} from '@/auth';
import prisma from '@/lib/prisma';
import {notFound,redirect} from 'next/navigation';
import {requireSalesUser} from '@/lib/logistics-sales';
import {OcrWorkspace} from './workspace';
import {PilotUpload} from './pilot-upload';
import {OCR_PILOT} from '@/lib/ocr-device-issuer';
import {getProductionOcrBundle} from '@/lib/ocr-production-runtime';
export const dynamic='force-dynamic';
export default async function Page(){const id=(await getAppSession())?.user?.id;if(!id)redirect('/login');const user=await prisma.user.findUnique({where:{id},select:{id:true,department:true,accountDisabled:true}});try{requireSalesUser(user);}catch{notFound();}return <>{id===OCR_PILOT.owner&&<div className="mx-auto max-w-5xl p-4"><PilotUpload ready={!!await getProductionOcrBundle()} companyId={OCR_PILOT.companyId}/></div>}<OcrWorkspace/></>;}

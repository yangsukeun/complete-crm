import { redirect, notFound } from 'next/navigation';
import { getAppSession } from '@/auth';
import prisma from '@/lib/prisma';
import { canUseCsCompleteTest } from '@/lib/cs-complete-test';
import { CsCompleteTestClient } from './test-client';
export const dynamic='force-dynamic';
export default async function CsCompleteTestPage(){
 const session=await getAppSession();if(!session?.user?.id)redirect('/login');
 const actor=await prisma.user.findUnique({where:{id:session.user.id},select:{role:true,department:true,accountDisabled:true}});
 if(!canUseCsCompleteTest(actor))notFound();
 return <CsCompleteTestClient />;
}

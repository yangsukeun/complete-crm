import {getAppSession} from '@/auth';
import prisma from '@/lib/prisma';
import {notFound,redirect} from 'next/navigation';
import {requireSalesUser} from '@/lib/logistics-sales';
import {SettlementPanel} from './settlement-panel';
export const dynamic='force-dynamic';
export default async function Page(){const id=(await getAppSession())?.user?.id;if(!id)redirect('/login');const user=await prisma.user.findUnique({where:{id},select:{id:true,department:true,accountDisabled:true}});try{requireSalesUser(user);}catch{notFound();}return <SettlementPanel/>;}

import {getAppSession} from '@/auth';
import prisma from '@/lib/prisma';
import {notFound,redirect} from 'next/navigation';
import {isAventPilotId,canAccessAventPilot} from '@/lib/avent/pilot-access';
import {OwnerPilot} from './owner-pilot-client';
export const dynamic='force-dynamic';
export default async function Page(){const id=(await getAppSession())?.user?.id;if(!id)redirect('/login');if(!isAventPilotId(id))notFound();const user=await prisma.user.findUnique({where:{id},select:{id:true,accountDisabled:true}});if(user?.id!==id||!canAccessAventPilot(user))notFound();return <OwnerPilot/>;}

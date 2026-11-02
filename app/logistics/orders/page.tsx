import {getAppSession} from '@/auth';
import prisma from '@/lib/prisma';
import {notFound,redirect} from 'next/navigation';
import {WORKSPACE_OWNER} from '@/lib/workspace-areas';
import {OwnerPilot} from './owner-pilot-client';
export const dynamic='force-dynamic';
export default async function Page(){const id=(await getAppSession())?.user?.id;if(!id)redirect('/login');if(id!==WORKSPACE_OWNER)notFound();const user=await prisma.user.findUnique({where:{id},select:{id:true,accountDisabled:true}});if(!user||user.accountDisabled)notFound();return <OwnerPilot/>;}

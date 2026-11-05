import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { notFound,redirect } from "next/navigation";
import { workspaceAreas,WORKSPACE_OWNER,type WorkspaceArea } from "@/lib/workspace-areas";
import {workspacePageAreas} from "@/lib/workspace-page-access";
import {canAccessAventPilot} from '@/lib/avent/pilot-access';
import { WorkspaceHome } from "@/components/workspace-home";
export const dynamic="force-dynamic";
export default async function Page({params}:{params:Promise<{area:string}>}){const s=await getAppSession();if(!s?.user?.id)redirect("/login");const user=await prisma.user.findUnique({where:{id:s.user.id},select:{id:true,department:true,accountDisabled:true}});if(!user)notFound();const allowed=workspacePageAreas(user);const {area}=await params;if(!allowed.includes(area as WorkspaceArea))notFound();if(area==="cs")redirect("/cs-tools");return <WorkspaceHome area={area as WorkspaceArea} allowed={allowed} owner={user.id===WORKSPACE_OWNER} aventPilot={canAccessAventPilot(user)} limitedAccess={!workspaceAreas(user).includes(area as WorkspaceArea)}/>;}

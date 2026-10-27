import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { notFound,redirect } from "next/navigation";
import { workspaceAreas,WORKSPACE_OWNER,type WorkspaceArea } from "@/lib/workspace-areas";
import { WorkspaceHome } from "@/components/workspace-home";
export const dynamic="force-dynamic";
export default async function Page({params}:{params:Promise<{area:string}>}){const s=await getAppSession();if(!s?.user?.id)redirect("/login");const user=await prisma.user.findUnique({where:{id:s.user.id},select:{id:true,department:true}});if(!user)notFound();const allowed=workspaceAreas(user);const {area}=await params;if(!allowed.includes(area as WorkspaceArea))notFound();return <WorkspaceHome area={area as WorkspaceArea} allowed={allowed} owner={user.id===WORKSPACE_OWNER}/>;}

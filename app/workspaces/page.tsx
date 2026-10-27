import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { workspaceAreas,workspaceLabels } from "@/lib/workspace-areas";
export const dynamic="force-dynamic";
export default async function Page(){const s=await getAppSession();if(!s?.user?.id)redirect("/login");const user=await prisma.user.findUnique({where:{id:s.user.id},select:{id:true,department:true}});const allowed=user?workspaceAreas(user):[];return <main className="p-8"><h1 className="text-2xl font-bold">업무영역</h1><p className="my-4">현재 등록된 부서의 업무영역입니다. 기존 메뉴와 권한은 그대로 유지됩니다.</p><div className="grid gap-4 sm:grid-cols-2">{allowed.map(a=><Link className="rounded-xl border p-6 text-lg" key={a} href={a==="logistics"?"/logistics":`/workspaces/${a}`}>{workspaceLabels[a]} →</Link>)}</div>{allowed.length===0&&<p>등록 부서의 영역 연결을 확인 중입니다. 기존 메뉴를 이용해 주세요.</p>}</main>;}
